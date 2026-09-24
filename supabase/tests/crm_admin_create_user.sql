-- Service finalization accepts only role-correct reporting lines.
BEGIN;
DO $$ BEGIN
  IF has_function_privilege('authenticated','public.crm_finalize_created_user(uuid,uuid,text,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated users can execute service-only finalization';
  END IF;
  IF NOT has_function_privilege('service_role','public.crm_finalize_created_user(uuid,uuid,text,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Service role cannot finalize CRM users';
  END IF;
END $$;
ROLLBACK;
SELECT 'CRM account finalization permission checks passed' result;
