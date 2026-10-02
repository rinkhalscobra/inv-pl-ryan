/* Keep phone-routed leads with the Desk Manager for the detected Office after
   registration. Previously the Lead inbox routed +49/+33 correctly, but an
   unassigned registered client immediately fell out of Desk Manager scope.
   The Lead inbox also displayed Register to Desk Managers while the database
   authorization rejected that action. */

CREATE OR REPLACE FUNCTION crm_private.can_actor_view_client(
  p_actor_id uuid,
  p_client_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := crm_private.actor_role_for(p_actor_id);
  v_promoted boolean;
BEGIN
  SELECT u.is_promoted INTO v_promoted
  FROM public.users u
  WHERE u.id = p_client_id
    AND NOT u.is_admin
    AND NOT EXISTS (
      SELECT 1 FROM public.crm_staff_roles s WHERE s.user_id = u.id
    );
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_role = 'admin' THEN RETURN true; END IF;

  IF NOT v_promoted AND v_role = 'workflow_manager' THEN RETURN true; END IF;
  IF v_promoted AND v_role = 'retention_manager' THEN RETURN true; END IF;

  /* NULL is not an Office. Requiring a real matching Office prevents two
     unclassified accounts from being treated as belonging to the same desk. */
  IF NOT EXISTS (
    SELECT 1
    FROM public.users actor
    JOIN public.users client
      ON client.id = p_client_id
     AND client.company_id = actor.company_id
     AND client.office_id = actor.office_id
    WHERE actor.id = p_actor_id
      AND actor.office_id IS NOT NULL
  ) THEN
    RETURN false;
  END IF;

  IF NOT v_promoted AND v_role = 'agent' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.crm_client_agent_assignments c
      WHERE c.client_id = p_client_id AND c.agent_id = p_actor_id
    );
  ELSIF NOT v_promoted AND v_role = 'desk_manager' THEN
    /* A phone-routed client is intentionally visible to its Office desk before
       a Sales Agent is chosen (and while an Agent has no desk). Once a complete
       agent -> desk chain exists, that chain becomes the authoritative scope. */
    IF NOT EXISTS (
      SELECT 1
      FROM public.crm_client_agent_assignments c
      JOIN public.crm_agent_desk_assignments ad ON ad.agent_id = c.agent_id
      WHERE c.client_id = p_client_id
    ) THEN
      RETURN true;
    END IF;
    RETURN EXISTS (
      SELECT 1
      FROM public.crm_client_agent_assignments c
      JOIN public.crm_agent_desk_assignments ad ON ad.agent_id = c.agent_id
      WHERE c.client_id = p_client_id
        AND ad.desk_manager_id = p_actor_id
    );
  ELSIF v_promoted AND v_role = 'retention' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.crm_client_retention_assignments c
      WHERE c.client_id = p_client_id AND c.retention_id = p_actor_id
    );
  END IF;
  RETURN false;
END;
$$;

/* A Desk Manager can register only a lead already routed to that manager's
   own Office. If an Agent is selected, the Agent must report to that desk. */
CREATE OR REPLACE FUNCTION public.crm_actor_can_manage_lead(
  p_actor_id uuid,
  p_lead_id uuid,
  p_agent_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := crm_private.actor_role_for(p_actor_id);
  v_lead_office uuid;
  v_actor_office uuid;
BEGIN
  IF v_role = 'admin' THEN
    RETURN EXISTS (SELECT 1 FROM public.crm_leads WHERE id = p_lead_id);
  END IF;

  SELECT l.office_id INTO v_lead_office
  FROM public.crm_leads l
  WHERE l.id = p_lead_id;
  IF NOT FOUND OR v_lead_office IS NULL THEN RETURN false; END IF;

  IF v_role = 'workflow_manager' THEN
    IF p_agent_id IS NULL THEN RETURN true; END IF;
    RETURN EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = p_agent_id
        AND u.office_id = v_lead_office
        AND crm_private.actor_role_for(u.id) = 'agent'
    );
  END IF;

  IF v_role <> 'desk_manager' THEN RETURN false; END IF;
  SELECT u.office_id INTO v_actor_office
  FROM public.users u
  WHERE u.id = p_actor_id;
  IF v_actor_office IS NULL OR v_actor_office <> v_lead_office THEN
    RETURN false;
  END IF;
  IF p_agent_id IS NULL THEN RETURN true; END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.crm_agent_desk_assignments ad ON ad.agent_id = u.id
    WHERE u.id = p_agent_id
      AND u.office_id = v_lead_office
      AND ad.desk_manager_id = p_actor_id
      AND crm_private.actor_role_for(u.id) = 'agent'
  );
END;
$$;

/* The Edge Function already authorizes the lead before creating an account.
   Allow the two Sales manager roles to finish client-only registrations while
   retaining Admin-only creation for every staff role. */
