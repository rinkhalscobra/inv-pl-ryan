-- Office is independent from role and enforced on every assignment edge.
BEGIN;
CREATE TEMP TABLE crm_office_accounts AS
SELECT id,row_number() OVER(ORDER BY id) rn FROM (
  SELECT u.id FROM public.users u LEFT JOIN public.crm_staff_roles s ON s.user_id=u.id
  LEFT JOIN public.crm_client_agent_assignments a ON a.client_id=u.id
  LEFT JOIN public.crm_client_retention_assignments r ON r.client_id=u.id
  WHERE NOT u.is_admin AND NOT u.is_promoted AND s.user_id IS NULL AND a.client_id IS NULL AND r.client_id IS NULL
  LIMIT 4) q;
DO $$ BEGIN IF (SELECT count(*) FROM crm_office_accounts)<4 THEN RAISE EXCEPTION 'Office test needs four free accounts'; END IF; END $$;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM public.users WHERE is_admin ORDER BY id LIMIT 1),true);
SET LOCAL ROLE authenticated;
SELECT public.crm_admin_save_office(NULL,'Office Test A','TSTA','active');
SELECT public.crm_admin_save_office(NULL,'Office Test B','TSTB','active');
SELECT set_config('crm.test.office_a',(SELECT id::text FROM public.crm_offices WHERE code='TSTA'),true);
SELECT set_config('crm.test.office_b',(SELECT id::text FROM public.crm_offices WHERE code='TSTB'),true);
SELECT public.crm_admin_set_role((SELECT id FROM crm_office_accounts WHERE rn=1),'desk_manager');
SELECT public.crm_admin_set_role((SELECT id FROM crm_office_accounts WHERE rn=2),'agent');
SELECT public.crm_admin_set_user_office((SELECT id FROM crm_office_accounts WHERE rn=1),current_setting('crm.test.office_a')::uuid);
SELECT public.crm_admin_set_user_office((SELECT id FROM crm_office_accounts WHERE rn=2),current_setting('crm.test.office_b')::uuid);
DO $$ BEGIN
  BEGIN
    PERFORM public.crm_admin_assign_staff((SELECT id FROM crm_office_accounts WHERE rn=2),(SELECT id FROM crm_office_accounts WHERE rn=1));
    RAISE EXCEPTION 'Cross-Office Agent assignment succeeded';
  EXCEPTION WHEN others THEN
    IF SQLERRM<>'Agents can only report to Desk Managers in the same Office' THEN RAISE; END IF;
  END;
END $$;
SELECT public.crm_admin_set_user_office((SELECT id FROM crm_office_accounts WHERE rn=2),current_setting('crm.test.office_a')::uuid);
SELECT public.crm_admin_assign_staff((SELECT id FROM crm_office_accounts WHERE rn=2),(SELECT id FROM crm_office_accounts WHERE rn=1));
RESET ROLE;
ROLLBACK;
SELECT 'CRM Office isolation checks passed' result;
