/* Extend the existing workspace/role hierarchy with an independent Office scope.
   Existing records remain valid: office_id is nullable and NULL is treated as
   the explicit unclassified office scope until Admin classifies the record. */

CREATE TABLE public.crm_offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  code text NOT NULL CHECK (code = upper(btrim(code)) AND length(code) BETWEEN 2 AND 20),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (code)
);
CREATE UNIQUE INDEX crm_offices_name_unique_idx ON public.crm_offices(lower(name));
ALTER TABLE public.crm_offices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_offices FROM PUBLIC, anon, authenticated;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS office_id uuid REFERENCES public.crm_offices(id) ON DELETE SET NULL;
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS office_id uuid REFERENCES public.crm_offices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.crm_lead_sources ADD COLUMN IF NOT EXISTS default_office_id uuid REFERENCES public.crm_offices(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS users_office_idx ON public.users(office_id);
CREATE INDEX IF NOT EXISTS crm_leads_office_status_idx ON public.crm_leads(office_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS crm_staff_role_office_idx ON public.crm_staff_roles(role,user_id);

/* These are initial data, not authorization constants. Admin may add any office. */
INSERT INTO public.crm_offices(name,code) VALUES
  ('France','FR'),('Germany','DE'),('Italy','IT'),('Spain','ES')
ON CONFLICT (code) DO NOTHING;

UPDATE public.users u SET office_id=o.id
FROM public.crm_offices o
WHERE u.office_id IS NULL AND NULLIF(btrim(u.country),'') IS NOT NULL
  AND (upper(btrim(u.country))=o.code OR lower(btrim(u.country))=lower(o.name));
UPDATE public.crm_leads l SET office_id=o.id,
  source_metadata=l.source_metadata||jsonb_build_object('incoming_office',l.country)
FROM public.crm_offices o
WHERE l.office_id IS NULL AND NULLIF(btrim(l.country),'') IS NOT NULL
  AND (upper(btrim(l.country))=o.code OR lower(btrim(l.country))=lower(o.name));

/* Preserve every existing hierarchy exactly. If a connected legacy assignment
   cannot be classified consistently from country data, keep that whole connected
   scope unclassified rather than deleting or silently changing assignments. */
DO $$
DECLARE v_changed integer;
BEGIN
  LOOP
    WITH mismatched AS (
      SELECT workflow_manager_id a,desk_manager_id b FROM public.crm_workflow_desk_assignments
      UNION ALL SELECT agent_id,desk_manager_id FROM public.crm_agent_desk_assignments
      UNION ALL SELECT retention_id,retention_manager_id FROM public.crm_retention_manager_assignments
      UNION ALL SELECT client_id,agent_id FROM public.crm_client_agent_assignments
      UNION ALL SELECT client_id,retention_id FROM public.crm_client_retention_assignments
    ), affected AS (
      SELECT m.a id FROM mismatched m JOIN public.users a ON a.id=m.a JOIN public.users b ON b.id=m.b
      WHERE a.office_id IS DISTINCT FROM b.office_id
      UNION
      SELECT m.b FROM mismatched m JOIN public.users a ON a.id=m.a JOIN public.users b ON b.id=m.b
      WHERE a.office_id IS DISTINCT FROM b.office_id
    )
    UPDATE public.users SET office_id=NULL WHERE id IN (SELECT id FROM affected) AND office_id IS NOT NULL;
    GET DIAGNOSTICS v_changed=ROW_COUNT;
    EXIT WHEN v_changed=0;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION crm_private.same_office(p_left uuid,p_right uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT a.office_id IS NOT DISTINCT FROM b.office_id
  FROM public.users a CROSS JOIN public.users b
  WHERE a.id=p_left AND b.id=p_right;
$$;

CREATE OR REPLACE FUNCTION crm_private.can_actor_view_client(p_actor_id uuid,p_client_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text:=crm_private.actor_role_for(p_actor_id); v_promoted boolean;
BEGIN
  SELECT u.is_promoted INTO v_promoted FROM public.users u
  WHERE u.id=p_client_id AND NOT u.is_admin
    AND NOT EXISTS(SELECT 1 FROM public.crm_staff_roles s WHERE s.user_id=u.id);
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_role='admin' THEN RETURN true; END IF;
  IF NOT crm_private.same_office(p_actor_id,p_client_id) THEN RETURN false; END IF;
  IF NOT v_promoted AND v_role='agent' THEN RETURN EXISTS(
    SELECT 1 FROM public.crm_client_agent_assignments c WHERE c.client_id=p_client_id AND c.agent_id=p_actor_id);
  ELSIF NOT v_promoted AND v_role='desk_manager' THEN RETURN EXISTS(
    SELECT 1 FROM public.crm_client_agent_assignments c JOIN public.crm_agent_desk_assignments ad ON ad.agent_id=c.agent_id
    WHERE c.client_id=p_client_id AND ad.desk_manager_id=p_actor_id
      AND crm_private.same_office(c.agent_id,p_client_id) AND crm_private.same_office(c.agent_id,p_actor_id));
  ELSIF NOT v_promoted AND v_role='workflow_manager' THEN RETURN EXISTS(
    SELECT 1 FROM public.crm_client_agent_assignments c
    JOIN public.crm_agent_desk_assignments ad ON ad.agent_id=c.agent_id
    JOIN public.crm_workflow_desk_assignments wd ON wd.desk_manager_id=ad.desk_manager_id
    WHERE c.client_id=p_client_id AND wd.workflow_manager_id=p_actor_id
      AND crm_private.same_office(c.agent_id,p_client_id) AND crm_private.same_office(c.agent_id,ad.desk_manager_id)
      AND crm_private.same_office(ad.desk_manager_id,p_actor_id));
  ELSIF v_promoted AND v_role='retention' THEN RETURN EXISTS(
    SELECT 1 FROM public.crm_client_retention_assignments c WHERE c.client_id=p_client_id AND c.retention_id=p_actor_id);
  ELSIF v_promoted AND v_role='retention_manager' THEN RETURN EXISTS(
    SELECT 1 FROM public.crm_client_retention_assignments c
    JOIN public.crm_retention_manager_assignments rm ON rm.retention_id=c.retention_id
    WHERE c.client_id=p_client_id AND rm.retention_manager_id=p_actor_id
      AND crm_private.same_office(c.retention_id,p_client_id) AND crm_private.same_office(c.retention_id,p_actor_id));
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION crm_private.validate_hierarchy_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_TABLE_NAME='crm_workflow_desk_assignments' THEN
    IF crm_private.actor_role_for(NEW.workflow_manager_id)<>'workflow_manager'
       OR crm_private.actor_role_for(NEW.desk_manager_id)<>'desk_manager'
       OR NOT crm_private.same_office(NEW.workflow_manager_id,NEW.desk_manager_id) THEN
      RAISE EXCEPTION 'Desk Managers can only report to Workflow Managers in the same Office'; END IF;
  ELSIF TG_TABLE_NAME='crm_agent_desk_assignments' THEN
    IF crm_private.actor_role_for(NEW.desk_manager_id)<>'desk_manager'
       OR crm_private.actor_role_for(NEW.agent_id)<>'agent'
       OR NOT crm_private.same_office(NEW.desk_manager_id,NEW.agent_id) THEN
      RAISE EXCEPTION 'Agents can only report to Desk Managers in the same Office'; END IF;
  ELSIF TG_TABLE_NAME='crm_retention_manager_assignments' THEN
    IF crm_private.actor_role_for(NEW.retention_manager_id)<>'retention_manager'
       OR crm_private.actor_role_for(NEW.retention_id)<>'retention'
       OR NOT crm_private.same_office(NEW.retention_manager_id,NEW.retention_id) THEN
      RAISE EXCEPTION 'Retention users can only report to Retention Managers in the same Office'; END IF;
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

CREATE OR REPLACE FUNCTION crm_private.protect_client_security_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.role()='service_role' THEN RETURN NEW; END IF;
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin AND crm_private.actor_role_for(auth.uid())<>'admin' THEN
    RAISE EXCEPTION 'Only administrators can change administrator access'; END IF;
  IF NEW.is_promoted IS DISTINCT FROM OLD.is_promoted
     AND COALESCE(current_setting('crm.promotion_authorized',true),'')<>'yes' THEN
    RAISE EXCEPTION 'Promotion state can only be changed through the CRM promotion workflow'; END IF;
  IF NEW.office_id IS DISTINCT FROM OLD.office_id
     AND COALESCE(current_setting('crm.office_authorized',true),'')<>'yes' THEN
    RAISE EXCEPTION 'Office can only be changed through the CRM Office workflow'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS crm_protect_client_security_state_trigger ON public.users;
CREATE TRIGGER crm_protect_client_security_state_trigger
BEFORE UPDATE OF is_admin,is_promoted,office_id ON public.users
FOR EACH ROW EXECUTE FUNCTION crm_private.protect_client_security_state();

CREATE OR REPLACE FUNCTION public.crm_admin_save_office(p_office_id uuid,p_name text,p_code text,p_status text DEFAULT 'active')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_office public.crm_offices%ROWTYPE; v_code text:=upper(btrim(COALESCE(p_code,'')));
BEGIN
  PERFORM public.require_admin();
  IF length(btrim(COALESCE(p_name,''))) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Enter an Office name'; END IF;
  IF length(v_code) NOT BETWEEN 2 AND 20 OR v_code!~'^[A-Z0-9_-]+$' THEN RAISE EXCEPTION 'Use a 2-20 character Office code'; END IF;
  IF p_status NOT IN ('active','inactive') THEN RAISE EXCEPTION 'Invalid Office status'; END IF;
  IF p_office_id IS NULL THEN
    INSERT INTO public.crm_offices(name,code,status,created_by) VALUES(btrim(p_name),v_code,p_status,auth.uid()) RETURNING * INTO v_office;
  ELSE
    UPDATE public.crm_offices SET name=btrim(p_name),code=v_code,status=p_status,updated_at=now()
    WHERE id=p_office_id RETURNING * INTO v_office;
    IF NOT FOUND THEN RAISE EXCEPTION 'Office not found'; END IF;
  END IF;
  INSERT INTO public.admin_action_logs(admin_user_id,action,after_data,reason)
  VALUES(auth.uid(),'crm_office_saved',to_jsonb(v_office),'CRM Office management');
  RETURN to_jsonb(v_office);
END;
$$;

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
    SELECT workflow_manager_id,desk_manager_id FROM public.crm_workflow_desk_assignments
    UNION ALL SELECT desk_manager_id,workflow_manager_id FROM public.crm_workflow_desk_assignments
    UNION ALL SELECT agent_id,desk_manager_id FROM public.crm_agent_desk_assignments
    UNION ALL SELECT desk_manager_id,agent_id FROM public.crm_agent_desk_assignments
    UNION ALL SELECT retention_id,retention_manager_id FROM public.crm_retention_manager_assignments
    UNION ALL SELECT retention_manager_id,retention_id FROM public.crm_retention_manager_assignments
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

CREATE OR REPLACE FUNCTION public.crm_admin_set_lead_office(p_lead_id uuid,p_office_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_old uuid;
BEGIN
  PERFORM public.require_admin();
  IF p_office_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crm_offices WHERE id=p_office_id AND status='active') THEN RAISE EXCEPTION 'Select an active Office'; END IF;
  SELECT office_id INTO v_old FROM public.crm_leads WHERE id=p_lead_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found'; END IF;
  UPDATE public.crm_leads SET office_id=p_office_id WHERE id=p_lead_id;
  INSERT INTO public.admin_action_logs(admin_user_id,action,before_data,after_data,reason)
  VALUES(auth.uid(),'crm_lead_office_changed',jsonb_build_object('lead_id',p_lead_id,'office_id',v_old),jsonb_build_object('lead_id',p_lead_id,'office_id',p_office_id),'CRM lead classification');
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_service_set_user_office(p_user_id uuid,p_office_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_old uuid; v_has_assignments boolean;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_office_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crm_offices WHERE id=p_office_id AND status='active') THEN RAISE EXCEPTION 'Select an active Office'; END IF;
  SELECT office_id INTO v_old FROM public.users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF v_old IS NOT NULL THEN
    IF p_office_id IS NULL OR v_old IS NOT DISTINCT FROM p_office_id THEN RETURN; END IF;
    RAISE EXCEPTION 'Existing account belongs to a different Office';
  END IF;
  SELECT EXISTS(
    SELECT 1 FROM public.crm_workflow_desk_assignments WHERE workflow_manager_id=p_user_id OR desk_manager_id=p_user_id
    UNION ALL SELECT 1 FROM public.crm_agent_desk_assignments WHERE agent_id=p_user_id OR desk_manager_id=p_user_id
    UNION ALL SELECT 1 FROM public.crm_retention_manager_assignments WHERE retention_id=p_user_id OR retention_manager_id=p_user_id
    UNION ALL SELECT 1 FROM public.crm_client_agent_assignments WHERE client_id=p_user_id OR agent_id=p_user_id
    UNION ALL SELECT 1 FROM public.crm_client_retention_assignments WHERE client_id=p_user_id OR retention_id=p_user_id
  ) INTO v_has_assignments;
  IF v_has_assignments THEN RETURN; END IF;
  PERFORM set_config('crm.office_authorized','yes',true);
  UPDATE public.users SET office_id=p_office_id,updated_at=now() WHERE id=p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_admin_get_hierarchy()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN jsonb_build_object(
    'offices',COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.name) FROM public.crm_offices o),'[]'::jsonb),
    'people',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',u.id,'email',u.email,'first_name',u.first_name,'last_name',u.last_name,'created_at',u.created_at,
      'is_promoted',u.is_promoted,'office_id',u.office_id,'office_name',o.name,'office_code',o.code,
      'role',CASE WHEN u.is_admin THEN 'admin' ELSE COALESCE(s.role,'client') END) ORDER BY u.created_at DESC)
      FROM public.users u LEFT JOIN public.crm_staff_roles s ON s.user_id=u.id LEFT JOIN public.crm_offices o ON o.id=u.office_id),'[]'::jsonb),
    'workflow_desk_assignments',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.crm_workflow_desk_assignments x),'[]'::jsonb),
    'agent_desk_assignments',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.crm_agent_desk_assignments x),'[]'::jsonb),
    'retention_assignments',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.crm_retention_manager_assignments x),'[]'::jsonb),
    'client_assignments',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.crm_client_agent_assignments x),'[]'::jsonb),
    'retention_client_assignments',COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.crm_client_retention_assignments x),'[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_staff_get_scope(p_search text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text:=crm_private.actor_role(); v_office uuid;
