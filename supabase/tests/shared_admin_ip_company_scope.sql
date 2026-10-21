/* A company-neutral shared admin receives one company's full scope from the
   approved request IP and cannot cross into another company. */
BEGIN;

DO $$
DECLARE
  v_admin uuid;
  v_company uuid;
  v_company_ip inet;
  v_own_client uuid;
  v_other_client uuid;
  v_users jsonb;
BEGIN
  SELECT u.id INTO v_admin
  FROM public.users u
  WHERE u.is_admin AND u.company_id IS NULL
  ORDER BY CASE WHEN lower(u.email) = 'admin@gmail.com' THEN 0 ELSE 1 END,
           u.created_at
  LIMIT 1;

  SELECT client.company_id, network.address, client.id
  INTO v_company, v_company_ip, v_own_client
  FROM public.users client
  JOIN crm_private.admin_ip_allowlist network
    ON network.access_scope = 'company'
   AND network.company_id = client.company_id
  WHERE NOT client.is_admin
    AND client.company_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.users other_client
      WHERE other_client.company_id IS NOT NULL
        AND other_client.company_id IS DISTINCT FROM client.company_id
        AND NOT other_client.is_admin
    )
  ORDER BY client.created_at, network.created_at
  LIMIT 1;

  IF v_admin IS NULL OR v_own_client IS NULL THEN
    RAISE NOTICE 'Shared-admin IP scope fixture skipped: a shared admin and two client companies are required';
    RETURN;
  END IF;

  SELECT u.id INTO v_other_client
  FROM public.users u
  WHERE u.company_id IS NOT NULL
    AND u.company_id IS DISTINCT FROM v_company
    AND NOT u.is_admin
  ORDER BY u.created_at
  LIMIT 1;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config(
    'request.headers',
    jsonb_build_object('cf-connecting-ip', host(v_company_ip))::text,
    true
  );

  PERFORM public.require_admin();
  IF crm_private.effective_company(NULL) IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'Shared administrator did not resolve the IP company';
  END IF;
  IF NOT crm_private.admin_can_manage_user(v_admin, v_own_client)
     OR NOT crm_private.can_actor_view_client(v_admin, v_own_client) THEN
    RAISE EXCEPTION 'Shared administrator cannot manage its IP-company client';
  END IF;
  IF crm_private.admin_can_manage_user(v_admin, v_other_client)
     OR crm_private.can_actor_view_client(v_admin, v_other_client) THEN
    RAISE EXCEPTION 'Shared administrator crossed the IP-company boundary';
  END IF;

  v_users := public.admin_get_users(NULL, 100, 0, NULL, NULL);
  IF (v_users->>'company_id')::uuid IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'Administrator client list resolved the wrong company';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_users->'users') item
    WHERE (item->>'id')::uuid = v_own_client
  ) THEN
    RAISE EXCEPTION 'IP-company client is missing from the administrator list';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_users->'users') item
    WHERE (item->>'id')::uuid = v_other_client
  ) THEN
    RAISE EXCEPTION 'Another company client leaked into the administrator list';
  END IF;
END;
$$;

ROLLBACK;
SELECT 'Shared administrator IP-company scope checks passed' AS result;
