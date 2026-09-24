/* Split CRM authorization into two isolated branches:

   Sales:     workflow_manager -> desk_manager -> agent -> unpromoted client
   Retention: retention_manager -> retention -> promoted client

   The legacy retention -> agent relationship is archived and removed. */

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_promoted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoted_at timestamptz,
  ADD COLUMN IF NOT EXISTS promoted_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.crm_staff_roles DROP CONSTRAINT IF EXISTS crm_staff_roles_role_check;
ALTER TABLE public.crm_staff_roles ADD CONSTRAINT crm_staff_roles_role_check
  CHECK (role IN ('workflow_manager', 'desk_manager', 'agent', 'retention_manager', 'retention'));

CREATE TABLE IF NOT EXISTS public.crm_workflow_desk_assignments (
  desk_manager_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  workflow_manager_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS crm_workflow_desk_by_workflow
  ON public.crm_workflow_desk_assignments(workflow_manager_id);

CREATE TABLE IF NOT EXISTS public.crm_agent_desk_assignments (
  agent_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  desk_manager_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS crm_agent_desk_by_desk
  ON public.crm_agent_desk_assignments(desk_manager_id);

CREATE TABLE IF NOT EXISTS public.crm_retention_manager_assignments (
  retention_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  retention_manager_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS crm_retention_by_manager
  ON public.crm_retention_manager_assignments(retention_manager_id);

CREATE TABLE IF NOT EXISTS public.crm_client_assignment_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  workspace text NOT NULL CHECK (workspace IN ('sales', 'retention')),
  owner_role text,
  owner_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  workflow_manager_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  desk_manager_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  started_at timestamptz,
  ended_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reason text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS crm_client_assignment_history_client
  ON public.crm_client_assignment_history(client_id, ended_at DESC);

ALTER TABLE public.crm_workflow_desk_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_agent_desk_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_retention_manager_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_client_assignment_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_workflow_desk_assignments, public.crm_agent_desk_assignments,
  public.crm_retention_manager_assignments, public.crm_client_assignment_history
  FROM PUBLIC, anon, authenticated;

/* Preserve the old direct-retention ownership for reporting, then move those
   clients across the workspace boundary without granting the old owner access. */
INSERT INTO public.crm_client_assignment_history(
  client_id, workspace, owner_role, owner_id, started_at, ended_at, reason, details
)
SELECT d.client_id, 'retention', 'legacy_retention', d.retention_id,
  d.assigned_at, now(), 'Legacy direct-retention assignment removed during hierarchy split',
  jsonb_build_object('legacy_table', 'crm_client_retention_assignments')
FROM public.crm_client_retention_assignments d;

UPDATE public.users u
SET is_promoted = true,
    promoted_at = COALESCE(u.promoted_at, now()),
    updated_at = now()
WHERE EXISTS (SELECT 1 FROM public.crm_client_retention_assignments d WHERE d.client_id = u.id);

DELETE FROM public.crm_client_retention_assignments;

/* The old retention role represented the supervising manager. */
UPDATE public.crm_staff_roles SET role = 'retention_manager' WHERE role = 'retention';

DROP FUNCTION IF EXISTS public.crm_admin_assign_agent(uuid, uuid);
DROP FUNCTION IF EXISTS public.crm_admin_promote_agent(uuid, uuid);
DROP TABLE IF EXISTS public.crm_agent_retention_assignments;

CREATE OR REPLACE FUNCTION crm_private.actor_role_for(p_actor_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role text;
BEGIN
  IF p_actor_id IS NULL THEN RETURN 'none'; END IF;
  IF EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_actor_id AND u.is_admin = true) THEN
    RETURN 'admin';
  END IF;
  SELECT s.role INTO v_role FROM public.crm_staff_roles s WHERE s.user_id = p_actor_id;
  RETURN COALESCE(v_role, 'client');
END;
$$;

CREATE OR REPLACE FUNCTION crm_private.actor_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT crm_private.actor_role_for(auth.uid());
$$;

CREATE OR REPLACE FUNCTION crm_private.can_actor_view_client(p_actor_id uuid, p_client_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_role text := crm_private.actor_role_for(p_actor_id);
  v_promoted boolean;
BEGIN
  SELECT u.is_promoted INTO v_promoted
  FROM public.users u
  WHERE u.id = p_client_id
    AND NOT u.is_admin
    AND NOT EXISTS (SELECT 1 FROM public.crm_staff_roles s WHERE s.user_id = u.id);
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_role = 'admin' THEN RETURN true; END IF;

  IF NOT v_promoted AND v_role = 'agent' THEN
    RETURN EXISTS (SELECT 1 FROM public.crm_client_agent_assignments c
      WHERE c.client_id = p_client_id AND c.agent_id = p_actor_id);
  END IF;
  IF NOT v_promoted AND v_role = 'desk_manager' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.crm_client_agent_assignments c
      JOIN public.crm_agent_desk_assignments ad ON ad.agent_id = c.agent_id
      WHERE c.client_id = p_client_id AND ad.desk_manager_id = p_actor_id
    );
  END IF;
  IF NOT v_promoted AND v_role = 'workflow_manager' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.crm_client_agent_assignments c
      JOIN public.crm_agent_desk_assignments ad ON ad.agent_id = c.agent_id
      JOIN public.crm_workflow_desk_assignments wd ON wd.desk_manager_id = ad.desk_manager_id
      WHERE c.client_id = p_client_id AND wd.workflow_manager_id = p_actor_id
    );
  END IF;
  IF v_promoted AND v_role = 'retention' THEN
    RETURN EXISTS (SELECT 1 FROM public.crm_client_retention_assignments c
      WHERE c.client_id = p_client_id AND c.retention_id = p_actor_id);
  END IF;
  IF v_promoted AND v_role = 'retention_manager' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.crm_client_retention_assignments c
      JOIN public.crm_retention_manager_assignments rm ON rm.retention_id = c.retention_id
      WHERE c.client_id = p_client_id AND rm.retention_manager_id = p_actor_id
    );
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION crm_private.can_view_client(p_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT crm_private.can_actor_view_client(auth.uid(), p_client_id);
$$;

CREATE OR REPLACE FUNCTION public.crm_actor_can_view_client(p_actor_id uuid, p_client_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  RETURN crm_private.can_actor_view_client(p_actor_id, p_client_id);
END;
$$;

CREATE OR REPLACE FUNCTION crm_private.validate_hierarchy_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_NAME = 'crm_workflow_desk_assignments' THEN
    IF crm_private.actor_role_for(NEW.workflow_manager_id) <> 'workflow_manager'
       OR crm_private.actor_role_for(NEW.desk_manager_id) <> 'desk_manager' THEN
      RAISE EXCEPTION 'Desk Managers can only report to Workflow Managers';
    END IF;
  ELSIF TG_TABLE_NAME = 'crm_agent_desk_assignments' THEN
    IF crm_private.actor_role_for(NEW.desk_manager_id) <> 'desk_manager'
       OR crm_private.actor_role_for(NEW.agent_id) <> 'agent' THEN
      RAISE EXCEPTION 'Agents can only report to Desk Managers';
    END IF;
  ELSIF TG_TABLE_NAME = 'crm_retention_manager_assignments' THEN
    IF crm_private.actor_role_for(NEW.retention_manager_id) <> 'retention_manager'
       OR crm_private.actor_role_for(NEW.retention_id) <> 'retention' THEN
      RAISE EXCEPTION 'Retention users can only report to Retention Managers';
    END IF;
  ELSIF TG_TABLE_NAME = 'crm_client_agent_assignments' THEN
    IF crm_private.actor_role_for(NEW.agent_id) <> 'agent'
       OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.client_id AND NOT u.is_promoted
         AND NOT u.is_admin AND NOT EXISTS (SELECT 1 FROM public.crm_staff_roles s WHERE s.user_id = u.id)) THEN
      RAISE EXCEPTION 'Only unpromoted Sales leads can be assigned to Agents';
    END IF;
  ELSIF TG_TABLE_NAME = 'crm_client_retention_assignments' THEN
    IF crm_private.actor_role_for(NEW.retention_id) <> 'retention'
       OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.client_id AND u.is_promoted
         AND NOT u.is_admin AND NOT EXISTS (SELECT 1 FROM public.crm_staff_roles s WHERE s.user_id = u.id)) THEN
      RAISE EXCEPTION 'Only promoted clients can be assigned to Retention users';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_validate_workflow_desk ON public.crm_workflow_desk_assignments;
CREATE TRIGGER crm_validate_workflow_desk BEFORE INSERT OR UPDATE ON public.crm_workflow_desk_assignments
FOR EACH ROW EXECUTE FUNCTION crm_private.validate_hierarchy_assignment();
DROP TRIGGER IF EXISTS crm_validate_agent_desk ON public.crm_agent_desk_assignments;
CREATE TRIGGER crm_validate_agent_desk BEFORE INSERT OR UPDATE ON public.crm_agent_desk_assignments
FOR EACH ROW EXECUTE FUNCTION crm_private.validate_hierarchy_assignment();
DROP TRIGGER IF EXISTS crm_validate_retention_manager ON public.crm_retention_manager_assignments;
CREATE TRIGGER crm_validate_retention_manager BEFORE INSERT OR UPDATE ON public.crm_retention_manager_assignments
FOR EACH ROW EXECUTE FUNCTION crm_private.validate_hierarchy_assignment();
DROP TRIGGER IF EXISTS crm_validate_client_agent ON public.crm_client_agent_assignments;
CREATE TRIGGER crm_validate_client_agent BEFORE INSERT OR UPDATE ON public.crm_client_agent_assignments
FOR EACH ROW EXECUTE FUNCTION crm_private.validate_hierarchy_assignment();
DROP TRIGGER IF EXISTS crm_validate_client_retention ON public.crm_client_retention_assignments;
CREATE TRIGGER crm_validate_client_retention BEFORE INSERT OR UPDATE ON public.crm_client_retention_assignments
FOR EACH ROW EXECUTE FUNCTION crm_private.validate_hierarchy_assignment();

CREATE OR REPLACE FUNCTION crm_private.protect_client_security_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
     AND crm_private.actor_role_for(auth.uid()) <> 'admin' THEN
    RAISE EXCEPTION 'Only administrators can change administrator access';
  END IF;
  IF NEW.is_promoted IS DISTINCT FROM OLD.is_promoted
     AND crm_private.actor_role_for(auth.uid()) <> 'admin'
     AND COALESCE(current_setting('crm.promotion_authorized', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'Promotion state can only be changed through the CRM promotion workflow';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS crm_protect_client_security_state_trigger ON public.users;
CREATE TRIGGER crm_protect_client_security_state_trigger
BEFORE UPDATE OF is_admin, is_promoted ON public.users
FOR EACH ROW EXECUTE FUNCTION crm_private.protect_client_security_state();

CREATE OR REPLACE FUNCTION crm_private.clear_staff_on_admin_promotion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.is_admin = true AND OLD.is_admin IS DISTINCT FROM NEW.is_admin THEN
    DELETE FROM public.crm_client_agent_assignments WHERE client_id = NEW.id OR agent_id = NEW.id;
    DELETE FROM public.crm_client_retention_assignments WHERE client_id = NEW.id OR retention_id = NEW.id;
    DELETE FROM public.crm_agent_desk_assignments WHERE agent_id = NEW.id OR desk_manager_id = NEW.id;
    DELETE FROM public.crm_workflow_desk_assignments WHERE desk_manager_id = NEW.id OR workflow_manager_id = NEW.id;
    DELETE FROM public.crm_retention_manager_assignments WHERE retention_id = NEW.id OR retention_manager_id = NEW.id;
    DELETE FROM public.crm_staff_roles WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_admin_get_hierarchy()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN jsonb_build_object(
    'people', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', u.id, 'email', u.email, 'first_name', u.first_name, 'last_name', u.last_name,
      'created_at', u.created_at, 'is_promoted', u.is_promoted,
      'role', CASE WHEN u.is_admin THEN 'admin' ELSE COALESCE(s.role, 'client') END
    ) ORDER BY u.created_at DESC) FROM public.users u LEFT JOIN public.crm_staff_roles s ON s.user_id = u.id), '[]'::jsonb),
    'workflow_desk_assignments', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.crm_workflow_desk_assignments x), '[]'::jsonb),
    'agent_desk_assignments', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.crm_agent_desk_assignments x), '[]'::jsonb),
    'retention_assignments', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.crm_retention_manager_assignments x), '[]'::jsonb),
    'client_assignments', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.crm_client_agent_assignments x), '[]'::jsonb),
    'retention_client_assignments', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.crm_client_retention_assignments x), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_admin_set_role(p_user_id uuid, p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_old_role text; v_is_admin boolean;
BEGIN
  PERFORM public.require_admin();
  IF p_role IS NULL OR p_role NOT IN ('client','workflow_manager','desk_manager','agent','retention_manager','retention','admin') THEN
    RAISE EXCEPTION 'Invalid CRM role';
  END IF;
  SELECT u.is_admin INTO v_is_admin FROM public.users u WHERE u.id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF p_user_id = auth.uid() AND p_role <> 'admin' THEN RAISE EXCEPTION 'You cannot remove your own administrator role'; END IF;
  v_old_role := crm_private.actor_role_for(p_user_id);
  IF v_old_role = p_role THEN RETURN; END IF;

  DELETE FROM public.crm_client_agent_assignments WHERE client_id = p_user_id OR agent_id = p_user_id;
  DELETE FROM public.crm_client_retention_assignments WHERE client_id = p_user_id OR retention_id = p_user_id;
  DELETE FROM public.crm_agent_desk_assignments WHERE agent_id = p_user_id OR desk_manager_id = p_user_id;
  DELETE FROM public.crm_workflow_desk_assignments WHERE desk_manager_id = p_user_id OR workflow_manager_id = p_user_id;
  DELETE FROM public.crm_retention_manager_assignments WHERE retention_id = p_user_id OR retention_manager_id = p_user_id;
  DELETE FROM public.crm_staff_roles WHERE user_id = p_user_id;

  IF p_role = 'admin' THEN
    UPDATE public.users SET is_admin = true, updated_at = now() WHERE id = p_user_id;
  ELSE
    IF v_is_admin THEN UPDATE public.users SET is_admin = false, updated_at = now() WHERE id = p_user_id; END IF;
    IF p_role = 'client' THEN
      PERFORM set_config('crm.promotion_authorized', 'yes', true);
      UPDATE public.users
      SET is_promoted = false, promoted_at = NULL, promoted_by = NULL, updated_at = now()
      WHERE id = p_user_id;
    END IF;
    IF p_role <> 'client' THEN INSERT INTO public.crm_staff_roles(user_id, role) VALUES (p_user_id, p_role); END IF;
  END IF;
  INSERT INTO public.admin_action_logs(admin_user_id,target_user_id,action,before_data,after_data,reason)
  VALUES(auth.uid(),p_user_id,'crm_role_changed',jsonb_build_object('role',v_old_role),jsonb_build_object('role',p_role),'CRM hierarchy update');
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_admin_assign_staff(p_user_id uuid, p_manager_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role text; v_manager_role text; v_previous uuid;
BEGIN
  PERFORM public.require_admin();
  v_role := crm_private.actor_role_for(p_user_id);
  v_manager_role := crm_private.actor_role_for(p_manager_id);
  IF v_role = 'desk_manager' THEN
    IF p_manager_id IS NOT NULL AND v_manager_role <> 'workflow_manager' THEN RAISE EXCEPTION 'Desk Managers can only report to Workflow Managers'; END IF;
    SELECT workflow_manager_id INTO v_previous FROM public.crm_workflow_desk_assignments WHERE desk_manager_id=p_user_id;
    DELETE FROM public.crm_workflow_desk_assignments WHERE desk_manager_id=p_user_id;
    IF p_manager_id IS NOT NULL THEN INSERT INTO public.crm_workflow_desk_assignments VALUES(p_user_id,p_manager_id,now(),auth.uid()); END IF;
  ELSIF v_role = 'agent' THEN
    IF p_manager_id IS NOT NULL AND v_manager_role <> 'desk_manager' THEN RAISE EXCEPTION 'Agents can only report to Desk Managers'; END IF;
    SELECT desk_manager_id INTO v_previous FROM public.crm_agent_desk_assignments WHERE agent_id=p_user_id;
    DELETE FROM public.crm_agent_desk_assignments WHERE agent_id=p_user_id;
    IF p_manager_id IS NOT NULL THEN INSERT INTO public.crm_agent_desk_assignments VALUES(p_user_id,p_manager_id,now(),auth.uid()); END IF;
  ELSIF v_role = 'retention' THEN
    IF p_manager_id IS NOT NULL AND v_manager_role <> 'retention_manager' THEN RAISE EXCEPTION 'Retention users can only report to Retention Managers'; END IF;
    SELECT retention_manager_id INTO v_previous FROM public.crm_retention_manager_assignments WHERE retention_id=p_user_id;
    DELETE FROM public.crm_retention_manager_assignments WHERE retention_id=p_user_id;
    IF p_manager_id IS NOT NULL THEN INSERT INTO public.crm_retention_manager_assignments VALUES(p_user_id,p_manager_id,now(),auth.uid()); END IF;
  ELSIF v_role IN ('workflow_manager','retention_manager') THEN
    IF p_manager_id IS NOT NULL THEN RAISE EXCEPTION 'This manager reports directly to Admin'; END IF;
  ELSE RAISE EXCEPTION 'Select a CRM staff account'; END IF;
  INSERT INTO public.admin_action_logs(admin_user_id,target_user_id,action,before_data,after_data,reason)
  VALUES(auth.uid(),p_user_id,'crm_staff_assignment_changed',jsonb_build_object('manager_id',v_previous),jsonb_build_object('manager_id',p_manager_id),'CRM hierarchy update');
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_admin_set_client_owner(p_client_id uuid, p_owner_role text, p_owner_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_promoted boolean; v_old_agent uuid; v_old_retention uuid;
BEGIN
  PERFORM public.require_admin();
  SELECT u.is_promoted INTO v_promoted FROM public.users u
  WHERE u.id=p_client_id AND NOT u.is_admin AND NOT EXISTS(SELECT 1 FROM public.crm_staff_roles s WHERE s.user_id=u.id)
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Select a client account'; END IF;
  IF p_owner_role NOT IN ('agent','retention','unassigned') THEN RAISE EXCEPTION 'Invalid client owner type'; END IF;
  IF (p_owner_role='unassigned' AND p_owner_id IS NOT NULL) OR (p_owner_role<>'unassigned' AND p_owner_id IS NULL) THEN RAISE EXCEPTION 'Select an account for this owner type'; END IF;
  IF NOT v_promoted AND p_owner_role NOT IN ('agent','unassigned') THEN RAISE EXCEPTION 'Unpromoted leads can only be assigned to Agents'; END IF;
  IF v_promoted AND p_owner_role NOT IN ('retention','unassigned') THEN RAISE EXCEPTION 'Promoted clients can only be assigned to Retention users'; END IF;
  IF p_owner_role <> 'unassigned' AND crm_private.actor_role_for(p_owner_id) <> p_owner_role THEN RAISE EXCEPTION 'The selected owner has the wrong workspace role'; END IF;
  SELECT agent_id INTO v_old_agent FROM public.crm_client_agent_assignments WHERE client_id=p_client_id;
  SELECT retention_id INTO v_old_retention FROM public.crm_client_retention_assignments WHERE client_id=p_client_id;
  DELETE FROM public.crm_client_agent_assignments WHERE client_id=p_client_id;
  DELETE FROM public.crm_client_retention_assignments WHERE client_id=p_client_id;
  IF p_owner_role='agent' THEN INSERT INTO public.crm_client_agent_assignments(client_id,agent_id,assigned_by) VALUES(p_client_id,p_owner_id,auth.uid());
  ELSIF p_owner_role='retention' THEN INSERT INTO public.crm_client_retention_assignments(client_id,retention_id,assigned_by) VALUES(p_client_id,p_owner_id,auth.uid()); END IF;
  INSERT INTO public.admin_action_logs(admin_user_id,target_user_id,action,before_data,after_data,reason)
  VALUES(auth.uid(),p_client_id,'crm_client_owner_changed',jsonb_build_object('agent_id',v_old_agent,'retention_id',v_old_retention),jsonb_build_object('owner_role',p_owner_role,'owner_id',p_owner_id),'CRM hierarchy update');
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_promote_client_to_retention(p_client_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role text:=crm_private.actor_role(); v_agent uuid; v_desk uuid; v_workflow uuid; v_assigned_at timestamptz;
BEGIN
  IF v_role NOT IN ('admin','workflow_manager') THEN RAISE EXCEPTION 'Only Admin or a Workflow Manager can promote leads'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=p_client_id AND NOT u.is_promoted AND NOT u.is_admin
    AND NOT EXISTS(SELECT 1 FROM public.crm_staff_roles s WHERE s.user_id=u.id) FOR UPDATE) THEN RAISE EXCEPTION 'Select an unpromoted lead'; END IF;
  IF v_role='workflow_manager' AND NOT crm_private.can_actor_view_client(auth.uid(),p_client_id) THEN RAISE EXCEPTION 'This lead is outside your Sales scope'; END IF;
  SELECT c.agent_id,c.assigned_at,ad.desk_manager_id,wd.workflow_manager_id INTO v_agent,v_assigned_at,v_desk,v_workflow
  FROM public.crm_client_agent_assignments c
  LEFT JOIN public.crm_agent_desk_assignments ad ON ad.agent_id=c.agent_id
  LEFT JOIN public.crm_workflow_desk_assignments wd ON wd.desk_manager_id=ad.desk_manager_id
  WHERE c.client_id=p_client_id;
  INSERT INTO public.crm_client_assignment_history(client_id,workspace,owner_role,owner_id,workflow_manager_id,desk_manager_id,started_at,recorded_by,reason)
  VALUES(p_client_id,'sales','agent',v_agent,v_workflow,v_desk,v_assigned_at,auth.uid(),'Promoted from Sales to Retention');
  DELETE FROM public.crm_client_agent_assignments WHERE client_id=p_client_id;
  PERFORM set_config('crm.promotion_authorized','yes',true);
  UPDATE public.users SET is_promoted=true,promoted_at=now(),promoted_by=auth.uid(),updated_at=now() WHERE id=p_client_id;
  INSERT INTO public.admin_action_logs(admin_user_id,target_user_id,action,before_data,after_data,reason)
  VALUES(auth.uid(),p_client_id,'crm_client_promoted',jsonb_build_object('workspace','sales','agent_id',v_agent,'desk_manager_id',v_desk,'workflow_manager_id',v_workflow),jsonb_build_object('workspace','retention','owner_id',NULL),'Promoted to Retention');
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_staff_get_scope(p_search text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role text:=crm_private.actor_role();
BEGIN
  IF v_role NOT IN ('workflow_manager','desk_manager','agent','retention_manager','retention') THEN RAISE EXCEPTION 'CRM staff access required'; END IF;
  RETURN jsonb_build_object(
    'role',v_role,
    'team_members',COALESCE((SELECT jsonb_agg(q.item ORDER BY q.sort_name) FROM (
      SELECT jsonb_build_object('id',u.id,'email',u.email,'first_name',u.first_name,'last_name',u.last_name,'role',s.role,'manager_id',
        CASE WHEN s.role='desk_manager' THEN wd.workflow_manager_id WHEN s.role='agent' THEN ad.desk_manager_id WHEN s.role='retention' THEN rm.retention_manager_id END) item,
        COALESCE(u.first_name,u.email) sort_name
      FROM public.users u JOIN public.crm_staff_roles s ON s.user_id=u.id
      LEFT JOIN public.crm_workflow_desk_assignments wd ON wd.desk_manager_id=u.id
      LEFT JOIN public.crm_agent_desk_assignments ad ON ad.agent_id=u.id
      LEFT JOIN public.crm_retention_manager_assignments rm ON rm.retention_id=u.id
      WHERE (v_role='workflow_manager' AND ((s.role='desk_manager' AND wd.workflow_manager_id=auth.uid()) OR (s.role='agent' AND EXISTS(SELECT 1 FROM public.crm_workflow_desk_assignments x WHERE x.desk_manager_id=ad.desk_manager_id AND x.workflow_manager_id=auth.uid()))))
         OR (v_role='desk_manager' AND s.role='agent' AND ad.desk_manager_id=auth.uid())
         OR (v_role='retention_manager' AND s.role='retention' AND rm.retention_manager_id=auth.uid())
    ) q), '[]'::jsonb),
    'clients',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',u.id,'email',u.email,'first_name',u.first_name,'last_name',u.last_name,'country',u.country,
      'kyc_status',u.kyc_status,'created_at',u.created_at,'is_promoted',u.is_promoted,
      'owner_id',COALESCE(c.agent_id,d.retention_id),'owner_role',CASE WHEN u.is_promoted THEN 'retention' ELSE 'agent' END,
      'owner_name',COALESCE(NULLIF(btrim(concat_ws(' ',o.first_name,o.last_name)),''),o.email),
      'usdt_balance',COALESCE(b.usdt_balance,0),'usd_balance',COALESCE(b.usd_balance,0),'btc_balance',COALESCE(b.btc_balance,0)
    ) ORDER BY u.created_at DESC)
    FROM public.users u
    LEFT JOIN public.crm_client_agent_assignments c ON c.client_id=u.id
    LEFT JOIN public.crm_client_retention_assignments d ON d.client_id=u.id
    LEFT JOIN public.users o ON o.id=COALESCE(c.agent_id,d.retention_id)
    LEFT JOIN public.balances b ON b.user_id=u.id
    WHERE crm_private.can_actor_view_client(auth.uid(),u.id)
      AND (p_search IS NULL OR btrim(p_search)='' OR u.email ILIKE '%'||btrim(p_search)||'%' OR COALESCE(u.first_name,'') ILIKE '%'||btrim(p_search)||'%' OR COALESCE(u.last_name,'') ILIKE '%'||btrim(p_search)||'%')
    ),'[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_staff_get_client_workspace(p_client_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_profile jsonb;
BEGIN
  IF NOT crm_private.can_view_client(p_client_id) THEN RAISE EXCEPTION 'Client access denied'; END IF;
  SELECT jsonb_build_object('id',u.id,'email',u.email,'first_name',u.first_name,'last_name',u.last_name,'country',u.country,'phone_number',u.phone_number,'kyc_status',u.kyc_status,'created_at',u.created_at,'is_promoted',u.is_promoted)
  INTO v_profile FROM public.users u WHERE u.id=p_client_id;
  RETURN jsonb_build_object('profile',v_profile,
    'balance',COALESCE((SELECT to_jsonb(x) FROM public.balances x WHERE x.user_id=p_client_id),'{}'::jsonb),
    'robot',COALESCE((SELECT to_jsonb(x) FROM public.robot_states x WHERE x.user_id=p_client_id),'{}'::jsonb),
    'assets',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.asset_symbol) FROM public.user_assets x WHERE x.user_id=p_client_id),'[]'::jsonb),
    'transactions',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.transactions WHERE user_id=p_client_id ORDER BY created_at DESC LIMIT 100)x),'[]'::jsonb),
    'positions',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.futures_positions WHERE user_id=p_client_id ORDER BY created_at DESC LIMIT 100)x),'[]'::jsonb),
    'orders',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.futures_orders WHERE user_id=p_client_id ORDER BY created_at DESC LIMIT 100)x),'[]'::jsonb),
    'stakes',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.user_stakes WHERE user_id=p_client_id ORDER BY created_at DESC LIMIT 100)x),'[]'::jsonb),
    'deposits',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.crypto_deposits WHERE user_id=p_client_id ORDER BY created_at DESC LIMIT 100)x),'[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_workflow_add_lead_deposit(p_client_id uuid,p_amount numeric,p_currency text,p_reference text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text:=crm_private.actor_role(); v_currency text:=upper(btrim(COALESCE(p_currency,''))); v_tx public.transactions%ROWTYPE;
