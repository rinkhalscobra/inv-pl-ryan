BEGIN;

DO $$
DECLARE
  v_company_id uuid;
  v_source_id uuid;
  v_user_id uuid;
  v_lead_id uuid;
  v_ftd_at timestamptz;
  v_recorded_ftd_at timestamptz;
  v_event record;
BEGIN
  SELECT id INTO v_company_id
  FROM public.crm_companies
  ORDER BY created_at
  LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Affiliate FTD test needs one CRM company';
  END IF;

  INSERT INTO public.users(email, company_id)
  VALUES (
    'affiliate-ftd-' || gen_random_uuid()::text || '@example.com',
    v_company_id
  )
  RETURNING id INTO v_user_id;

  INSERT INTO public.balances(user_id) VALUES (v_user_id);

  INSERT INTO public.crm_lead_sources(name, kind, api_key_hash, company_id)
  VALUES (
    'Affiliate FTD test',
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
    'Affiliate FTD test',
    'affiliate-ftd-test-1',
    'affiliate-ftd-lead-' || gen_random_uuid()::text || '@example.com',
    'registered',
    v_user_id
  )
  RETURNING id INTO v_lead_id;

  /* A legacy migration timestamp is not proof of the real wallet-credit time. */
  INSERT INTO public.transactions(
    user_id,
    type,
    amount,
    currency,
    description,
    status,
    balance_effect,
    balance_processed_at
  )
  VALUES (
    v_user_id,
    'deposit',
    50,
    'USD',
    'Legacy timestamp exclusion test',
    'completed',
    '{"legacy":true}'::jsonb,
    now() - interval '1 day'
  );

  IF EXISTS (
    SELECT 1
    FROM public.crm_leads
    WHERE id = v_lead_id AND first_deposit_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Legacy transaction incorrectly produced an FTD date';
  END IF;

  INSERT INTO public.transactions(
    user_id,
    type,
    amount,
    currency,
    description,
    status
  )
  VALUES (
    v_user_id,
    'deposit',
    100,
    'USD',
    'Affiliate FTD integration test deposit',
    'completed'
  )
  RETURNING balance_processed_at INTO v_ftd_at;

  IF v_ftd_at IS NULL THEN
    RAISE EXCEPTION 'Completed deposit did not receive a wallet-credit timestamp';
  END IF;

  SELECT first_deposit_at INTO v_recorded_ftd_at
  FROM public.crm_leads
  WHERE id = v_lead_id;

  IF v_recorded_ftd_at IS DISTINCT FROM v_ftd_at THEN
    RAISE EXCEPTION 'Lead FTD date does not match transactions.balance_processed_at';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.crm_leads
    WHERE id = v_lead_id AND disposition_status = 'ftd'
  ) THEN
    RAISE EXCEPTION 'Qualifying deposit did not set the FTD status';
  END IF;

  SELECT * INTO v_event
  FROM public.crm_affiliate_lead_events_page(
    v_source_id,
    0,
    101,
    v_ftd_at - interval '1 minute',
    v_ftd_at + interval '1 minute',
    'ftd'
  )
  WHERE affiliate_status = 'converted'
  ORDER BY event_id DESC
  LIMIT 1;

  IF v_event.event_id IS NULL THEN
    RAISE EXCEPTION 'FTD date-range event query returned no converted event';
  END IF;
  IF v_event.ftd_at IS DISTINCT FROM v_ftd_at THEN
    RAISE EXCEPTION 'Event response FTD date does not match the wallet credit';
  END IF;
  IF v_event.occurred_at IS DISTINCT FROM v_ftd_at THEN
    RAISE EXCEPTION 'Converted event did not use the actual FTD timestamp';
  END IF;
END;
$$;

ROLLBACK;
SELECT 'Affiliate FTD event checks passed' AS result;
