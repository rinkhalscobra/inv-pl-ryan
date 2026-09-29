/* Attach affiliate reporting to the real wallet-credit timestamp.

   The source of truth is transactions.balance_processed_at: the wallet trigger
   sets it when a completed deposit is actually applied to the client balance.
   Administrative balance adjustments and sandbox credits are explicitly not
   qualifying FTDs. */

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS first_deposit_at timestamptz;

COMMENT ON COLUMN public.crm_leads.first_deposit_at IS
  'Earliest qualifying completed wallet deposit credit for the linked client; sourced from transactions.balance_processed_at.';

CREATE INDEX IF NOT EXISTS transactions_user_qualifying_deposit_idx
  ON public.transactions(user_id, balance_processed_at)
  WHERE status = 'completed'
    AND type IN ('deposit', 'nowpayments_deposit')
    AND amount > 0
    AND balance_processed_at IS NOT NULL
    AND balance_reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS crm_leads_source_first_deposit_idx
  ON public.crm_leads(source_id, first_deposit_at, affiliate_tracking_id)
  WHERE source_id IS NOT NULL AND first_deposit_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_affiliate_lead_events_source_time_cursor_idx
  ON public.crm_affiliate_lead_events(source_id, occurred_at, id);

CREATE UNIQUE INDEX IF NOT EXISTS crm_affiliate_lead_one_ftd_event_idx
  ON public.crm_affiliate_lead_events(lead_id, event_type)
  WHERE event_type = 'lead.ftd';

ALTER TABLE public.crm_affiliate_lead_events
  DROP CONSTRAINT IF EXISTS crm_affiliate_lead_events_event_type_check,
  ADD CONSTRAINT crm_affiliate_lead_events_event_type_check
    CHECK (event_type IN ('lead.received', 'lead.status_changed', 'lead.ftd'));

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
    AND t.balance_effect->>'external_balance_change' IS DISTINCT FROM 'true';
$$;

REVOKE ALL ON FUNCTION crm_private.first_qualifying_deposit_at(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crm_private.first_qualifying_deposit_at(uuid)
  TO service_role;

/* FTD status changes use the actual first-deposit time as the event time. Other
   CRM state transitions continue to use the time at which they occur. */
CREATE OR REPLACE FUNCTION public.crm_capture_affiliate_lead_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_type text;
  v_occurred_at timestamptz := now();
BEGIN
  IF NEW.source_kind <> 'affiliate_api' OR NEW.source_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_event_type := 'lead.received';
  ELSIF NEW.status IS NOT DISTINCT FROM OLD.status
    AND NEW.disposition_status IS NOT DISTINCT FROM OLD.disposition_status THEN
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
    public.crm_affiliate_status(NEW.status, NEW.disposition_status),
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

CREATE OR REPLACE FUNCTION crm_private.sync_affiliate_lead_ftd(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ftd_at timestamptz;
BEGIN
  v_ftd_at := crm_private.first_qualifying_deposit_at(p_user_id);
  IF v_ftd_at IS NULL THEN RETURN; END IF;

  /* A manually applied FTD label may predate the actual deposit. Emit one
     canonical lead.ftd event when the real wallet credit becomes available. */
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
    v_ftd_at
  FROM public.crm_leads l
  WHERE l.registered_user_id = p_user_id
    AND l.source_kind = 'affiliate_api'
    AND l.source_id IS NOT NULL
    AND l.disposition_status = 'ftd'
    AND (l.first_deposit_at IS NULL OR l.first_deposit_at > v_ftd_at)
    AND NOT EXISTS (
      SELECT 1
      FROM public.crm_affiliate_lead_events e
      WHERE e.lead_id = l.id
        AND e.event_type = 'lead.ftd'
        AND e.occurred_at = v_ftd_at
    )
  ON CONFLICT (lead_id, event_type) WHERE event_type = 'lead.ftd'
  DO NOTHING;

  UPDATE public.crm_leads l
  SET first_deposit_at = LEAST(COALESCE(l.first_deposit_at, v_ftd_at), v_ftd_at),
      disposition_status = 'ftd',
      disposition_changed_at = CASE
        WHEN l.disposition_status IS DISTINCT FROM 'ftd' THEN v_ftd_at
        ELSE l.disposition_changed_at
      END,
      disposition_changed_by = CASE
        WHEN l.disposition_status IS DISTINCT FROM 'ftd' THEN NULL
        ELSE l.disposition_changed_by
      END
  WHERE l.registered_user_id = p_user_id
    AND l.source_kind = 'affiliate_api'
    AND l.source_id IS NOT NULL
    AND (
      l.first_deposit_at IS NULL
      OR l.first_deposit_at > v_ftd_at
      OR l.disposition_status IS DISTINCT FROM 'ftd'
    );
END;
$$;

REVOKE ALL ON FUNCTION crm_private.sync_affiliate_lead_ftd(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crm_private.sync_affiliate_lead_ftd(uuid)
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
     AND NEW.balance_effect->>'external_balance_change' IS DISTINCT FROM 'true' THEN
    PERFORM crm_private.sync_affiliate_lead_ftd(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_capture_qualifying_affiliate_ftd_trigger
  ON public.transactions;
CREATE TRIGGER crm_capture_qualifying_affiliate_ftd_trigger
AFTER INSERT OR UPDATE OF status, type, amount, balance_processed_at, balance_reversed_at
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION crm_private.capture_qualifying_affiliate_ftd();

CREATE OR REPLACE FUNCTION crm_private.sync_linked_affiliate_lead_ftd()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.registered_user_id IS NOT NULL
     AND NEW.registered_user_id IS DISTINCT FROM OLD.registered_user_id THEN
    PERFORM crm_private.sync_affiliate_lead_ftd(NEW.registered_user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_sync_linked_affiliate_lead_ftd_trigger
  ON public.crm_leads;
CREATE TRIGGER crm_sync_linked_affiliate_lead_ftd_trigger
AFTER UPDATE OF registered_user_id
ON public.crm_leads
FOR EACH ROW
EXECUTE FUNCTION crm_private.sync_linked_affiliate_lead_ftd();

/* Backfill through the same synchronization path. This is not derived from the
   manually editable CRM disposition timestamp. */
DO $$
DECLARE
  v_user record;
BEGIN
  FOR v_user IN
    SELECT DISTINCT l.registered_user_id AS id
    FROM public.crm_leads l
    WHERE l.source_kind = 'affiliate_api'
      AND l.source_id IS NOT NULL
      AND l.registered_user_id IS NOT NULL
  LOOP
    PERFORM crm_private.sync_affiliate_lead_ftd(v_user.id);
  END LOOP;
END;
$$;

/* Source-scoped, cursor-ordered page used only after Edge Function key
   authentication. date_field selects the timestamp used by from/to. */
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
  ftd_at timestamptz
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

NOTIFY pgrst, 'reload schema';
