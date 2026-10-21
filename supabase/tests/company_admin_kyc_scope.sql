/* Company administrators can review their own KYC clients and cannot cross
   the tenant boundary. All fixtures are rolled back. */
BEGIN;

DO $$
DECLARE
  v_admin uuid;
  v_own_client uuid;
  v_other_client uuid;
  v_own_company uuid;
  v_other_company uuid;
  v_company_ip inet;
BEGIN
  SELECT own_client.id, own_client.company_id, network.address
  INTO v_own_client, v_own_company, v_company_ip
  FROM public.users own_client
  JOIN crm_private.admin_ip_allowlist network
    ON network.access_scope = 'company'
   AND network.company_id = own_client.company_id
  WHERE NOT own_client.is_admin
    AND own_client.company_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.users other_client
      WHERE other_client.company_id IS NOT NULL
        AND other_client.company_id IS DISTINCT FROM own_client.company_id
        AND NOT other_client.is_admin
    )
  ORDER BY own_client.created_at, network.created_at
  LIMIT 1;

  IF v_own_client IS NULL THEN
    RAISE NOTICE 'Company-admin KYC integration fixture skipped: two client companies and a company network are required';
    RETURN;
  END IF;

  SELECT u.id, u.company_id INTO v_other_client, v_other_company
  FROM public.users u
  WHERE u.company_id IS DISTINCT FROM v_own_company
    AND u.company_id IS NOT NULL
    AND NOT u.is_admin
  ORDER BY u.created_at
  LIMIT 1;

  SELECT u.id INTO v_admin
  FROM public.users u
  WHERE u.is_admin AND u.company_id = v_own_company
  ORDER BY u.created_at
  LIMIT 1;

  IF v_admin IS NULL THEN
    SELECT u.id INTO v_admin
    FROM public.users u
    WHERE u.is_admin AND u.company_id IS NULL
    ORDER BY u.created_at
    LIMIT 1;

    IF v_admin IS NULL THEN
      RAISE NOTICE 'Company-admin KYC integration fixture skipped: an administrator is required';
      RETURN;
    END IF;

    /* Exercise the assigned-admin branch without persisting the fixture. */
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    PERFORM public.crm_service_set_user_company(v_admin, v_own_company);
  END IF;

  SELECT a.address INTO v_company_ip
  FROM crm_private.admin_ip_allowlist a
  WHERE a.access_scope = 'company' AND a.company_id = v_own_company
  ORDER BY a.created_at
  LIMIT 1;
  IF v_company_ip IS NULL THEN
    RAISE NOTICE 'Company-admin KYC integration fixture skipped: company network is required';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config(
    'request.headers',
    jsonb_build_object('cf-connecting-ip', host(v_company_ip))::text,
    true
  );

  /* The low-level tenant assertion is shared by every administrator mutation. */
  PERFORM public.require_admin();
  PERFORM crm_private.assert_actor_user_access(v_own_client);
  IF crm_private.effective_company(NULL) IS DISTINCT FROM v_own_company THEN
    RAISE EXCEPTION 'Company administrator resolved the wrong company';
  END IF;
  BEGIN
    PERFORM crm_private.assert_actor_user_access(v_other_client);
    RAISE EXCEPTION 'Company administrator crossed the company boundary';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT IN (
      'Account belongs to another company',
      'Administrator account and network belong to different companies'
    ) THEN
      RAISE;
    END IF;
  END;

  BEGIN
    PERFORM crm_private.effective_company(v_other_company);
    RAISE EXCEPTION 'Company administrator selected another company';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'Administrator cannot access another company' THEN
      RAISE;
    END IF;
  END;
END;
$$;

ROLLBACK;
SELECT 'Company administrator KYC scope checks passed' AS result;
