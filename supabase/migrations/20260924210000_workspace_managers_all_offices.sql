/* Workspace managers are workspace-wide administrators. Office remains an
   organizational filter for them and a hard assignment/access boundary for
   Desk Managers, Agents, and Retention users. */

CREATE OR REPLACE FUNCTION crm_private.can_actor_view_client(p_actor_id uuid,p_client_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text:=crm_private.actor_role_for(p_actor_id); v_promoted boolean;
BEGIN
  SELECT u.is_promoted INTO v_promoted FROM public.users u
  WHERE u.id=p_client_id AND NOT u.is_admin
    AND NOT EXISTS(SELECT 1 FROM public.crm_staff_roles s WHERE s.user_id=u.id);
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_role='admin' THEN RETURN true; END IF;

  /* Workspace managers see every client in their own workspace, including
     unassigned clients and clients in every current or future Office. */
  IF NOT v_promoted AND v_role='workflow_manager' THEN RETURN true; END IF;
  IF v_promoted AND v_role='retention_manager' THEN RETURN true; END IF;

  /* Office is still a mandatory boundary below the workspace-manager level. */
  IF NOT crm_private.same_office(p_actor_id,p_client_id) THEN RETURN false; END IF;
  IF NOT v_promoted AND v_role='agent' THEN RETURN EXISTS(
    SELECT 1 FROM public.crm_client_agent_assignments c
    WHERE c.client_id=p_client_id AND c.agent_id=p_actor_id);
  ELSIF NOT v_promoted AND v_role='desk_manager' THEN RETURN EXISTS(
    SELECT 1 FROM public.crm_client_agent_assignments c
    JOIN public.crm_agent_desk_assignments ad ON ad.agent_id=c.agent_id
    WHERE c.client_id=p_client_id AND ad.desk_manager_id=p_actor_id
      AND crm_private.same_office(c.agent_id,p_client_id)
      AND crm_private.same_office(c.agent_id,p_actor_id));
  ELSIF v_promoted AND v_role='retention' THEN RETURN EXISTS(
    SELECT 1 FROM public.crm_client_retention_assignments c
    WHERE c.client_id=p_client_id AND c.retention_id=p_actor_id);
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION crm_private.validate_hierarchy_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_TABLE_NAME='crm_workflow_desk_assignments' THEN
    IF crm_private.actor_role_for(NEW.workflow_manager_id)<>'workflow_manager'
       OR crm_private.actor_role_for(NEW.desk_manager_id)<>'desk_manager' THEN
      RAISE EXCEPTION 'Desk Managers can only report to Workflow Managers'; END IF;
  ELSIF TG_TABLE_NAME='crm_agent_desk_assignments' THEN
    IF crm_private.actor_role_for(NEW.desk_manager_id)<>'desk_manager'
       OR crm_private.actor_role_for(NEW.agent_id)<>'agent'
       OR NOT crm_private.same_office(NEW.desk_manager_id,NEW.agent_id) THEN
      RAISE EXCEPTION 'Agents can only report to Desk Managers in the same Office'; END IF;
  ELSIF TG_TABLE_NAME='crm_retention_manager_assignments' THEN
    IF crm_private.actor_role_for(NEW.retention_manager_id)<>'retention_manager'
       OR crm_private.actor_role_for(NEW.retention_id)<>'retention' THEN
      RAISE EXCEPTION 'Retention users can only report to Retention Managers'; END IF;
  ELSIF TG_TABLE_NAME='crm_client_agent_assignments' THEN
    IF crm_private.actor_role_for(NEW.agent_id)<>'agent'
       OR NOT crm_private.same_office(NEW.agent_id,NEW.client_id)
       OR NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=NEW.client_id AND NOT u.is_promoted AND NOT u.is_admin
         AND NOT EXISTS(SELECT 1 FROM public.crm_staff_roles s WHERE s.user_id=u.id)) THEN
      RAISE EXCEPTION 'Only unpromoted Sales leads in the same Office can be assigned to Agents'; END IF;
  ELSIF TG_TABLE_NAME='crm_client_retention_assignments' THEN
    IF crm_private.actor_role_for(NEW.retention_id)<>'retention'
       OR NOT crm_private.same_office(NEW.retention_id,NEW.client_id)
       OR NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=NEW.client_id AND u.is_promoted AND NOT u.is_admin
         AND NOT EXISTS(SELECT 1 FROM public.crm_staff_roles s WHERE s.user_id=u.id)) THEN
      RAISE EXCEPTION 'Only promoted clients in the same Office can be assigned to Retention users'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

