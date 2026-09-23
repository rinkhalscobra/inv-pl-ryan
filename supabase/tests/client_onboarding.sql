BEGIN;

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Onboarding test needs one auth account'; END IF;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM public.crm_ensure_client_onboarding(v_user_id);
  PERFORM public.crm_ensure_client_onboarding(v_user_id);

  IF (SELECT count(*) FROM public.client_profiles WHERE user_id = v_user_id) <> 1 THEN
    RAISE EXCEPTION 'Client profile onboarding is not idempotent';
  END IF;
  IF (SELECT count(*) FROM public.trade_accounts WHERE user_id = v_user_id) <> 1 THEN
    RAISE EXCEPTION 'Trade account onboarding is not idempotent';
  END IF;
  IF (SELECT count(*) FROM public.client_folders WHERE user_id = v_user_id) <> 1 THEN
    RAISE EXCEPTION 'Client folder onboarding is not idempotent';
  END IF;
  IF (SELECT count(*) FROM public.balances WHERE user_id = v_user_id) <> 1 THEN
    RAISE EXCEPTION 'Wallet onboarding is not idempotent';
  END IF;
END;
$$;

DO $$
BEGIN
  IF crm_private.country_from_phone('+39 02 1234 5678') <> 'Italy' THEN
    RAISE EXCEPTION 'Italian phone detection failed';
  END IF;
  IF crm_private.country_from_phone('+49 30 123456') <> 'Germany' THEN
    RAISE EXCEPTION 'German phone detection failed';
  END IF;
  IF crm_private.country_from_phone('+1 212 555 0100') IS NOT NULL THEN
    RAISE EXCEPTION 'Ambiguous calling code should not set a country';
  END IF;
  IF crm_private.country_from_phone('030 123456') IS NOT NULL THEN
    RAISE EXCEPTION 'A local phone number should not set a country';
  END IF;
END;
$$;

ROLLBACK;
SELECT 'Automated client onboarding checks passed' AS result;
