/* Do not publish or create another affiliate update when an internal CRM
   transition leaves the partner-facing status unchanged. A canonical FTD
   event remains meaningful because it adds the authoritative deposit date. */

CREATE OR REPLACE FUNCTION public.crm_capture_affiliate_lead_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_type text;
  v_affiliate_status text;
  v_occurred_at timestamptz := now();
BEGIN
  IF NEW.source_kind <> 'affiliate_api' OR NEW.source_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_affiliate_status := public.crm_affiliate_status(
    NEW.status,
    NEW.disposition_status
  );

  IF TG_OP = 'INSERT' THEN
    v_event_type := 'lead.received';
  ELSIF NEW.status IS NOT DISTINCT FROM OLD.status
    AND NEW.disposition_status IS NOT DISTINCT FROM OLD.disposition_status THEN
    RETURN NEW;
  ELSIF v_affiliate_status IS NOT DISTINCT FROM public.crm_affiliate_status(
    OLD.status,
    OLD.disposition_status
  ) THEN
    /* Internal state changed, but the affiliate already has this status. */
    RETURN NEW;
  ELSE
    v_event_type := 'lead.status_changed';
  END IF;

  IF NEW.disposition_status = 'ftd'
     AND (TG_OP = 'INSERT' OR OLD.disposition_status IS DISTINCT FROM 'ftd')
     AND NEW.first_deposit_at IS NOT NULL THEN
    v_event_type := 'lead.ftd';
    v_occurred_at := NEW.first_deposit_at;
  END IF;

  INSERT INTO public.crm_affiliate_lead_events(
    company_id,
    source_id,
    lead_id,
    tracking_id,
    external_id,
    event_type,
    affiliate_status,
    reason_code,
    account_status,
    occurred_at
  )
  VALUES (
    NEW.company_id,
    NEW.source_id,
    NEW.id,
    NEW.affiliate_tracking_id,
    NULLIF(NEW.external_id, ''),
    v_event_type,
    v_affiliate_status,
    public.crm_affiliate_reason_code(NEW.status, NEW.disposition_status),
    NEW.status,
    v_occurred_at
  )
  ON CONFLICT (lead_id, event_type) WHERE event_type = 'lead.ftd'
  DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_capture_affiliate_lead_event()
  FROM PUBLIC, anon, authenticated;

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
  WITH event_history AS (
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
      l.first_deposit_at,
      lag(e.affiliate_status) OVER (
        PARTITION BY e.lead_id ORDER BY e.id
      ) AS previous_affiliate_status,
      row_number() OVER (
        PARTITION BY e.lead_id ORDER BY e.id
      ) AS event_number
    FROM public.crm_affiliate_lead_events e
    JOIN public.crm_leads l ON l.id = e.lead_id
    WHERE e.source_id = p_source_id
      AND l.source_id = p_source_id
  ),
  matching_events AS (
    SELECT history.*
    FROM event_history history
    WHERE history.id > p_after
      AND (
        history.event_number = 1
        OR history.affiliate_status IS DISTINCT FROM history.previous_affiliate_status
        OR history.event_type = 'lead.ftd'
      )
      AND (p_date_field <> 'ftd' OR history.first_deposit_at IS NOT NULL)
      AND (p_date_field <> 'ftd' OR history.event_type = 'lead.ftd')
      AND (
        p_from IS NULL
        OR CASE p_date_field
          WHEN 'lead' THEN history.lead_created_at
          WHEN 'ftd' THEN history.first_deposit_at
          ELSE history.occurred_at
        END >= p_from
      )
      AND (
        p_to IS NULL
        OR CASE p_date_field
          WHEN 'lead' THEN history.lead_created_at
          WHEN 'ftd' THEN history.first_deposit_at
          ELSE history.occurred_at
        END <= p_to
      )
  ),
  latest_per_lead AS (
    SELECT DISTINCT ON (matching.lead_id) matching.*
    FROM matching_events matching
    ORDER BY matching.lead_id, matching.id DESC
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
) IS 'Affiliate cursor feed returning one newest changed status per lead and suppressing same-status repeats.';

NOTIFY pgrst, 'reload schema';
