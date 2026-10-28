/*
  An approved company network grants an administrator full control over users
  in that company. It must not grant the global direct-table bypass used by the
  platform network, because many historical RLS policies are not tenant-aware.

  The legacy administrator-status trigger still called check_admin_role(),
  which intentionally returns false on company networks. As a result, scoped
  administrators could manage most client data but could not promote or demote
  an account. Use the tenant-aware target authorization at both security-state
  trigger layers and make the role RPC assert its target before doing any work.
*/

CREATE OR REPLACE FUNCTION public.protect_user_admin_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_admin, false)
       AND COALESCE(auth.role(), '') <> 'service_role' THEN
      RAISE EXCEPTION 'Administrator accounts must be created through CRM administration';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.is_admin IS DISTINCT FROM NEW.is_admin
     AND COALESCE(auth.role(), '') <> 'service_role'
     AND NOT crm_private.admin_can_manage_user(auth.uid(), OLD.id) THEN
    RAISE EXCEPTION 'Only an administrator for this company may change administrator access';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION crm_private.protect_client_security_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN RETURN NEW; END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
     AND NOT crm_private.admin_can_manage_user(auth.uid(), OLD.id) THEN
    RAISE EXCEPTION 'Only an administrator for this company may change administrator access';
  END IF;
  IF NEW.is_promoted IS DISTINCT FROM OLD.is_promoted
     AND COALESCE(current_setting('crm.promotion_authorized', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'Promotion state can only be changed through the CRM promotion workflow';
  END IF;
  IF NEW.office_id IS DISTINCT FROM OLD.office_id
     AND COALESCE(current_setting('crm.office_authorized', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'Office can only be changed through the CRM Office workflow';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_admin_set_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_role text;
  v_is_admin boolean;
BEGIN
  PERFORM public.require_admin();
  PERFORM crm_private.assert_actor_user_access(p_user_id);

  IF p_role IS NULL OR p_role NOT IN (
    'client', 'workflow_manager', 'desk_manager', 'agent',
    'retention_manager', 'retention', 'admin'
  ) THEN
    RAISE EXCEPTION 'Invalid CRM role';
  END IF;

  SELECT u.is_admin INTO v_is_admin
  FROM public.users u
  WHERE u.id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF p_user_id = auth.uid() AND p_role <> 'admin' THEN
    RAISE EXCEPTION 'You cannot remove your own administrator role';
  END IF;

  v_old_role := crm_private.actor_role_for(p_user_id);
  IF v_old_role = p_role THEN RETURN; END IF;

  DELETE FROM public.crm_client_agent_assignments
  WHERE client_id = p_user_id OR agent_id = p_user_id;
  DELETE FROM public.crm_client_retention_assignments
  WHERE client_id = p_user_id OR retention_id = p_user_id;
  DELETE FROM public.crm_agent_desk_assignments
  WHERE agent_id = p_user_id OR desk_manager_id = p_user_id;
  DELETE FROM public.crm_workflow_desk_assignments
  WHERE desk_manager_id = p_user_id OR workflow_manager_id = p_user_id;
  DELETE FROM public.crm_retention_manager_assignments
  WHERE retention_id = p_user_id OR retention_manager_id = p_user_id;
  DELETE FROM public.crm_staff_roles WHERE user_id = p_user_id;

  IF p_role = 'admin' THEN
    UPDATE public.users
    SET is_admin = true, updated_at = now()
    WHERE id = p_user_id;
  ELSE
    IF v_is_admin THEN
      UPDATE public.users
      SET is_admin = false, updated_at = now()
      WHERE id = p_user_id;
    END IF;
    IF p_role = 'client' THEN
      PERFORM set_config('crm.promotion_authorized', 'yes', true);
      UPDATE public.users
      SET is_promoted = false,
          promoted_at = NULL,
          promoted_by = NULL,
          updated_at = now()
      WHERE id = p_user_id;
    ELSE
      INSERT INTO public.crm_staff_roles(user_id, role)
      VALUES (p_user_id, p_role);
    END IF;
  END IF;

  INSERT INTO public.admin_action_logs(
    admin_user_id, target_user_id, company_id, action,
    before_data, after_data, reason
  )
  SELECT
    auth.uid(), p_user_id, u.company_id, 'crm_role_changed',
    jsonb_build_object('role', v_old_role),
    jsonb_build_object('role', p_role),
    'CRM hierarchy update'
  FROM public.users u
  WHERE u.id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_user_admin_status()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION crm_private.protect_client_security_state()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_admin_set_role(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_admin_set_role(uuid, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
