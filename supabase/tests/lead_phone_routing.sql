BEGIN;

DO $$
DECLARE
  v_company_id uuid;
  v_office_id uuid;
  v_lead_id uuid;
  v_manual_lead_id uuid;
BEGIN
  INSERT INTO public.crm_companies(name, code)
  VALUES (
    'Phone routing test ' || gen_random_uuid()::text,
    'RT' || upper(substr(md5(gen_random_uuid()::text), 1, 10))
  )
  RETURNING id INTO v_company_id;

  INSERT INTO public.crm_offices(
    company_id,
    name,
    code,
    routing_country_code,
    status
  )
  VALUES (v_company_id, 'Antarctica routing test', 'AQ-TEST', 'AQ', 'active')
  RETURNING id INTO v_office_id;

  INSERT INTO public.crm_leads(
    company_id,
    email,
    phone,
    phone_e164,
    phone_country_code,
    phone_calling_code,
    phone_validation_status,
    phone_routing_status
  )
  VALUES (
    v_company_id,
    'auto-routing-' || gen_random_uuid()::text || '@example.com',
    '+672123456',
    '+672123456',
    'AQ',
    '672',
    'valid',
    'pending'
  )
  RETURNING id INTO v_lead_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.crm_leads
    WHERE id = v_lead_id
      AND office_id = v_office_id
      AND phone_routing_status = 'no_desk_manager'
  ) THEN
    RAISE EXCEPTION 'Lead was not routed automatically during insertion';
  END IF;

  PERFORM crm_private.refresh_lead_phone_routing(v_company_id, ARRAY['AQ']);

  IF NOT EXISTS (
    SELECT 1
    FROM public.crm_leads
    WHERE id = v_lead_id
      AND office_id = v_office_id
      AND phone_routing_status = 'no_desk_manager'
  ) THEN
    RAISE EXCEPTION 'Valid phone country was not assigned to its active Office';
  END IF;

  INSERT INTO public.crm_leads(
    company_id,
    email,
    phone,
    phone_e164,
    phone_country_code,
    phone_calling_code,
    phone_validation_status,
    phone_routing_status
  )
  VALUES (
    v_company_id,
    'manual-routing-' || gen_random_uuid()::text || '@example.com',
    '+672123456',
    '+672123456',
    'AQ',
    '672',
    'valid',
    'manual'
  )
  RETURNING id INTO v_manual_lead_id;

  PERFORM crm_private.refresh_lead_phone_routing(v_company_id, NULL);

  IF EXISTS (
    SELECT 1
    FROM public.crm_leads
    WHERE id = v_manual_lead_id AND office_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Automatic reprocessing overwrote a manual classification';
  END IF;

  UPDATE public.crm_offices SET status = 'inactive' WHERE id = v_office_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.crm_leads
    WHERE id = v_lead_id
      AND office_id IS NULL
      AND phone_routing_status = 'no_office'
  ) THEN
    RAISE EXCEPTION 'Office deactivation did not reroute the existing lead';
  END IF;

  UPDATE public.crm_offices SET status = 'active' WHERE id = v_office_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.crm_leads
    WHERE id = v_lead_id
      AND office_id = v_office_id
      AND phone_routing_status = 'no_desk_manager'
  ) THEN
    RAISE EXCEPTION 'Office reactivation did not restore automatic routing';
  END IF;
END;
$$;

ROLLBACK;
SELECT 'Lead phone routing checks passed' AS result;
