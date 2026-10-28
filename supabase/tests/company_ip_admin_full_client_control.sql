/* An administrator on a company IP can fully manage that company's clients,
   including administrator status, without crossing the tenant boundary. */
BEGIN;

DO $$
DECLARE
  v_admin uuid;
  v_company uuid;
  v_company_ip inet;
  v_own_client uuid;
  v_other_client uuid;
  v_original_first_name text;
BEGIN
  SELECT client.company_id, network.address, client.id, client.first_name
  INTO v_company, v_company_ip, v_own_client, v_original_first_name
  FROM public.users client
  JOIN crm_private.admin_ip_allowlist network
    ON network.access_scope = 'company'
   AND network.company_id = client.company_id
  WHERE NOT client.is_admin
    AND NOT EXISTS (
      SELECT 1 FROM public.crm_staff_roles staff
      WHERE staff.user_id = client.id
    )
    AND EXISTS (
      SELECT 1 FROM public.users other_client
      WHERE other_client.company_id IS NOT NULL
        AND other_client.company_id IS DISTINCT FROM client.company_id
        AND NOT other_client.is_admin
    )
  ORDER BY client.created_at, network.created_at
  LIMIT 1;

  IF v_own_client IS NULL THEN
    RAISE NOTICE 'Company-IP full-control fixture skipped: two client companies are required';
    RETURN;
  END IF;

  SELECT u.id INTO v_other_client
  FROM public.users u
  WHERE u.company_id IS NOT NULL
    AND u.company_id IS DISTINCT FROM v_company
    AND NOT u.is_admin
  ORDER BY u.created_at
  LIMIT 1;

  SELECT u.id INTO v_admin
  FROM public.users u
  WHERE u.is_admin AND u.company_id IS NULL
  ORDER BY CASE WHEN lower(u.email) = 'admin@gmail.com' THEN 0 ELSE 1 END,
           u.created_at
  LIMIT 1;

  IF v_admin IS NULL THEN
    SELECT u.id INTO v_admin
    FROM public.users u
    WHERE u.is_admin AND u.company_id = v_company
    ORDER BY u.created_at
    LIMIT 1;
  END IF;

  IF v_admin IS NULL THEN
    RAISE NOTICE 'Company-IP full-control fixture skipped: an administrator is required';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config(
    'request.headers',
    jsonb_build_object('cf-connecting-ip', host(v_company_ip))::text,
    true
  );

  PERFORM public.admin_update_user_profile(
    v_own_client,
    jsonb_build_object('first_name', v_original_first_name),
    'Company-IP full-control regression test'
  );

  PERFORM public.crm_admin_set_role(v_own_client, 'admin');
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = v_own_client AND is_admin
  ) THEN
    RAISE EXCEPTION 'Company administrator could not grant administrator access to its own account';
  END IF;

  PERFORM public.crm_admin_set_role(v_own_client, 'client');
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE id = v_own_client AND is_admin
  ) THEN
    RAISE EXCEPTION 'Company administrator could not restore its own company client';
  END IF;

  BEGIN
    PERFORM public.crm_admin_set_role(v_other_client, 'admin');
    RAISE EXCEPTION 'Company administrator crossed the company boundary';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'Account belongs to another company' THEN RAISE; END IF;
  END;

  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE id = v_other_client AND is_admin
  ) THEN
    RAISE EXCEPTION 'Cross-company account was modified';
  END IF;
END;
$$;

ROLLBACK;
SELECT 'Company-IP administrator full client-control checks passed' AS result;
