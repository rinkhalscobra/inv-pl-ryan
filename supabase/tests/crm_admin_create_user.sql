-- Exercise role setup, ownership, audit and access control without keeping fixtures.
BEGIN;

CREATE TEMP TABLE crm_create_accounts AS
SELECT id, row_number() OVER (ORDER BY id) AS rn
FROM (
  SELECT u.id FROM public.users u
  LEFT JOIN public.crm_staff_roles s ON s.user_id = u.id
  LEFT JOIN public.crm_client_agent_assignments a ON a.client_id = u.id
  LEFT JOIN public.crm_client_retention_assignments d ON d.client_id = u.id
  WHERE u.is_admin = false AND s.user_id IS NULL AND a.client_id IS NULL AND d.client_id IS NULL
  ORDER BY u.id LIMIT 3
) accounts;

DO $$ BEGIN
  IF (SELECT count(*) FROM crm_create_accounts) < 3 THEN
    RAISE EXCEPTION 'Create-user test needs three unassigned client accounts';
  END IF;
END $$;

SELECT set_config('crm.test.admin', (SELECT id::text FROM public.users WHERE is_admin = true ORDER BY id LIMIT 1), true);
SELECT set_config('crm.test.retention', (SELECT id::text FROM crm_create_accounts WHERE rn = 1), true);
SELECT set_config('crm.test.agent', (SELECT id::text FROM crm_create_accounts WHERE rn = 2), true);
SELECT set_config('crm.test.client', (SELECT id::text FROM crm_create_accounts WHERE rn = 3), true);

SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.crm_finalize_created_user(current_setting('crm.test.client')::uuid,
      current_setting('crm.test.admin')::uuid, 'admin', NULL, NULL);
    RAISE EXCEPTION 'Authenticated caller reached service-only function';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;
SELECT public.crm_finalize_created_user(current_setting('crm.test.retention')::uuid,
  current_setting('crm.test.admin')::uuid, 'retention', NULL, NULL);
SELECT public.crm_finalize_created_user(current_setting('crm.test.agent')::uuid,
  current_setting('crm.test.admin')::uuid, 'agent', 'retention', current_setting('crm.test.retention')::uuid);
SELECT public.crm_finalize_created_user(current_setting('crm.test.client')::uuid,
  current_setting('crm.test.admin')::uuid, 'client', 'agent', current_setting('crm.test.agent')::uuid);
RESET ROLE;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.crm_staff_roles WHERE user_id = current_setting('crm.test.retention')::uuid AND role = 'retention')
    OR NOT EXISTS (SELECT 1 FROM public.crm_staff_roles WHERE user_id = current_setting('crm.test.agent')::uuid AND role = 'agent')
    OR NOT EXISTS (SELECT 1 FROM public.crm_agent_retention_assignments WHERE agent_id = current_setting('crm.test.agent')::uuid AND retention_id = current_setting('crm.test.retention')::uuid)
    OR NOT EXISTS (SELECT 1 FROM public.crm_client_agent_assignments WHERE client_id = current_setting('crm.test.client')::uuid AND agent_id = current_setting('crm.test.agent')::uuid)
    OR (SELECT count(*) FROM public.admin_action_logs WHERE action = 'auth_user_created' AND target_user_id IN
      (current_setting('crm.test.retention')::uuid, current_setting('crm.test.agent')::uuid, current_setting('crm.test.client')::uuid)) <> 3
  THEN RAISE EXCEPTION 'Created account setup was incomplete'; END IF;
END $$;

ROLLBACK;
SELECT 'CRM account creation checks passed' AS result;