BEGIN
  IF v_role NOT IN ('workflow_manager','desk_manager','agent','retention_manager','retention') THEN RAISE EXCEPTION 'CRM staff access required'; END IF;
  SELECT office_id INTO v_office FROM public.users WHERE id=auth.uid();
  RETURN jsonb_build_object('role',v_role,'office',COALESCE((SELECT jsonb_build_object('id',o.id,'name',o.name,'code',o.code) FROM public.crm_offices o WHERE o.id=v_office),'null'::jsonb),
    'team_members',COALESCE((SELECT jsonb_agg(q.item ORDER BY q.sort_name) FROM (
      SELECT jsonb_build_object('id',u.id,'email',u.email,'first_name',u.first_name,'last_name',u.last_name,'role',s.role,'office_id',u.office_id,'manager_id',
        CASE WHEN s.role='desk_manager' THEN wd.workflow_manager_id WHEN s.role='agent' THEN ad.desk_manager_id WHEN s.role='retention' THEN rm.retention_manager_id END) item,
        COALESCE(u.first_name,u.email) sort_name
      FROM public.users u JOIN public.crm_staff_roles s ON s.user_id=u.id
      LEFT JOIN public.crm_workflow_desk_assignments wd ON wd.desk_manager_id=u.id
      LEFT JOIN public.crm_agent_desk_assignments ad ON ad.agent_id=u.id
      LEFT JOIN public.crm_retention_manager_assignments rm ON rm.retention_id=u.id
      WHERE u.office_id IS NOT DISTINCT FROM v_office AND (
        (v_role='workflow_manager' AND ((s.role='desk_manager' AND wd.workflow_manager_id=auth.uid()) OR (s.role='agent' AND EXISTS(SELECT 1 FROM public.crm_workflow_desk_assignments x WHERE x.desk_manager_id=ad.desk_manager_id AND x.workflow_manager_id=auth.uid()))))
        OR (v_role='desk_manager' AND s.role='agent' AND ad.desk_manager_id=auth.uid())
        OR (v_role='retention_manager' AND s.role='retention' AND rm.retention_manager_id=auth.uid()))) q),'[]'::jsonb),
    'clients',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',u.id,'email',u.email,'first_name',u.first_name,'last_name',u.last_name,'country',u.country,'kyc_status',u.kyc_status,
      'created_at',u.created_at,'is_promoted',u.is_promoted,'office_id',u.office_id,'office_name',office.name,'office_code',office.code,
      'owner_id',COALESCE(c.agent_id,d.retention_id),'owner_role',CASE WHEN u.is_promoted THEN 'retention' ELSE 'agent' END,
      'owner_name',COALESCE(NULLIF(btrim(concat_ws(' ',owner.first_name,owner.last_name)),''),owner.email),
      'usdt_balance',COALESCE(b.usdt_balance,0),'usd_balance',COALESCE(b.usd_balance,0),'btc_balance',COALESCE(b.btc_balance,0)) ORDER BY u.created_at DESC)
      FROM public.users u LEFT JOIN public.crm_client_agent_assignments c ON c.client_id=u.id
      LEFT JOIN public.crm_client_retention_assignments d ON d.client_id=u.id LEFT JOIN public.users owner ON owner.id=COALESCE(c.agent_id,d.retention_id)
      LEFT JOIN public.crm_offices office ON office.id=u.office_id LEFT JOIN public.balances b ON b.user_id=u.id
      WHERE crm_private.can_actor_view_client(auth.uid(),u.id)
        AND (p_search IS NULL OR btrim(p_search)='' OR u.email ILIKE '%'||btrim(p_search)||'%' OR COALESCE(u.first_name,'') ILIKE '%'||btrim(p_search)||'%' OR COALESCE(u.last_name,'') ILIKE '%'||btrim(p_search)||'%')),'[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_promote_client_to_retention(p_client_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text:=crm_private.actor_role(); v_agent uuid; v_desk uuid; v_workflow uuid; v_assigned_at timestamptz; v_office uuid;
