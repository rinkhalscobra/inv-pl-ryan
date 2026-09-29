/* Require one authoritative wallet credit of at least 250 USD/USDT equivalent
   for automatic FTD, while retaining audited manual CRM FTD overrides. */

CREATE OR REPLACE FUNCTION crm_private.first_qualifying_deposit_at(p_user_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT min(t.balance_processed_at)
  FROM public.transactions t
  WHERE t.user_id = p_user_id
    AND t.status = 'completed'
    AND t.type IN ('deposit', 'nowpayments_deposit')
    AND t.amount > 0
    AND t.balance_processed_at IS NOT NULL
    AND t.balance_reversed_at IS NULL
    AND t.balance_effect->>'legacy' IS DISTINCT FROM 'true'
    AND t.balance_effect->>'external_balance_change' IS DISTINCT FROM 'true'
    AND CASE
      WHEN jsonb_typeof(t.balance_effect->'ledger_amount') = 'number'
        THEN (t.balance_effect->>'ledger_amount')::numeric
      ELSE 0
    END >= 250;
$$;

REVOKE ALL ON FUNCTION crm_private.first_qualifying_deposit_at(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crm_private.first_qualifying_deposit_at(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION crm_private.capture_qualifying_affiliate_ftd()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'completed'
     AND NEW.type IN ('deposit', 'nowpayments_deposit')
     AND NEW.amount > 0
     AND NEW.balance_processed_at IS NOT NULL
     AND NEW.balance_reversed_at IS NULL
     AND NEW.balance_effect->>'legacy' IS DISTINCT FROM 'true'
     AND NEW.balance_effect->>'external_balance_change' IS DISTINCT FROM 'true'
     AND (CASE
       WHEN jsonb_typeof(NEW.balance_effect->'ledger_amount') = 'number'
         THEN (NEW.balance_effect->>'ledger_amount')::numeric
       ELSE 0
     END) >= 250 THEN
    PERFORM crm_private.sync_affiliate_lead_ftd(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

/* Remove canonical automatic events that no longer meet the new threshold. */
DELETE FROM public.crm_affiliate_lead_events e
USING public.crm_leads l
WHERE e.lead_id = l.id
  AND e.event_type = 'lead.ftd'
  AND e.occurred_at IS DISTINCT FROM
    crm_private.first_qualifying_deposit_at(l.registered_user_id);

/* Recalculate exact dates. An FTD entered by a staff actor remains a valid
   manual override. A system-only sub-threshold FTD is returned to NEW. */
WITH recalculated AS (
  SELECT
    l.id,
    l.first_deposit_at AS previous_ftd_at,
    l.disposition_status AS previous_disposition,
    l.disposition_changed_by AS previous_actor,
    crm_private.first_qualifying_deposit_at(l.registered_user_id) AS ftd_at
  FROM public.crm_leads l
  WHERE l.source_kind = 'affiliate_api'
    AND l.source_id IS NOT NULL
    AND l.registered_user_id IS NOT NULL
)
UPDATE public.crm_leads l
SET first_deposit_at = r.ftd_at,
    disposition_status = CASE
      WHEN r.ftd_at IS NOT NULL THEN 'ftd'
      WHEN r.previous_ftd_at IS NOT NULL
       AND r.previous_disposition = 'ftd'
       AND r.previous_actor IS NULL THEN 'new'
      ELSE r.previous_disposition
    END,
    disposition_changed_at = CASE
      WHEN r.ftd_at IS NOT NULL AND r.previous_disposition IS DISTINCT FROM 'ftd'
        THEN r.ftd_at
      WHEN r.ftd_at IS NULL
       AND r.previous_ftd_at IS NOT NULL
       AND r.previous_disposition = 'ftd'
       AND r.previous_actor IS NULL THEN now()
      ELSE l.disposition_changed_at
    END,
    disposition_changed_by = CASE
      WHEN r.ftd_at IS NOT NULL AND r.previous_disposition IS DISTINCT FROM 'ftd'
        THEN NULL
      ELSE l.disposition_changed_by
    END
FROM recalculated r
WHERE l.id = r.id
  AND (
    l.first_deposit_at IS DISTINCT FROM r.ftd_at
    OR (
      r.ftd_at IS NULL
      AND r.previous_ftd_at IS NOT NULL
      AND r.previous_disposition = 'ftd'
      AND r.previous_actor IS NULL
    )
  );

/* Ensure manually pre-marked leads receive one canonical automatic event once
   a real qualifying deposit exists. */
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
SELECT
  l.company_id,
  l.source_id,
  l.id,
  l.affiliate_tracking_id,
  NULLIF(l.external_id, ''),
  'lead.ftd',
  'converted',
  NULL,
  l.status,
  l.first_deposit_at
FROM public.crm_leads l
WHERE l.source_kind = 'affiliate_api'
  AND l.source_id IS NOT NULL
  AND l.first_deposit_at IS NOT NULL
ON CONFLICT (lead_id, event_type) WHERE event_type = 'lead.ftd'
DO NOTHING;

DROP FUNCTION IF EXISTS public.crm_affiliate_lead_events_page(
  uuid, bigint, integer, timestamptz, timestamptz, text
);

CREATE FUNCTION public.crm_affiliate_lead_events_page(
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
  SELECT
    e.id,
    e.tracking_id,
    e.external_id,
    e.event_type,
    e.affiliate_status,
    e.reason_code,
    e.account_status,
    e.occurred_at,
    l.created_at,
    (l.disposition_status = 'ftd' OR l.first_deposit_at IS NOT NULL),
    l.first_deposit_at,
    CASE
      WHEN l.first_deposit_at IS NOT NULL THEN 'automatic'
      WHEN l.disposition_status = 'ftd' THEN 'manual'
      ELSE NULL
    END
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
  ORDER BY e.id ASC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_affiliate_lead_events_page(
  uuid, bigint, integer, timestamptz, timestamptz, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_affiliate_lead_events_page(
  uuid, bigint, integer, timestamptz, timestamptz, text
) TO service_role;

COMMENT ON FUNCTION crm_private.first_qualifying_deposit_at(uuid) IS
  'Earliest authoritative single wallet credit of at least 250 USD/USDT equivalent.';

NOTIFY pgrst, 'reload schema';
