-- Complete an administrator-created Auth account in one database transaction.
-- The Edge Function authenticates the administrator and is the only caller.
CREATE OR REPLACE FUNCTION public.crm_finalize_created_user(
  p_user_id uuid,
  p_actor_id uuid,
  p_role text,
  p_owner_role text DEFAULT NULL,
  p_owner_id uuid DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_actor_id AND is_admin = true) THEN
    RAISE EXCEPTION 'Administrator account not found';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('client', 'agent', 'retention', 'admin') THEN
    RAISE EXCEPTION 'Invalid CRM role';
  END IF;
  PERFORM 1 FROM public.users WHERE id = p_user_id AND is_admin = false FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'New account profile not found'; END IF;
  IF p_owner_role IS NOT NULL AND p_owner_role NOT IN ('agent', 'retention') THEN
    RAISE EXCEPTION 'Invalid assignment type';
  END IF;
  IF (p_owner_role IS NULL) <> (p_owner_id IS NULL) THEN
    RAISE EXCEPTION 'Select both an assignment type and an owner';
  END IF;
  IF p_role IN ('retention', 'admin') AND p_owner_id IS NOT NULL THEN
    RAISE EXCEPTION 'This role cannot have an owner';
  END IF;
  IF p_role = 'agent' AND p_owner_role IS NOT NULL AND p_owner_role <> 'retention' THEN
    RAISE EXCEPTION 'An agent can only be assigned to retention';
  END IF;
  IF p_owner_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.crm_staff_roles
    WHERE user_id = p_owner_id AND role = p_owner_role
  ) THEN
    RAISE EXCEPTION 'The selected owner no longer has the required role';
  END IF;

  IF p_role = 'admin' THEN
    UPDATE public.users SET is_admin = true, updated_at = now() WHERE id = p_user_id;
  ELSIF p_role IN ('agent', 'retention') THEN
    INSERT INTO public.crm_staff_roles(user_id, role) VALUES (p_user_id, p_role);
  END IF;

  IF p_role = 'agent' AND p_owner_id IS NOT NULL THEN
    INSERT INTO public.crm_agent_retention_assignments(agent_id, retention_id, assigned_by)
    VALUES (p_user_id, p_owner_id, p_actor_id);
  ELSIF p_role = 'client' AND p_owner_role = 'agent' THEN
    INSERT INTO public.crm_client_agent_assignments(client_id, agent_id, assigned_by)
    VALUES (p_user_id, p_owner_id, p_actor_id);
  ELSIF p_role = 'client' AND p_owner_role = 'retention' THEN
    INSERT INTO public.crm_client_retention_assignments(client_id, retention_id, assigned_by)
    VALUES (p_user_id, p_owner_id, p_actor_id);
  END IF;

  INSERT INTO public.admin_action_logs(admin_user_id, target_user_id, action, after_data, reason)
  VALUES (p_actor_id, p_user_id, 'auth_user_created',
    jsonb_build_object('role', p_role, 'owner_role', p_owner_role, 'owner_id', p_owner_id),
    'Administrator created account');
END;
$$;

REVOKE ALL ON FUNCTION public.crm_finalize_created_user(uuid, uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_finalize_created_user(uuid, uuid, text, text, uuid)
  TO service_role;
