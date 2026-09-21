-- Admin assignment and cleanup checks. All fixture changes are rolled back.
BEGIN;

CREATE TEMP TABLE crm_admin_test_accounts AS
SELECT id, row_number() OVER (ORDER BY id) AS rn
FROM (
  SELECT u.id FROM public.users u
  LEFT JOIN public.crm_staff_roles s ON s.user_id = u.id
  LEFT JOIN public.crm_client_agent_assignments a ON a.client_id = u.id
  LEFT JOIN public.crm_client_retention_assignments d ON d.client_id = u.id
  WHERE u.is_admin = false AND s.user_id IS NULL AND a.client_id IS NULL AND d.client_id IS NULL
  ORDER BY u.id LIMIT 3
) users;

DO $$ BEGIN
  IF (SELECT count(*) FROM crm_admin_test_accounts) < 3 THEN
    RAISE EXCEPTION 'CRM admin test needs three non-admin accounts';
  END IF;
END $$;

SELECT set_config('crm.test.agent', (SELECT id::text FROM crm_admin_test_accounts WHERE rn = 1), true);
SELECT set_config('crm.test.retention', (SELECT id::text FROM crm_admin_test_accounts WHERE rn = 2), true);
SELECT set_config('crm.test.client', (SELECT id::text FROM crm_admin_test_accounts WHERE rn = 3), true);
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM public.users WHERE is_admin = true ORDER BY id LIMIT 1), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_agent uuid := current_setting('crm.test.agent')::uuid;
        v_retention uuid := current_setting('crm.test.retention')::uuid;
        v_client uuid := current_setting('crm.test.client')::uuid;
BEGIN
  IF public.crm_my_role() <> 'admin' THEN RAISE EXCEPTION 'Admin role lookup failed'; END IF;
  PERFORM public.crm_admin_set_role(v_retention, 'retention');
  PERFORM public.crm_admin_promote_agent(v_agent, v_retention);
  PERFORM public.crm_admin_assign_client(v_client, v_agent);
  IF NOT (public.crm_admin_get_hierarchy() ? 'people') THEN
    RAISE EXCEPTION 'Hierarchy response is missing';
  END IF;
  PERFORM public.crm_admin_set_role(v_agent, 'admin');
END $$;

RESET ROLE;

DO $$
DECLARE v_agent uuid := current_setting('crm.test.agent')::uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.crm_client_agent_assignments WHERE agent_id = v_agent)
     OR EXISTS (SELECT 1 FROM public.crm_agent_retention_assignments WHERE agent_id = v_agent)
     OR EXISTS (SELECT 1 FROM public.crm_staff_roles WHERE user_id = v_agent) THEN
    RAISE EXCEPTION 'Promoting agent did not remove assignments';
  END IF;
END $$;
ROLLBACK;
SELECT 'CRM hierarchy admin checks passed' AS result;
