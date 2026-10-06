/* Return only the newest matching status for each affiliate lead.

   The event table remains an internal audit log. The public affiliate feed
   collapses that history so an initial sync produces one row per lead, while
   cursor polling still returns a lead again after a newer status is recorded.
*/

CREATE OR REPLACE FUNCTION public.crm_affiliate_lead_events_page(
  p_source_id uuid,
  p_after bigint DEFAULT 0,
  p_limit integer DEFAULT 101,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_date_field text DEFAULT 'event'
)
RETURNS TABLE(
  event_id bigint,
  tracking_id uuid,
  external_id text,
  event_type text,
  affiliate_status text,
  reason_code text,
  account_status text,
  occurred_at timestamptz,
  lead_received_at timestamptz,
  ftd_status boolean,
  ftd_at timestamptz,
  ftd_source text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_after < 0 THEN RAISE EXCEPTION 'Invalid event cursor'; END IF;
  IF p_limit NOT BETWEEN 1 AND 101 THEN RAISE EXCEPTION 'Invalid page limit'; END IF;
  IF p_date_field NOT IN ('event', 'lead', 'ftd') THEN
    RAISE EXCEPTION 'Invalid date field';
  END IF;
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN
    RAISE EXCEPTION 'Invalid date range';
  END IF;

  RETURN QUERY
  WITH matching_events AS (
    SELECT
      e.id,
      e.lead_id,
      e.tracking_id,
      e.external_id,
      e.event_type,
      e.affiliate_status,
      e.reason_code,
      e.account_status,
      e.occurred_at,
      l.created_at AS lead_created_at,
      l.disposition_status,
      l.first_deposit_at
    FROM public.crm_affiliate_lead_events e
    JOIN public.crm_leads l ON l.id = e.lead_id
    WHERE e.source_id = p_source_id
      AND l.source_id = p_source_id
      AND e.id > p_after
      AND (p_date_field <> 'ftd' OR l.first_deposit_at IS NOT NULL)
      AND (p_date_field <> 'ftd' OR e.event_type = 'lead.ftd')
      AND (
        p_from IS NULL
        OR CASE p_date_field
          WHEN 'lead' THEN l.created_at
          WHEN 'ftd' THEN l.first_deposit_at
          ELSE e.occurred_at
        END >= p_from
      )
      AND (
        p_to IS NULL
        OR CASE p_date_field
          WHEN 'lead' THEN l.created_at
          WHEN 'ftd' THEN l.first_deposit_at
          ELSE e.occurred_at
        END <= p_to
      )
  ),
  latest_per_lead AS (
    SELECT DISTINCT ON (m.lead_id) m.*
    FROM matching_events m
    ORDER BY m.lead_id, m.id DESC
  )
  SELECT
    latest.id,
    latest.tracking_id,
    latest.external_id,
    latest.event_type,
    latest.affiliate_status,
    latest.reason_code,
    latest.account_status,
    latest.occurred_at,
    latest.lead_created_at,
    (latest.disposition_status = 'ftd' OR latest.first_deposit_at IS NOT NULL),
    latest.first_deposit_at,
    CASE
      WHEN latest.first_deposit_at IS NOT NULL THEN 'automatic'
      WHEN latest.disposition_status = 'ftd' THEN 'manual'
      ELSE NULL
    END
  FROM latest_per_lead latest
  ORDER BY latest.id ASC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_affiliate_lead_events_page(
  uuid, bigint, integer, timestamptz, timestamptz, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_affiliate_lead_events_page(
  uuid, bigint, integer, timestamptz, timestamptz, text
) TO service_role;

COMMENT ON FUNCTION public.crm_affiliate_lead_events_page(
  uuid, bigint, integer, timestamptz, timestamptz, text
) IS 'Affiliate cursor feed returning only the newest matching status per lead.';

NOTIFY pgrst, 'reload schema';
