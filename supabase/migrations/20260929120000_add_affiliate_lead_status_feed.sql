/* Partner-safe lead tracking and an ordered event feed.

   Affiliate keys remain server-only and continue to identify one CRM source.
   The public tracking UUID is intentionally different from the internal lead
   primary key. Status events are written by a trigger so every application
   path that changes a sales disposition or account state is captured. */

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS affiliate_tracking_id uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.crm_leads
SET affiliate_tracking_id = gen_random_uuid()
WHERE affiliate_tracking_id IS NULL;

ALTER TABLE public.crm_leads
  ALTER COLUMN affiliate_tracking_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN affiliate_tracking_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crm_leads_affiliate_tracking_id_idx
  ON public.crm_leads(affiliate_tracking_id);

CREATE INDEX IF NOT EXISTS crm_leads_source_updated_idx
  ON public.crm_leads(source_id, updated_at, affiliate_tracking_id)
  WHERE source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.crm_affiliate_lead_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.crm_lead_sources(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  tracking_id uuid NOT NULL,
  external_id text,
  event_type text NOT NULL CHECK (event_type IN ('lead.received', 'lead.status_changed')),
  affiliate_status text NOT NULL CHECK (
    affiliate_status IN (
      'received',
      'contact_attempted',
      'follow_up',
      'invalid',
      'not_qualified',
      'processing',
      'registered',
      'converted'
    )
  ),
  reason_code text,
  account_status text NOT NULL CHECK (
    account_status IN ('new', 'inviting', 'registered', 'existing')
  ),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_affiliate_lead_events_source_cursor_idx
  ON public.crm_affiliate_lead_events(source_id, id);

CREATE INDEX IF NOT EXISTS crm_affiliate_lead_events_lead_time_idx
  ON public.crm_affiliate_lead_events(lead_id, occurred_at DESC);

ALTER TABLE public.crm_affiliate_lead_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_affiliate_lead_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.crm_affiliate_lead_events TO service_role;

CREATE OR REPLACE FUNCTION public.crm_affiliate_status(
  p_account_status text,
  p_disposition_status text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_disposition_status = 'ftd' THEN 'converted'
    WHEN p_account_status IN ('registered', 'existing') THEN 'registered'
    WHEN p_account_status = 'inviting' THEN 'processing'
    WHEN p_disposition_status = 'wrong_number' THEN 'invalid'
    WHEN p_disposition_status = 'no_answer' THEN 'contact_attempted'
    WHEN p_disposition_status = 'call_back' THEN 'follow_up'
    WHEN p_disposition_status IN ('low_potential', 'no_money') THEN 'not_qualified'
    ELSE 'received'
  END;
$$;

CREATE OR REPLACE FUNCTION public.crm_affiliate_reason_code(
  p_account_status text,
  p_disposition_status text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_disposition_status = 'wrong_number' THEN 'wrong_number'
    WHEN p_disposition_status = 'low_potential' THEN 'low_potential'
    WHEN p_disposition_status = 'no_money' THEN 'no_money'
    WHEN p_account_status = 'existing' THEN 'existing_client'
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.crm_affiliate_status(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_affiliate_reason_code(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_affiliate_status(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_affiliate_reason_code(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.crm_capture_affiliate_lead_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_type text;
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
    now()
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_touch_lead_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_capture_affiliate_lead_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_touch_lead_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS crm_touch_lead_updated_at_trigger ON public.crm_leads;
CREATE TRIGGER crm_touch_lead_updated_at_trigger
BEFORE UPDATE ON public.crm_leads
FOR EACH ROW
EXECUTE FUNCTION public.crm_touch_lead_updated_at();

DROP TRIGGER IF EXISTS crm_capture_affiliate_lead_event_trigger ON public.crm_leads;
CREATE TRIGGER crm_capture_affiliate_lead_event_trigger
AFTER INSERT OR UPDATE OF status, disposition_status ON public.crm_leads
FOR EACH ROW
EXECUTE FUNCTION public.crm_capture_affiliate_lead_event();

/* Give existing affiliate leads a current-state baseline without inventing a
   historical sequence that predates this feed. */
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
  CASE
    WHEN l.status = 'new' AND l.disposition_status = 'new' THEN 'lead.received'
    ELSE 'lead.status_changed'
  END,
  public.crm_affiliate_status(l.status, l.disposition_status),
  public.crm_affiliate_reason_code(l.status, l.disposition_status),
  l.status,
  COALESCE(l.disposition_changed_at, l.created_at, now())
FROM public.crm_leads l
WHERE l.source_kind = 'affiliate_api'
  AND l.source_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.crm_affiliate_lead_events e
    WHERE e.lead_id = l.id
  );

NOTIFY pgrst, 'reload schema';
