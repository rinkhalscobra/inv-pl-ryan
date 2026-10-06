BEGIN;

DO $$
DECLARE
  v_company_id uuid;
  v_source_id uuid;
  v_lead_id uuid;
  v_tracking_id uuid;
  v_event_count bigint;
BEGIN
  SELECT id INTO v_company_id
  FROM public.crm_companies
  ORDER BY created_at
  LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Affiliate status feed test needs one CRM company';
  END IF;

  INSERT INTO public.crm_lead_sources(name, kind, api_key_hash, company_id)
  VALUES (
    'Affiliate status feed test',
    'affiliate_api',
    md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text),
    v_company_id
  )
  RETURNING id INTO v_source_id;

  INSERT INTO public.crm_leads(
    company_id,
    source_id,
    source_kind,
    source_name,
    external_id,
    email
  )
  VALUES (
    v_company_id,
    v_source_id,
    'affiliate_api',
    'Affiliate status feed test',
    'status-feed-test-1',
    'affiliate-status-' || gen_random_uuid()::text || '@example.com'
  )
  RETURNING id, affiliate_tracking_id INTO v_lead_id, v_tracking_id;

  IF v_tracking_id IS NULL THEN
    RAISE EXCEPTION 'Affiliate tracking ID was not generated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.crm_affiliate_lead_events
    WHERE lead_id = v_lead_id
      AND event_type = 'lead.received'
      AND affiliate_status = 'received'
  ) THEN
    RAISE EXCEPTION 'Initial received event was not captured';
  END IF;

  UPDATE public.crm_leads
  SET disposition_status = 'call_back'
  WHERE id = v_lead_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.crm_affiliate_lead_events
    WHERE lead_id = v_lead_id
      AND event_type = 'lead.status_changed'
      AND affiliate_status = 'follow_up'
  ) THEN
    RAISE EXCEPTION 'Follow-up event was not captured';
  END IF;

  UPDATE public.crm_leads
  SET disposition_status = 'ftd'
  WHERE id = v_lead_id;

  IF (
    SELECT affiliate_status
    FROM public.crm_affiliate_lead_events
    WHERE lead_id = v_lead_id
    ORDER BY id DESC
    LIMIT 1
  ) <> 'converted' THEN
    RAISE EXCEPTION 'Converted event was not captured';
  END IF;

  IF public.crm_affiliate_status('existing', 'new') <> 'registered' THEN
    RAISE EXCEPTION 'Existing-client status mapping is incorrect';
  END IF;
  IF public.crm_affiliate_status('inviting', 'new') <> 'processing' THEN
    RAISE EXCEPTION 'Registration-processing status mapping is incorrect';
  END IF;

  UPDATE public.crm_leads
  SET disposition_status = 'low_potential'
  WHERE id = v_lead_id;

  SELECT count(*) INTO v_event_count
  FROM public.crm_affiliate_lead_events
  WHERE lead_id = v_lead_id;

  UPDATE public.crm_leads
  SET disposition_status = 'no_money'
  WHERE id = v_lead_id;

  IF (
    SELECT count(*)
    FROM public.crm_affiliate_lead_events
    WHERE lead_id = v_lead_id
  ) <> v_event_count THEN
    RAISE EXCEPTION 'An unchanged affiliate status created a repeated event';
  END IF;

  IF (
    SELECT count(*)
    FROM public.crm_affiliate_lead_events_page(
      v_source_id, 0, 101, NULL, NULL, 'event'
    )
    WHERE tracking_id = v_tracking_id
  ) <> 1 THEN
    RAISE EXCEPTION 'Affiliate feed returned more than the latest status for one lead';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.crm_affiliate_lead_events_page(
      v_source_id, 0, 101, NULL, NULL, 'event'
    )
    WHERE tracking_id = v_tracking_id
      AND affiliate_status = 'not_qualified'
  ) THEN
    RAISE EXCEPTION 'Affiliate feed did not return the newest lead status';
  END IF;
END;
$$;

ROLLBACK;
SELECT 'Affiliate lead status feed checks passed' AS result;
