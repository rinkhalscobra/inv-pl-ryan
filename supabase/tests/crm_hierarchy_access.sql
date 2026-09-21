-- Runs against a database with at least four non-admin accounts.
-- All fixture changes are rolled back.
BEGIN;

CREATE TEMP TABLE crm_test_accounts AS
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
  IF (SELECT count(*) FROM crm_test_accounts) < 4 THEN
    RAISE EXCEPTION 'CRM access test needs four non-admin accounts';
  END IF;
END $$;

INSERT INTO public.crm_staff_roles(user_id, role)
SELECT id, CASE WHEN rn = 1 THEN 'agent' ELSE 'retention' END
FROM crm_test_accounts WHERE rn IN (1, 2);

INSERT INTO public.crm_agent_retention_assignments(agent_id, retention_id)
SELECT agent.id, manager.id FROM crm_test_accounts agent CROSS JOIN crm_test_accounts manager
WHERE agent.rn = 1 AND manager.rn = 2;

INSERT INTO public.crm_client_agent_assignments(client_id, agent_id)
SELECT client.id, agent.id FROM crm_test_accounts client CROSS JOIN crm_test_accounts agent
WHERE client.rn = 3 AND agent.rn = 1;

SELECT set_config('crm.test.assigned_client', (SELECT id::text FROM crm_test_accounts WHERE rn = 3), true);
SELECT set_config('crm.test.other_client', (SELECT id::text FROM crm_test_accounts WHERE rn = 4), true);
SELECT set_config('crm.test.retention', (SELECT id::text FROM crm_test_accounts WHERE rn = 2), true);
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM crm_test_accounts WHERE rn = 1), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_scope jsonb;
BEGIN
  IF public.crm_my_role() <> 'agent' THEN RAISE EXCEPTION 'Agent role lookup failed'; END IF;
  v_scope := public.crm_staff_get_scope(NULL);
  IF jsonb_array_length(v_scope->'clients') <> 1 OR jsonb_array_length(v_scope->'agents') <> 0 THEN
    RAISE EXCEPTION 'Agent scope is incorrect';
  END IF;
  PERFORM public.crm_staff_get_client_workspace(current_setting('crm.test.assigned_client')::uuid);
  BEGIN
    PERFORM public.crm_staff_get_client_workspace(current_setting('crm.test.other_client')::uuid);
    RAISE EXCEPTION 'Agent accessed an unassigned client';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'Client access denied' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.crm_admin_get_hierarchy();
    RAISE EXCEPTION 'Agent accessed admin hierarchy';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'Administrator access required' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.admin_get_users(NULL, 100, 0);
    RAISE EXCEPTION 'Agent accessed the legacy administrator API';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'Administrator access required' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.crm_admin_assign_client(current_setting('crm.test.other_client')::uuid, auth.uid());
    RAISE EXCEPTION 'Agent changed a client assignment';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'Administrator access required' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM 1 FROM public.crm_staff_roles LIMIT 1;
    RAISE EXCEPTION 'Agent read the role assignment table directly';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;

SELECT set_config('request.jwt.claim.sub', current_setting('crm.test.retention'), true);

DO $$
DECLARE v_scope jsonb;
BEGIN
  IF public.crm_my_role() <> 'retention' THEN RAISE EXCEPTION 'Retention role lookup failed'; END IF;
  v_scope := public.crm_staff_get_scope(NULL);
  IF jsonb_array_length(v_scope->'agents') <> 1 OR jsonb_array_length(v_scope->'clients') <> 1 THEN
    RAISE EXCEPTION 'Retention scope is incorrect';
  END IF;
  PERFORM public.crm_staff_get_client_workspace(current_setting('crm.test.assigned_client')::uuid);
  BEGIN
    PERFORM public.crm_staff_get_client_workspace(current_setting('crm.test.other_client')::uuid);
    RAISE EXCEPTION 'Retention accessed a client outside the assigned agent';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'Client access denied' THEN RAISE; END IF;
  END;
END $$;

SELECT set_config('request.jwt.claim.sub', current_setting('crm.test.other_client'), true);

DO $$ BEGIN
  IF public.crm_my_role() <> 'client' THEN RAISE EXCEPTION 'Client role lookup failed'; END IF;
  BEGIN
    PERFORM public.crm_staff_get_scope(NULL);
    RAISE EXCEPTION 'Client accessed staff scope';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'CRM staff access required' THEN RAISE; END IF;
  END;
END $$;

RESET ROLE;
ROLLBACK;
SELECT 'CRM hierarchy access checks passed' AS result;