/* Moving an Office-scoped team must not pull its workspace manager, or other
   Offices connected through that manager, into the same movement. */
CREATE OR REPLACE FUNCTION public.crm_admin_set_user_office(p_user_id uuid,p_office_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_old uuid; v_scope uuid[]; v_scope_count integer;
BEGIN
  PERFORM public.require_admin();
  IF p_office_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crm_offices WHERE id=p_office_id AND status='active') THEN
    RAISE EXCEPTION 'Select an active Office'; END IF;
  SELECT office_id INTO v_old FROM public.users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF v_old IS NOT DISTINCT FROM p_office_id THEN RETURN; END IF;
  WITH RECURSIVE edges(a,b) AS (
    SELECT agent_id,desk_manager_id FROM public.crm_agent_desk_assignments
    UNION ALL SELECT desk_manager_id,agent_id FROM public.crm_agent_desk_assignments
    UNION ALL SELECT client_id,agent_id FROM public.crm_client_agent_assignments
    UNION ALL SELECT agent_id,client_id FROM public.crm_client_agent_assignments
    UNION ALL SELECT client_id,retention_id FROM public.crm_client_retention_assignments
    UNION ALL SELECT retention_id,client_id FROM public.crm_client_retention_assignments
  ), scope(id) AS (SELECT p_user_id UNION SELECT e.b FROM edges e JOIN scope s ON s.id=e.a)
  SELECT array_agg(id),count(*) INTO v_scope,v_scope_count FROM scope;
  IF v_scope_count>1 AND v_old IS NOT NULL AND p_office_id IS NOT NULL THEN
    RAISE EXCEPTION 'Reassign this account and its team/clients before moving it to another Office'; END IF;
  PERFORM set_config('crm.office_authorized','yes',true);
  UPDATE public.users SET office_id=p_office_id,updated_at=now() WHERE id=ANY(v_scope);
  INSERT INTO public.admin_action_logs(admin_user_id,target_user_id,action,before_data,after_data,reason)
  VALUES(auth.uid(),p_user_id,'crm_user_office_changed',jsonb_build_object('office_id',v_old),jsonb_build_object('office_id',p_office_id,'connected_accounts_updated',v_scope_count),'CRM Office assignment');
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_staff_get_scope(p_search text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text:=crm_private.actor_role(); v_office uuid;
BEGIN
  IF v_role NOT IN ('workflow_manager','desk_manager','agent','retention_manager','retention') THEN RAISE EXCEPTION 'CRM staff access required'; END IF;
  SELECT office_id INTO v_office FROM public.users WHERE id=auth.uid();
  RETURN jsonb_build_object(
    'role',v_role,
    'office',COALESCE((SELECT jsonb_build_object('id',o.id,'name',o.name,'code',o.code) FROM public.crm_offices o WHERE o.id=v_office),'null'::jsonb),
    'offices',CASE WHEN v_role IN ('workflow_manager','retention_manager') THEN
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'code',o.code,'status',o.status) ORDER BY o.name) FROM public.crm_offices o),'[]'::jsonb)
      ELSE COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'code',o.code,'status',o.status)) FROM public.crm_offices o WHERE o.id=v_office),'[]'::jsonb) END,
    'team_members',COALESCE((SELECT jsonb_agg(q.item ORDER BY q.sort_name) FROM (
      SELECT jsonb_build_object(
        'id',u.id,'email',u.email,'first_name',u.first_name,'last_name',u.last_name,
        'role',s.role,'office_id',u.office_id,'office_name',office.name,'office_code',office.code,
        'manager_id',CASE WHEN s.role='desk_manager' THEN wd.workflow_manager_id WHEN s.role='agent' THEN ad.desk_manager_id WHEN s.role='retention' THEN rm.retention_manager_id END
      ) item,COALESCE(u.first_name,u.email) sort_name
      FROM public.users u
      JOIN public.crm_staff_roles s ON s.user_id=u.id
      LEFT JOIN public.crm_workflow_desk_assignments wd ON wd.desk_manager_id=u.id
      LEFT JOIN public.crm_agent_desk_assignments ad ON ad.agent_id=u.id
      LEFT JOIN public.crm_retention_manager_assignments rm ON rm.retention_id=u.id
      LEFT JOIN public.crm_offices office ON office.id=u.office_id
      WHERE (v_role='workflow_manager' AND s.role IN ('desk_manager','agent'))
         OR (v_role='retention_manager' AND s.role='retention')
         OR (v_role='desk_manager' AND s.role='agent' AND ad.desk_manager_id=auth.uid()
             AND crm_private.same_office(auth.uid(),u.id))
    ) q),'[]'::jsonb),
    'clients',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',u.id,'email',u.email,'first_name',u.first_name,'last_name',u.last_name,'country',u.country,'kyc_status',u.kyc_status,
      'created_at',u.created_at,'is_promoted',u.is_promoted,'office_id',u.office_id,'office_name',office.name,'office_code',office.code,
      'owner_id',COALESCE(c.agent_id,d.retention_id),'owner_role',CASE WHEN u.is_promoted THEN 'retention' ELSE 'agent' END,
      'owner_name',COALESCE(NULLIF(btrim(concat_ws(' ',owner.first_name,owner.last_name)),''),owner.email),
      'usdt_balance',COALESCE(b.usdt_balance,0),'usd_balance',COALESCE(b.usd_balance,0),'btc_balance',COALESCE(b.btc_balance,0)
    ) ORDER BY u.created_at DESC)
      FROM public.users u
      LEFT JOIN public.crm_client_agent_assignments c ON c.client_id=u.id
      LEFT JOIN public.crm_client_retention_assignments d ON d.client_id=u.id
      LEFT JOIN public.users owner ON owner.id=COALESCE(c.agent_id,d.retention_id)
      LEFT JOIN public.crm_offices office ON office.id=u.office_id
      LEFT JOIN public.balances b ON b.user_id=u.id
      WHERE crm_private.can_actor_view_client(auth.uid(),u.id)
        AND (p_search IS NULL OR btrim(p_search)='' OR u.email ILIKE '%'||btrim(p_search)||'%' OR COALESCE(u.first_name,'') ILIKE '%'||btrim(p_search)||'%' OR COALESCE(u.last_name,'') ILIKE '%'||btrim(p_search)||'%')),'[]'::jsonb));
