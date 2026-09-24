-- Strict workspace boundary and inherited-scope checks. All fixtures roll back.
BEGIN;

CREATE TEMP TABLE crm_test_accounts AS
SELECT id, row_number() OVER (ORDER BY id) rn FROM (
  SELECT u.id FROM public.users u
  LEFT JOIN public.crm_staff_roles s ON s.user_id=u.id
  LEFT JOIN public.crm_client_agent_assignments a ON a.client_id=u.id
  LEFT JOIN public.crm_client_retention_assignments r ON r.client_id=u.id
  WHERE NOT u.is_admin AND s.user_id IS NULL AND a.client_id IS NULL AND r.client_id IS NULL AND NOT u.is_promoted
  ORDER BY u.id LIMIT 7
) q;
DO $$ BEGIN IF (SELECT count(*) FROM crm_test_accounts)<7 THEN RAISE EXCEPTION 'CRM hierarchy test needs seven free accounts'; END IF; END $$;

SELECT set_config('crm.test.admin',(SELECT id::text FROM public.users WHERE is_admin ORDER BY id LIMIT 1),true);
SELECT set_config('crm.test.workflow',(SELECT id::text FROM crm_test_accounts WHERE rn=1),true);
SELECT set_config('crm.test.desk',(SELECT id::text FROM crm_test_accounts WHERE rn=2),true);
SELECT set_config('crm.test.agent',(SELECT id::text FROM crm_test_accounts WHERE rn=3),true);
SELECT set_config('crm.test.retention_manager',(SELECT id::text FROM crm_test_accounts WHERE rn=4),true);
SELECT set_config('crm.test.retention',(SELECT id::text FROM crm_test_accounts WHERE rn=5),true);
SELECT set_config('crm.test.client',(SELECT id::text FROM crm_test_accounts WHERE rn=6),true);
SELECT set_config('crm.test.other',(SELECT id::text FROM crm_test_accounts WHERE rn=7),true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub',current_setting('crm.test.admin'),true);
SET LOCAL ROLE authenticated;

SELECT public.crm_admin_set_user_office(id,NULL) FROM crm_test_accounts;

SELECT public.crm_admin_set_role(current_setting('crm.test.workflow')::uuid,'workflow_manager');
SELECT public.crm_admin_set_role(current_setting('crm.test.desk')::uuid,'desk_manager');
SELECT public.crm_admin_set_role(current_setting('crm.test.agent')::uuid,'agent');
SELECT public.crm_admin_set_role(current_setting('crm.test.retention_manager')::uuid,'retention_manager');
SELECT public.crm_admin_set_role(current_setting('crm.test.retention')::uuid,'retention');
SELECT public.crm_admin_assign_staff(current_setting('crm.test.desk')::uuid,current_setting('crm.test.workflow')::uuid);
SELECT public.crm_admin_assign_staff(current_setting('crm.test.agent')::uuid,current_setting('crm.test.desk')::uuid);
SELECT public.crm_admin_assign_staff(current_setting('crm.test.retention')::uuid,current_setting('crm.test.retention_manager')::uuid);
SELECT public.crm_admin_set_client_owner(current_setting('crm.test.client')::uuid,'agent',current_setting('crm.test.agent')::uuid);

SELECT set_config('request.jwt.claim.sub',current_setting('crm.test.agent'),true);
DO $$ DECLARE s jsonb:=public.crm_staff_get_scope(NULL); BEGIN
  IF jsonb_array_length(s->'clients')<>1 THEN RAISE EXCEPTION 'Agent scope is incorrect'; END IF;
  PERFORM public.crm_staff_get_client_workspace(current_setting('crm.test.client')::uuid);
END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('crm.test.desk'),true);
DO $$ BEGIN PERFORM public.crm_staff_get_client_workspace(current_setting('crm.test.client')::uuid); END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('crm.test.workflow'),true);
DO $$ BEGIN PERFORM public.crm_staff_get_client_workspace(current_setting('crm.test.client')::uuid); END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('crm.test.retention'),true);
DO $$ BEGIN
  BEGIN PERFORM public.crm_staff_get_client_workspace(current_setting('crm.test.client')::uuid); RAISE EXCEPTION 'Retention accessed Sales client';
  EXCEPTION WHEN others THEN IF SQLERRM<>'Client access denied' THEN RAISE; END IF; END;
END $$;

SELECT set_config('request.jwt.claim.sub',current_setting('crm.test.admin'),true);
SELECT public.crm_promote_client_to_retention(current_setting('crm.test.client')::uuid);
SELECT public.crm_admin_set_client_owner(current_setting('crm.test.client')::uuid,'retention',current_setting('crm.test.retention')::uuid);
SELECT set_config('request.jwt.claim.sub',current_setting('crm.test.agent'),true);
DO $$ BEGIN
  BEGIN PERFORM public.crm_staff_get_client_workspace(current_setting('crm.test.client')::uuid); RAISE EXCEPTION 'Sales accessed promoted client';
  EXCEPTION WHEN others THEN IF SQLERRM<>'Client access denied' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('crm.test.retention'),true);
DO $$ BEGIN PERFORM public.crm_staff_get_client_workspace(current_setting('crm.test.client')::uuid); END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('crm.test.retention_manager'),true);
DO $$ BEGIN PERFORM public.crm_staff_get_client_workspace(current_setting('crm.test.client')::uuid); END $$;

RESET ROLE;
ROLLBACK;
SELECT 'Strict CRM hierarchy access checks passed' result;
