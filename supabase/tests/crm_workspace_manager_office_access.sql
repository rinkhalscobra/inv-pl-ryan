-- Workspace managers cross Office boundaries inside their own workspace only.
BEGIN;

CREATE TEMP TABLE crm_manager_office_accounts AS
SELECT id,row_number() OVER(ORDER BY id) rn FROM (
  SELECT u.id FROM public.users u
  LEFT JOIN public.crm_staff_roles s ON s.user_id=u.id
  LEFT JOIN public.crm_client_agent_assignments a ON a.client_id=u.id
  LEFT JOIN public.crm_client_retention_assignments r ON r.client_id=u.id
  WHERE NOT u.is_admin AND NOT u.is_promoted AND s.user_id IS NULL
    AND a.client_id IS NULL AND r.client_id IS NULL
  ORDER BY u.id LIMIT 10
) q;
DO $$ BEGIN
  IF (SELECT count(*) FROM crm_manager_office_accounts)<10 THEN
    RAISE EXCEPTION 'Workspace manager Office test needs ten free accounts';
  END IF;
END $$;

SELECT set_config('crm.test.admin',(SELECT id::text FROM public.users WHERE is_admin ORDER BY id LIMIT 1),true);
SELECT set_config('crm.test.workflow',(SELECT id::text FROM crm_manager_office_accounts WHERE rn=1),true);
SELECT set_config('crm.test.retention_manager',(SELECT id::text FROM crm_manager_office_accounts WHERE rn=2),true);
SELECT set_config('crm.test.desk',(SELECT id::text FROM crm_manager_office_accounts WHERE rn=3),true);
SELECT set_config('crm.test.agent',(SELECT id::text FROM crm_manager_office_accounts WHERE rn=4),true);
SELECT set_config('crm.test.retention',(SELECT id::text FROM crm_manager_office_accounts WHERE rn=5),true);
SELECT set_config('crm.test.sales_client',(SELECT id::text FROM crm_manager_office_accounts WHERE rn=6),true);
SELECT set_config('crm.test.retention_client',(SELECT id::text FROM crm_manager_office_accounts WHERE rn=7),true);
SELECT set_config('crm.test.unassigned_sales',(SELECT id::text FROM crm_manager_office_accounts WHERE rn=8),true);
SELECT set_config('crm.test.other_desk',(SELECT id::text FROM crm_manager_office_accounts WHERE rn=9),true);
SELECT set_config('crm.test.other_retention',(SELECT id::text FROM crm_manager_office_accounts WHERE rn=10),true);
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT set_config('request.jwt.claim.sub',current_setting('crm.test.admin'),true);
SELECT set_config('request.jwt.claims',jsonb_build_object('role','service_role','sub',current_setting('crm.test.admin'))::text,true);

SELECT public.crm_admin_save_office(NULL,'Manager Test A','MGRA','active');
SELECT public.crm_admin_save_office(NULL,'Manager Test B','MGRB','active');
SELECT set_config('crm.test.office_a',(SELECT id::text FROM public.crm_offices WHERE code='MGRA'),true);
SELECT set_config('crm.test.office_b',(SELECT id::text FROM public.crm_offices WHERE code='MGRB'),true);

SELECT public.crm_admin_set_role(current_setting('crm.test.workflow')::uuid,'workflow_manager');
SELECT public.crm_admin_set_role(current_setting('crm.test.retention_manager')::uuid,'retention_manager');
SELECT public.crm_admin_set_role(current_setting('crm.test.desk')::uuid,'desk_manager');
SELECT public.crm_admin_set_role(current_setting('crm.test.agent')::uuid,'agent');
SELECT public.crm_admin_set_role(current_setting('crm.test.retention')::uuid,'retention');
SELECT public.crm_admin_set_role(current_setting('crm.test.other_desk')::uuid,'desk_manager');
SELECT public.crm_admin_set_role(current_setting('crm.test.other_retention')::uuid,'retention');