END;
$$;

/* Raw Lead Inbox records belong to Sales. Workflow Managers can manage them in
   every Office; the selected Agent must still match the lead's Office. */
CREATE OR REPLACE FUNCTION public.crm_actor_can_manage_lead(p_actor_id uuid,p_lead_id uuid,p_agent_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text:=crm_private.actor_role_for(p_actor_id); v_lead_office uuid;
BEGIN
  IF v_role='admin' THEN RETURN EXISTS(SELECT 1 FROM public.crm_leads WHERE id=p_lead_id); END IF;
  IF v_role<>'workflow_manager' THEN RETURN false; END IF;
  SELECT office_id INTO v_lead_office FROM public.crm_leads WHERE id=p_lead_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_agent_id IS NULL THEN RETURN true; END IF;
  RETURN EXISTS(
    SELECT 1 FROM public.users u
    WHERE u.id=p_agent_id
      AND u.office_id IS NOT DISTINCT FROM v_lead_office
      AND crm_private.actor_role_for(u.id)='agent');
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_set_lead_office_for_actor(p_actor_id uuid,p_lead_id uuid,p_office_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text:=crm_private.actor_role_for(p_actor_id); v_current uuid;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF v_role NOT IN ('admin','workflow_manager') THEN RAISE EXCEPTION 'Lead management access required'; END IF;
  IF p_office_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crm_offices WHERE id=p_office_id AND status='active') THEN RAISE EXCEPTION 'Select an active Office'; END IF;
  SELECT office_id INTO v_current FROM public.crm_leads WHERE id=p_lead_id AND status='new' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Select a new lead'; END IF;
  UPDATE public.crm_leads SET office_id=p_office_id WHERE id=p_lead_id;
  INSERT INTO public.admin_action_logs(admin_user_id,action,before_data,after_data,reason)
  VALUES(p_actor_id,'crm_lead_office_changed',jsonb_build_object('lead_id',p_lead_id,'office_id',v_current),jsonb_build_object('lead_id',p_lead_id,'office_id',p_office_id),'CRM lead Office classification');
END;
$$;

REVOKE ALL ON FUNCTION crm_private.can_actor_view_client(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION crm_private.validate_hierarchy_assignment() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.crm_actor_can_manage_lead(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.crm_set_lead_office_for_actor(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_actor_can_manage_lead(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_set_lead_office_for_actor(uuid,uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
