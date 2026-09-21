-- Direct retention ownership, inherited agent clients, and exclusive transfers.
-- Requires four unassigned client accounts. Changes are rolled back.
BEGIN;

CREATE TEMP TABLE crm_direct_test_accounts AS
SELECT id, row_number() OVER (ORDER BY id) AS rn
FROM (
  SELECT u.id FROM public.users u
  LEFT JOIN public.crm_staff_roles s ON s.user_id = u.id
  LEFT JOIN public.crm_client_agent_assignments a ON a.client_id = u.id
  LEFT JOIN public.crm_client_retention_assignments d ON d.client_id = u.id
  WHERE u.is_admin = false AND s.user_id IS NULL AND a.client_id IS NULL AND d.client_id IS NULL
  ORDER BY u.id LIMIT 4
) users;

DO $$ BEGIN
  IF (SELECT count(*) FROM crm_direct_test_accounts) < 4 THEN
    RAISE EXCEPTION 'Direct retention test needs four unassigned client accounts';
  END IF;
END $$;

SELECT set_config('crm.test.retention', (SELECT id::text FROM crm_direct_test_accounts WHERE rn = 1), true);
SELECT set_config('crm.test.direct', (SELECT id::text FROM crm_direct_test_accounts WHERE rn = 2), true);
SELECT set_config('crm.test.agent_client', (SELECT id::text FROM crm_direct_test_accounts WHERE rn = 3), true);
SELECT set_config('crm.test.agent', (SELECT id::text FROM crm_direct_test_accounts WHERE rn = 4), true);
SELECT set_config('crm.test.admin', (SELECT id::text FROM public.users WHERE is_admin = true ORDER BY id LIMIT 1), true);
SELECT set_config('request.jwt.claim.sub', current_setting('crm.test.admin'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

DO $$ BEGIN
  PERFORM public.crm_admin_set_role(current_setting('crm.test.retention')::uuid, 'retention');
  PERFORM public.crm_admin_set_role(current_setting('crm.test.agent')::uuid, 'agent');
  PERFORM public.crm_admin_assign_agent(current_setting('crm.test.agent')::uuid, current_setting('crm.test.retention')::uuid);
  PERFORM public.crm_admin_set_client_owner(current_setting('crm.test.direct')::uuid, 'retention', current_setting('crm.test.retention')::uuid);
  PERFORM public.crm_admin_set_client_owner(current_setting('crm.test.agent_client')::uuid, 'agent', current_setting('crm.test.agent')::uuid);
  IF jsonb_array_length(public.crm_admin_get_hierarchy()->'retention_client_assignments') < 1 THEN
    RAISE EXCEPTION 'Admin hierarchy omitted direct retention assignment';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', current_setting('crm.test.retention'), true);
DO $$
DECLARE v_scope jsonb := public.crm_staff_get_scope(NULL);
BEGIN
  IF jsonb_array_length(v_scope->'clients') <> 2 THEN RAISE EXCEPTION 'Retention should see direct and agent clients'; END IF;
  PERFORM public.crm_staff_get_client_workspace(current_setting('crm.test.direct')::uuid);
  PERFORM public.crm_staff_get_client_workspace(current_setting('crm.test.agent_client')::uuid);
END $$;

SELECT set_config('request.jwt.claim.sub', current_setting('crm.test.agent'), true);
DO $$
DECLARE v_scope jsonb := public.crm_staff_get_scope(NULL);
BEGIN
  IF jsonb_array_length(v_scope->'clients') <> 1 THEN RAISE EXCEPTION 'Agent should see only its own client'; END IF;
  BEGIN
    PERFORM public.crm_staff_get_client_workspace(current_setting('crm.test.direct')::uuid);
    RAISE EXCEPTION 'Agent accessed a direct retention client';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'Client access denied' THEN RAISE; END IF;
  END;
END $$;

SELECT set_config('request.jwt.claim.sub', current_setting('crm.test.admin'), true);
DO $$ BEGIN
  PERFORM public.crm_admin_set_client_owner(current_setting('crm.test.direct')::uuid, 'agent', current_setting('crm.test.agent')::uuid);
END $$;

RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.crm_client_retention_assignments WHERE client_id = current_setting('crm.test.direct')::uuid)
     OR NOT EXISTS (SELECT 1 FROM public.crm_client_agent_assignments WHERE client_id = current_setting('crm.test.direct')::uuid) THEN
    RAISE EXCEPTION 'Changing direct retention client to agent did not transfer exclusive ownership';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM public.crm_admin_set_client_owner(current_setting('crm.test.direct')::uuid, 'unassigned', NULL);
END $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.crm_client_retention_assignments WHERE client_id = current_setting('crm.test.direct')::uuid)
     OR EXISTS (SELECT 1 FROM public.crm_client_agent_assignments WHERE client_id = current_setting('crm.test.direct')::uuid) THEN
    RAISE EXCEPTION 'Unassigning client left an ownership link';
  END IF;
END $$;

ROLLBACK;
SELECT 'Direct retention access checks passed' AS result;
