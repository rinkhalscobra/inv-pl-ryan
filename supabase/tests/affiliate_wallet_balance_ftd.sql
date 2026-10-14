BEGIN;

DO $$
DECLARE
  v_company_id uuid;
  v_source_id uuid;
  v_user_id uuid;
  v_lead_id uuid;
  v_ftd_at timestamptz;
  v_event record;
BEGIN
  SELECT id INTO v_company_id
  FROM public.crm_companies
  ORDER BY created_at
  LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Affiliate wallet FTD test needs one CRM company';
  END IF;

  INSERT INTO public.users(email, company_id)
  VALUES (
    'affiliate-wallet-ftd-' || gen_random_uuid()::text || '@example.com',
    v_company_id
  )
  RETURNING id INTO v_user_id;

  INSERT INTO public.balances(user_id) VALUES (v_user_id);

  INSERT INTO public.crm_lead_sources(name, kind, api_key_hash, company_id)
  VALUES (
    'Affiliate wallet FTD test',
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
    email,
    status,
    registered_user_id
  )
  VALUES (
    v_company_id,
    v_source_id,
    'affiliate_api',
    'Affiliate wallet FTD test',
    'affiliate-wallet-ftd-test-1',
    'affiliate-wallet-lead-' || gen_random_uuid()::text || '@example.com',
    'registered',
    v_user_id
  )
  RETURNING id INTO v_lead_id;

  /* BTC edits and a sub-threshold primary-wallet increase do not qualify. */
  INSERT INTO public.transactions(
    user_id, type, amount, currency, description, status
  ) VALUES (
    v_user_id, 'deposit', 100000, 'BTC',
    'CRM BTC balance adjustment: affiliate FTD test', 'completed'
  );

  INSERT INTO public.transactions(
    user_id, type, amount, currency, description, status
  ) VALUES (
    v_user_id, 'deposit', 249, 'USD',
    'CRM USD balance adjustment: affiliate FTD test', 'completed'
  );

  IF EXISTS (
    SELECT 1 FROM public.crm_leads
    WHERE id = v_lead_id AND first_deposit_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'An excluded or sub-threshold wallet adjustment produced an FTD';
  END IF;

  INSERT INTO public.transactions(
    user_id, type, amount, currency, description, status
  ) VALUES (
    v_user_id, 'deposit', 250, 'USD',
    'CRM USD balance adjustment: affiliate FTD test', 'completed'
  )
  RETURNING balance_processed_at INTO v_ftd_at;

  IF NOT EXISTS (
    SELECT 1
    FROM public.crm_leads
    WHERE id = v_lead_id
      AND disposition_status = 'ftd'
      AND first_deposit_at = v_ftd_at
      AND disposition_changed_by IS NULL
  ) THEN
    RAISE EXCEPTION 'A qualifying primary-wallet increase did not produce automatic FTD';
  END IF;

  SELECT * INTO v_event
  FROM public.crm_affiliate_lead_events_page(
    v_source_id, 0, 101, NULL, NULL, 'ftd'
  )
  WHERE affiliate_status = 'converted'
  ORDER BY event_id DESC
  LIMIT 1;

  IF v_event.event_id IS NULL
     OR v_event.ftd_status IS DISTINCT FROM true
     OR v_event.ftd_source IS DISTINCT FROM 'automatic'
     OR v_event.ftd_at IS DISTINCT FROM v_ftd_at THEN
    RAISE EXCEPTION 'Affiliate wallet FTD event response is incorrect';
  END IF;
END;
$$;

ROLLBACK;
SELECT 'Affiliate wallet-balance FTD checks passed' AS result;