CREATE OR REPLACE FUNCTION public.crm_finalize_created_user(
  p_user_id uuid,
  p_actor_id uuid,
  p_role text,
  p_owner_role text DEFAULT NULL,
  p_owner_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_role text := crm_private.actor_role_for(p_actor_id);
  v_actor_company uuid;
  v_actor_office uuid;
  v_user_company uuid;
  v_user_office uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF p_role NOT IN ('client','workflow_manager','desk_manager','agent','retention_manager','retention','admin') THEN
    RAISE EXCEPTION 'Invalid CRM role';
  END IF;
  IF p_role <> 'client' AND v_actor_role <> 'admin' THEN
    RAISE EXCEPTION 'Administrator account required for staff creation';
  END IF;
  IF p_role = 'client' AND v_actor_role NOT IN ('admin','workflow_manager','desk_manager') THEN
    RAISE EXCEPTION 'Sales manager access required';
  END IF;

  SELECT u.company_id, u.office_id INTO v_actor_company, v_actor_office
  FROM public.users u WHERE u.id = p_actor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CRM actor account not found'; END IF;
  SELECT u.company_id, u.office_id INTO v_user_company, v_user_office
  FROM public.users u WHERE u.id = p_user_id AND NOT u.is_admin FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'New account profile not found'; END IF;

  IF v_actor_role <> 'admin' AND v_actor_company IS DISTINCT FROM v_user_company THEN
    RAISE EXCEPTION 'The client belongs to a different company';
  END IF;
  IF v_actor_role = 'desk_manager'
     AND (v_actor_office IS NULL OR v_actor_office IS DISTINCT FROM v_user_office) THEN
    RAISE EXCEPTION 'The client belongs to a different Office';
  END IF;
  IF v_actor_role = 'desk_manager' AND p_owner_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.crm_agent_desk_assignments ad
    WHERE ad.agent_id = p_owner_id AND ad.desk_manager_id = p_actor_id
  ) THEN
    RAISE EXCEPTION 'The selected Agent belongs to a different desk';
  END IF;

  IF (p_owner_role IS NULL) <> (p_owner_id IS NULL) THEN
    RAISE EXCEPTION 'Select both an assignment type and an owner';
  END IF;
  IF p_role = 'agent' AND p_owner_role IS DISTINCT FROM 'desk_manager' AND p_owner_role IS NOT NULL THEN
    RAISE EXCEPTION 'Agents can only report to Desk Managers';
  END IF;
  IF p_role = 'desk_manager' AND p_owner_role IS DISTINCT FROM 'workflow_manager' AND p_owner_role IS NOT NULL THEN
    RAISE EXCEPTION 'Desk Managers can only report to Workflow Managers';
  END IF;
  IF p_role = 'retention' AND p_owner_role IS DISTINCT FROM 'retention_manager' AND p_owner_role IS NOT NULL THEN
    RAISE EXCEPTION 'Retention users can only report to Retention Managers';
  END IF;
  IF p_role IN ('workflow_manager','retention_manager','admin') AND p_owner_id IS NOT NULL THEN
    RAISE EXCEPTION 'This role reports directly to Admin';
  END IF;
  IF p_role = 'client' AND p_owner_role NOT IN ('agent','retention') AND p_owner_role IS NOT NULL THEN
    RAISE EXCEPTION 'Clients can only be assigned inside one CRM workspace';
  END IF;
  IF p_owner_id IS NOT NULL AND crm_private.actor_role_for(p_owner_id) <> p_owner_role THEN
    RAISE EXCEPTION 'The selected owner no longer has the required role';
  END IF;

  IF p_role = 'admin' THEN
    UPDATE public.users SET is_admin = true, updated_at = now() WHERE id = p_user_id;
  ELSIF p_role <> 'client' THEN
    INSERT INTO public.crm_staff_roles(user_id, role) VALUES (p_user_id, p_role);
  END IF;

  IF p_role = 'desk_manager' AND p_owner_id IS NOT NULL THEN
    INSERT INTO public.crm_workflow_desk_assignments VALUES (p_user_id,p_owner_id,now(),p_actor_id);
  ELSIF p_role = 'agent' AND p_owner_id IS NOT NULL THEN
    INSERT INTO public.crm_agent_desk_assignments VALUES (p_user_id,p_owner_id,now(),p_actor_id);
  ELSIF p_role = 'retention' AND p_owner_id IS NOT NULL THEN
    INSERT INTO public.crm_retention_manager_assignments VALUES (p_user_id,p_owner_id,now(),p_actor_id);
  ELSIF p_role = 'client' AND p_owner_role = 'agent' THEN
    INSERT INTO public.crm_client_agent_assignments(client_id,agent_id,assigned_by)
    VALUES (p_user_id,p_owner_id,p_actor_id);
  ELSIF p_role = 'client' AND p_owner_role = 'retention' THEN
    PERFORM set_config('crm.promotion_authorized','yes',true);
    UPDATE public.users
    SET is_promoted = true, promoted_at = now(), promoted_by = p_actor_id
    WHERE id = p_user_id;
    INSERT INTO public.crm_client_retention_assignments(client_id,retention_id,assigned_by)
    VALUES (p_user_id,p_owner_id,p_actor_id);
  END IF;

  INSERT INTO public.admin_action_logs(
    admin_user_id,target_user_id,action,after_data,reason
  ) VALUES (
    p_actor_id,p_user_id,'auth_user_created',
    jsonb_build_object('role',p_role,'owner_role',p_owner_role,'owner_id',p_owner_id),
    'CRM account creation'
  );
END;
$$;

REVOKE ALL ON FUNCTION crm_private.can_actor_view_client(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_actor_can_manage_lead(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_finalize_created_user(uuid,uuid,text,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_actor_can_manage_lead(uuid,uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_finalize_created_user(uuid,uuid,text,text,uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';
