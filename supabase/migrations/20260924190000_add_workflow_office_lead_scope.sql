/* Service-side authorization for the raw Lead Inbox. Admin is global;
   Workflow Managers are restricted by Office and their Agent hierarchy. */
CREATE OR REPLACE FUNCTION public.crm_actor_can_manage_lead(p_actor_id uuid,p_lead_id uuid,p_agent_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text:=crm_private.actor_role_for(p_actor_id); v_actor_office uuid; v_lead_office uuid;
BEGIN
  IF v_role='admin' THEN RETURN EXISTS(SELECT 1 FROM public.crm_leads WHERE id=p_lead_id); END IF;
  IF v_role<>'workflow_manager' THEN RETURN false; END IF;
  SELECT office_id INTO v_actor_office FROM public.users WHERE id=p_actor_id;
  SELECT office_id INTO v_lead_office FROM public.crm_leads WHERE id=p_lead_id;
  IF NOT FOUND OR v_actor_office IS DISTINCT FROM v_lead_office THEN RETURN false; END IF;
  IF p_agent_id IS NULL THEN RETURN true; END IF;
  RETURN EXISTS(
    SELECT 1 FROM public.crm_agent_desk_assignments ad
    JOIN public.crm_workflow_desk_assignments wd ON wd.desk_manager_id=ad.desk_manager_id
    WHERE ad.agent_id=p_agent_id AND wd.workflow_manager_id=p_actor_id
      AND crm_private.same_office(p_actor_id,ad.desk_manager_id)
      AND crm_private.same_office(p_actor_id,p_agent_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_set_lead_office_for_actor(p_actor_id uuid,p_lead_id uuid,p_office_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text:=crm_private.actor_role_for(p_actor_id); v_actor_office uuid; v_current uuid;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF v_role NOT IN ('admin','workflow_manager') THEN RAISE EXCEPTION 'Lead management access required'; END IF;
  IF p_office_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crm_offices WHERE id=p_office_id AND status='active') THEN RAISE EXCEPTION 'Select an active Office'; END IF;
  SELECT office_id INTO v_current FROM public.crm_leads WHERE id=p_lead_id AND status='new' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Select a new lead'; END IF;
  IF v_role='workflow_manager' THEN
    SELECT office_id INTO v_actor_office FROM public.users WHERE id=p_actor_id;
    IF p_office_id IS DISTINCT FROM v_actor_office OR (v_current IS NOT NULL AND v_current IS DISTINCT FROM v_actor_office) THEN
      RAISE EXCEPTION 'Workflow Managers can only classify unassigned leads into their own Office'; END IF;
  END IF;
  UPDATE public.crm_leads SET office_id=p_office_id WHERE id=p_lead_id;
  INSERT INTO public.admin_action_logs(admin_user_id,action,before_data,after_data,reason)
  VALUES(p_actor_id,'crm_lead_office_changed',jsonb_build_object('lead_id',p_lead_id,'office_id',v_current),jsonb_build_object('lead_id',p_lead_id,'office_id',p_office_id),'CRM lead Office classification');
END;
$$;

REVOKE ALL ON FUNCTION public.crm_actor_can_manage_lead(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.crm_set_lead_office_for_actor(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_actor_can_manage_lead(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_set_lead_office_for_actor(uuid,uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