BEGIN
  IF v_role NOT IN ('admin','workflow_manager') THEN RAISE EXCEPTION 'Only Admin or a Workflow Manager can promote leads'; END IF;
  SELECT u.office_id INTO v_office FROM public.users u WHERE u.id=p_client_id AND NOT u.is_promoted AND NOT u.is_admin
    AND NOT EXISTS(SELECT 1 FROM public.crm_staff_roles s WHERE s.user_id=u.id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Select an unpromoted lead'; END IF;
  IF v_role='workflow_manager' AND NOT crm_private.can_actor_view_client(auth.uid(),p_client_id) THEN RAISE EXCEPTION 'This lead is outside your Sales and Office scope'; END IF;
  SELECT c.agent_id,c.assigned_at,ad.desk_manager_id,wd.workflow_manager_id INTO v_agent,v_assigned_at,v_desk,v_workflow
  FROM public.crm_client_agent_assignments c LEFT JOIN public.crm_agent_desk_assignments ad ON ad.agent_id=c.agent_id
  LEFT JOIN public.crm_workflow_desk_assignments wd ON wd.desk_manager_id=ad.desk_manager_id WHERE c.client_id=p_client_id;
  INSERT INTO public.crm_client_assignment_history(client_id,workspace,owner_role,owner_id,workflow_manager_id,desk_manager_id,started_at,recorded_by,reason,details)
  VALUES(p_client_id,'sales','agent',v_agent,v_workflow,v_desk,v_assigned_at,auth.uid(),'Promoted from Sales to Retention',jsonb_build_object('office_id',v_office));
  DELETE FROM public.crm_client_agent_assignments WHERE client_id=p_client_id;
  PERFORM set_config('crm.promotion_authorized','yes',true);
  UPDATE public.users SET is_promoted=true,promoted_at=now(),promoted_by=auth.uid(),updated_at=now() WHERE id=p_client_id;
  INSERT INTO public.admin_action_logs(admin_user_id,target_user_id,action,before_data,after_data,reason)
  VALUES(auth.uid(),p_client_id,'crm_client_promoted',jsonb_build_object('workspace','sales','office_id',v_office,'agent_id',v_agent,'desk_manager_id',v_desk,'workflow_manager_id',v_workflow),jsonb_build_object('workspace','retention','office_id',v_office,'owner_id',NULL),'Promoted to Retention');
END;
$$;

REVOKE ALL ON FUNCTION crm_private.same_office(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.crm_admin_save_office(uuid,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.crm_admin_set_user_office(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.crm_admin_set_lead_office(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.crm_service_set_user_office(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_admin_save_office(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_admin_set_user_office(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_admin_set_lead_office(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_service_set_user_office(uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
