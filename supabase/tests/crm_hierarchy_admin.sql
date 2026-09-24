BEGIN;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM public.users WHERE is_admin ORDER BY id LIMIT 1),true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF to_regclass('public.crm_agent_retention_assignments') IS NOT NULL THEN RAISE EXCEPTION 'Legacy cross-workspace table still exists'; END IF;
  IF to_regclass('public.crm_workflow_desk_assignments') IS NULL
     OR to_regclass('public.crm_agent_desk_assignments') IS NULL
     OR to_regclass('public.crm_retention_manager_assignments') IS NULL
     OR to_regclass('public.crm_client_assignment_history') IS NULL THEN
    RAISE EXCEPTION 'New hierarchy tables are incomplete';
  END IF;
  IF NOT (public.crm_admin_get_hierarchy() ?& ARRAY['people','workflow_desk_assignments','agent_desk_assignments','retention_assignments','client_assignments','retention_client_assignments']) THEN
    RAISE EXCEPTION 'Hierarchy response is incomplete';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'CRM hierarchy schema checks passed' result;
