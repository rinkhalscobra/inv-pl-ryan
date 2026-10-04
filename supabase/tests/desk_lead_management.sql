BEGIN;

DO $$
DECLARE
  v_filter regprocedure := 'public.crm_service_filter_lead_ids_by_assignee(uuid,uuid,uuid,integer,text,text,text,text,text,date,date,text)'::regprocedure;
  v_history regprocedure := 'public.crm_service_get_lead_assignment_history(uuid,uuid,uuid)'::regprocedure;
BEGIN
  IF has_table_privilege('authenticated', 'public.crm_leads', 'SELECT') THEN
    RAISE EXCEPTION 'Authenticated users must not receive direct crm_leads access';
  END IF;

  IF has_function_privilege('authenticated', v_filter, 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated users must not call the scoped lead filter directly';
  END IF;
  IF has_function_privilege('authenticated', v_history, 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated users must not call assignment history directly';
  END IF;

  IF NOT has_function_privilege('service_role', v_filter, 'EXECUTE') THEN
    RAISE EXCEPTION 'The Edge Function service role cannot call the scoped lead filter';
  END IF;
  IF NOT has_function_privilege('service_role', v_history, 'EXECUTE') THEN
    RAISE EXCEPTION 'The Edge Function service role cannot call assignment history';
  END IF;
END;
$$;

ROLLBACK;
SELECT 'Desk lead-management permission boundary checks passed' AS result;