SELECT public.crm_admin_set_user_office(current_setting('crm.test.workflow')::uuid,current_setting('crm.test.office_a')::uuid);
SELECT public.crm_admin_set_user_office(current_setting('crm.test.retention_manager')::uuid,current_setting('crm.test.office_a')::uuid);
SELECT public.crm_admin_set_user_office(id,current_setting('crm.test.office_b')::uuid)
FROM crm_manager_office_accounts WHERE rn BETWEEN 3 AND 8;
SELECT public.crm_admin_set_user_office(id,current_setting('crm.test.office_a')::uuid)
FROM crm_manager_office_accounts WHERE rn IN (9,10);

-- These manager-to-staff edges intentionally cross Offices.
SELECT public.crm_admin_assign_staff(current_setting('crm.test.desk')::uuid,current_setting('crm.test.workflow')::uuid);
SELECT public.crm_admin_assign_staff(current_setting('crm.test.agent')::uuid,current_setting('crm.test.desk')::uuid);
SELECT public.crm_admin_assign_staff(current_setting('crm.test.retention')::uuid,current_setting('crm.test.retention_manager')::uuid);
SELECT public.crm_admin_set_client_owner(current_setting('crm.test.sales_client')::uuid,'agent',current_setting('crm.test.agent')::uuid);
SELECT public.crm_promote_client_to_retention(current_setting('crm.test.retention_client')::uuid);
SELECT public.crm_admin_set_client_owner(current_setting('crm.test.retention_client')::uuid,'retention',current_setting('crm.test.retention')::uuid);

-- Lower-level assignment edges remain Office-restricted.
DO $$ BEGIN
  BEGIN
    PERFORM public.crm_admin_assign_staff(current_setting('crm.test.agent')::uuid,current_setting('crm.test.other_desk')::uuid);
    RAISE EXCEPTION 'Cross-Office Agent assignment succeeded';
  EXCEPTION WHEN others THEN
    IF SQLERRM<>'Agents can only report to Desk Managers in the same Office' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.crm_admin_set_client_owner(current_setting('crm.test.retention_client')::uuid,'retention',current_setting('crm.test.other_retention')::uuid);
    RAISE EXCEPTION 'Cross-Office Retention client assignment succeeded';
  EXCEPTION WHEN others THEN
    IF SQLERRM<>'Only promoted clients in the same Office can be assigned to Retention users' THEN RAISE; END IF;
  END;
END $$;

SELECT set_config('request.jwt.claim.sub',current_setting('crm.test.workflow'),true);
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',current_setting('crm.test.workflow'))::text,true);
DO $$ DECLARE s jsonb:=public.crm_staff_get_scope(NULL); BEGIN
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s->'clients') item WHERE item->>'id'=current_setting('crm.test.sales_client')) THEN
    RAISE EXCEPTION 'Workflow Manager cannot access another Office Sales client'; END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s->'clients') item WHERE item->>'id'=current_setting('crm.test.unassigned_sales')) THEN
    RAISE EXCEPTION 'Workflow Manager cannot access an unassigned Sales client'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'clients') item WHERE item->>'id'=current_setting('crm.test.retention_client')) THEN
    RAISE EXCEPTION 'Workflow Manager crossed into Retention'; END IF;
  IF jsonb_array_length(s->'offices')<2 OR jsonb_array_length(s->'clients')<2 THEN
    RAISE EXCEPTION 'Workflow Manager scope is not workspace-wide'; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub',current_setting('crm.test.retention_manager'),true);
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',current_setting('crm.test.retention_manager'))::text,true);
DO $$ DECLARE s jsonb:=public.crm_staff_get_scope(NULL); BEGIN
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s->'clients') item WHERE item->>'id'=current_setting('crm.test.retention_client')) THEN
    RAISE EXCEPTION 'Retention Manager cannot access another Office promoted client'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'clients') item WHERE item->>'id'=current_setting('crm.test.sales_client')) THEN
    RAISE EXCEPTION 'Retention Manager crossed into Sales'; END IF;
  IF jsonb_array_length(s->'offices')<2 OR jsonb_array_length(s->'clients')<1 THEN
    RAISE EXCEPTION 'Retention Manager scope is not workspace-wide'; END IF;
END $$;

ROLLBACK;
SELECT 'Workspace manager all-Office access checks passed' result;