BEGIN
  IF v_role NOT IN ('admin','workflow_manager') THEN RAISE EXCEPTION 'Workflow Manager access required'; END IF;
  IF v_role='workflow_manager' AND NOT crm_private.can_view_client(p_client_id) THEN RAISE EXCEPTION 'This lead is outside your Sales scope'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_client_id AND NOT is_promoted) THEN RAISE EXCEPTION 'Deposits can only be added while the client is an unpromoted lead'; END IF;
  IF p_amount IS NULL OR p_amount<=0 OR p_amount>1000000000000 THEN RAISE EXCEPTION 'Enter a deposit amount greater than zero'; END IF;
  IF v_currency NOT IN ('EUR','USD') THEN RAISE EXCEPTION 'Select EUR or USD'; END IF;
  IF length(btrim(COALESCE(p_reason,'')))<3 THEN RAISE EXCEPTION 'Enter an audit reason'; END IF;
  INSERT INTO public.transactions(user_id,type,amount,currency,description,status)
  VALUES(p_client_id,'deposit',round(p_amount,2),v_currency,'Workflow Manager deposit'||CASE WHEN NULLIF(btrim(COALESCE(p_reference,'')),'') IS NULL THEN '' ELSE ' - reference '||btrim(p_reference) END,'completed') RETURNING * INTO v_tx;
  INSERT INTO public.admin_action_logs(admin_user_id,target_user_id,action,after_data,reason)
  VALUES(auth.uid(),p_client_id,'workflow_add_lead_deposit',to_jsonb(v_tx),btrim(p_reason));
  RETURN to_jsonb(v_tx);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_finalize_created_user(p_user_id uuid,p_actor_id uuid,p_role text,p_owner_role text DEFAULT NULL,p_owner_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_actor_id AND is_admin) THEN RAISE EXCEPTION 'Administrator account not found'; END IF;
  IF p_role NOT IN ('client','workflow_manager','desk_manager','agent','retention_manager','retention','admin') THEN RAISE EXCEPTION 'Invalid CRM role'; END IF;
  IF (p_owner_role IS NULL)<>(p_owner_id IS NULL) THEN RAISE EXCEPTION 'Select both an assignment type and an owner'; END IF;
  IF p_role='agent' AND p_owner_role IS DISTINCT FROM 'desk_manager' AND p_owner_role IS NOT NULL THEN RAISE EXCEPTION 'Agents can only report to Desk Managers'; END IF;
  IF p_role='desk_manager' AND p_owner_role IS DISTINCT FROM 'workflow_manager' AND p_owner_role IS NOT NULL THEN RAISE EXCEPTION 'Desk Managers can only report to Workflow Managers'; END IF;
  IF p_role='retention' AND p_owner_role IS DISTINCT FROM 'retention_manager' AND p_owner_role IS NOT NULL THEN RAISE EXCEPTION 'Retention users can only report to Retention Managers'; END IF;
  IF p_role IN ('workflow_manager','retention_manager','admin') AND p_owner_id IS NOT NULL THEN RAISE EXCEPTION 'This role reports directly to Admin'; END IF;
  IF p_role='client' AND p_owner_role NOT IN ('agent','retention') AND p_owner_role IS NOT NULL THEN RAISE EXCEPTION 'Clients can only be assigned inside one CRM workspace'; END IF;
  IF p_owner_id IS NOT NULL AND crm_private.actor_role_for(p_owner_id)<>p_owner_role THEN RAISE EXCEPTION 'The selected owner no longer has the required role'; END IF;
  IF p_role='admin' THEN UPDATE public.users SET is_admin=true,updated_at=now() WHERE id=p_user_id;
  ELSIF p_role<>'client' THEN INSERT INTO public.crm_staff_roles(user_id,role) VALUES(p_user_id,p_role); END IF;
  IF p_role='desk_manager' AND p_owner_id IS NOT NULL THEN INSERT INTO public.crm_workflow_desk_assignments VALUES(p_user_id,p_owner_id,now(),p_actor_id);
  ELSIF p_role='agent' AND p_owner_id IS NOT NULL THEN INSERT INTO public.crm_agent_desk_assignments VALUES(p_user_id,p_owner_id,now(),p_actor_id);
  ELSIF p_role='retention' AND p_owner_id IS NOT NULL THEN INSERT INTO public.crm_retention_manager_assignments VALUES(p_user_id,p_owner_id,now(),p_actor_id);
  ELSIF p_role='client' AND p_owner_role='agent' THEN INSERT INTO public.crm_client_agent_assignments(client_id,agent_id,assigned_by) VALUES(p_user_id,p_owner_id,p_actor_id);
  ELSIF p_role='client' AND p_owner_role='retention' THEN
    PERFORM set_config('crm.promotion_authorized','yes',true); UPDATE public.users SET is_promoted=true,promoted_at=now(),promoted_by=p_actor_id WHERE id=p_user_id;
    INSERT INTO public.crm_client_retention_assignments(client_id,retention_id,assigned_by) VALUES(p_user_id,p_owner_id,p_actor_id);
  END IF;
  INSERT INTO public.admin_action_logs(admin_user_id,target_user_id,action,after_data,reason) VALUES(p_actor_id,p_user_id,'auth_user_created',jsonb_build_object('role',p_role,'owner_role',p_owner_role,'owner_id',p_owner_id),'Administrator created account');
END;
$$;

REVOKE ALL ON FUNCTION crm_private.actor_role_for(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION crm_private.can_actor_view_client(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.crm_actor_can_view_client(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_actor_can_view_client(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crm_admin_assign_staff(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.crm_promote_client_to_retention(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.crm_workflow_add_lead_deposit(uuid,numeric,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_admin_assign_staff(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_promote_client_to_retention(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_workflow_add_lead_deposit(uuid,numeric,text,text,text) TO authenticated;

NOTIFY pgrst,'reload schema';
