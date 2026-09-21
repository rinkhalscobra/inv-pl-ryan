-- CRM hierarchy: admin > retention > agent > assigned client.
-- Staff access is read-only and is checked inside each RPC on every request.
CREATE SCHEMA IF NOT EXISTS crm_private;
REVOKE ALL ON SCHEMA crm_private FROM PUBLIC, anon, authenticated;

CREATE TABLE public.crm_staff_roles (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('agent', 'retention')),
  assigned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.crm_agent_retention_assignments (
  agent_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  retention_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX crm_agent_retention_by_retention
  ON public.crm_agent_retention_assignments(retention_id);

CREATE TABLE public.crm_client_agent_assignments (
  client_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX crm_client_agent_by_agent
  ON public.crm_client_agent_assignments(agent_id);

ALTER TABLE public.crm_staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_agent_retention_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_client_agent_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_staff_roles, public.crm_agent_retention_assignments,
  public.crm_client_agent_assignments FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION crm_private.actor_role()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 'none'; END IF;
  IF EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = true) THEN
    RETURN 'admin';
  END IF;
  SELECT s.role INTO v_role FROM public.crm_staff_roles s WHERE s.user_id = auth.uid();
  RETURN COALESCE(v_role, 'client');
END;
$$;

CREATE OR REPLACE FUNCTION crm_private.can_view_client(p_client_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role text := crm_private.actor_role();
BEGIN
  IF v_role = 'admin' THEN RETURN true; END IF;
  IF v_role = 'agent' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.crm_client_agent_assignments c
      WHERE c.client_id = p_client_id AND c.agent_id = auth.uid()
    );
  END IF;
  IF v_role = 'retention' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.crm_client_agent_assignments c
      JOIN public.crm_agent_retention_assignments a ON a.agent_id = c.agent_id
      WHERE c.client_id = p_client_id AND a.retention_id = auth.uid()
    );
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_my_role()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  RETURN crm_private.actor_role();
END;
$$;

-- Remove staff mappings when an administrator is promoted through any existing
-- admin control, including the legacy profile editor.
CREATE OR REPLACE FUNCTION crm_private.clear_staff_on_admin_promotion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.is_admin = true AND OLD.is_admin IS DISTINCT FROM NEW.is_admin THEN
    DELETE FROM public.crm_client_agent_assignments WHERE client_id = NEW.id OR agent_id = NEW.id;
    DELETE FROM public.crm_agent_retention_assignments WHERE agent_id = NEW.id OR retention_id = NEW.id;
    DELETE FROM public.crm_staff_roles WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER crm_clear_staff_on_admin_promotion
AFTER UPDATE OF is_admin ON public.users
FOR EACH ROW EXECUTE FUNCTION crm_private.clear_staff_on_admin_promotion();

CREATE OR REPLACE FUNCTION public.crm_admin_get_hierarchy()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN jsonb_build_object(
    'people', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', u.id, 'email', u.email, 'first_name', u.first_name,
        'last_name', u.last_name, 'created_at', u.created_at,
        'role', CASE WHEN u.is_admin THEN 'admin' ELSE COALESCE(s.role, 'client') END
      ) ORDER BY u.created_at DESC)
      FROM public.users u LEFT JOIN public.crm_staff_roles s ON s.user_id = u.id
    ), '[]'::jsonb),
    'agent_assignments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('agent_id', a.agent_id, 'retention_id', a.retention_id))
      FROM public.crm_agent_retention_assignments a
    ), '[]'::jsonb),
    'client_assignments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('client_id', c.client_id, 'agent_id', c.agent_id))
      FROM public.crm_client_agent_assignments c
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_admin_set_role(p_user_id uuid, p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_old_role text; v_is_admin boolean;
BEGIN
  PERFORM public.require_admin();
  IF p_role IS NULL OR p_role NOT IN ('client', 'agent', 'retention', 'admin') THEN
    RAISE EXCEPTION 'Invalid CRM role';
  END IF;
  SELECT u.is_admin INTO v_is_admin FROM public.users u WHERE u.id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF p_user_id = auth.uid() AND p_role <> 'admin' THEN
    RAISE EXCEPTION 'You cannot remove your own administrator role';
  END IF;
  SELECT CASE WHEN v_is_admin THEN 'admin' ELSE COALESCE(s.role, 'client') END
    INTO v_old_role FROM public.users u
    LEFT JOIN public.crm_staff_roles s ON s.user_id = u.id WHERE u.id = p_user_id;
  IF v_old_role = p_role THEN RETURN; END IF;

  DELETE FROM public.crm_client_agent_assignments WHERE client_id = p_user_id OR agent_id = p_user_id;
  DELETE FROM public.crm_agent_retention_assignments WHERE agent_id = p_user_id OR retention_id = p_user_id;
  DELETE FROM public.crm_staff_roles WHERE user_id = p_user_id;
  IF p_role = 'admin' THEN
    UPDATE public.users SET is_admin = true, updated_at = now() WHERE id = p_user_id;
  ELSE
    IF v_is_admin THEN
      UPDATE public.users SET is_admin = false, updated_at = now() WHERE id = p_user_id;
    END IF;
    IF p_role IN ('agent', 'retention') THEN
      INSERT INTO public.crm_staff_roles(user_id, role) VALUES (p_user_id, p_role);
    END IF;
  END IF;
  INSERT INTO public.admin_action_logs(admin_user_id, target_user_id, action, before_data, after_data, reason)
  VALUES (auth.uid(), p_user_id, 'crm_role_changed',
    jsonb_build_object('role', v_old_role), jsonb_build_object('role', p_role), 'CRM hierarchy update');
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_admin_assign_agent(p_agent_id uuid, p_retention_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_previous uuid;
BEGIN
  PERFORM public.require_admin();
  IF NOT EXISTS (SELECT 1 FROM public.crm_staff_roles WHERE user_id = p_agent_id AND role = 'agent') THEN
    RAISE EXCEPTION 'Select an agent account';
  END IF;
  IF p_retention_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.crm_staff_roles WHERE user_id = p_retention_id AND role = 'retention'
  ) THEN RAISE EXCEPTION 'Select a retention account'; END IF;
  SELECT retention_id INTO v_previous FROM public.crm_agent_retention_assignments WHERE agent_id = p_agent_id;
  IF v_previous IS NOT DISTINCT FROM p_retention_id THEN RETURN; END IF;
  IF p_retention_id IS NULL THEN
    DELETE FROM public.crm_agent_retention_assignments WHERE agent_id = p_agent_id;
  ELSE
    INSERT INTO public.crm_agent_retention_assignments(agent_id, retention_id, assigned_by)
    VALUES (p_agent_id, p_retention_id, auth.uid())
    ON CONFLICT (agent_id) DO UPDATE SET retention_id = EXCLUDED.retention_id,
      assigned_at = now(), assigned_by = EXCLUDED.assigned_by;
  END IF;
  INSERT INTO public.admin_action_logs(admin_user_id, target_user_id, action, before_data, after_data, reason)
  VALUES (auth.uid(), p_agent_id, 'crm_agent_assignment_changed',
    jsonb_build_object('retention_id', v_previous), jsonb_build_object('retention_id', p_retention_id),
    'CRM hierarchy update');
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_admin_assign_client(p_client_id uuid, p_agent_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_previous uuid;
BEGIN
  PERFORM public.require_admin();
  IF NOT EXISTS (
    SELECT 1 FROM public.users u LEFT JOIN public.crm_staff_roles s ON s.user_id = u.id
    WHERE u.id = p_client_id AND u.is_admin = false AND s.user_id IS NULL
  ) THEN RAISE EXCEPTION 'Select a client account'; END IF;
  IF p_agent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.crm_staff_roles WHERE user_id = p_agent_id AND role = 'agent'
  ) THEN RAISE EXCEPTION 'Select an agent account'; END IF;
  SELECT agent_id INTO v_previous FROM public.crm_client_agent_assignments WHERE client_id = p_client_id;
  IF v_previous IS NOT DISTINCT FROM p_agent_id THEN RETURN; END IF;
  IF p_agent_id IS NULL THEN
    DELETE FROM public.crm_client_agent_assignments WHERE client_id = p_client_id;
  ELSE
    INSERT INTO public.crm_client_agent_assignments(client_id, agent_id, assigned_by)
    VALUES (p_client_id, p_agent_id, auth.uid())
    ON CONFLICT (client_id) DO UPDATE SET agent_id = EXCLUDED.agent_id,
      assigned_at = now(), assigned_by = EXCLUDED.assigned_by;
  END IF;
  INSERT INTO public.admin_action_logs(admin_user_id, target_user_id, action, before_data, after_data, reason)
  VALUES (auth.uid(), p_client_id, 'crm_client_assignment_changed',
    jsonb_build_object('agent_id', v_previous), jsonb_build_object('agent_id', p_agent_id),
    'CRM hierarchy update');
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_staff_get_scope(p_search text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role text := crm_private.actor_role();
BEGIN
  IF v_role NOT IN ('agent', 'retention') THEN RAISE EXCEPTION 'CRM staff access required'; END IF;
  RETURN jsonb_build_object(
    'role', v_role,
    'agents', CASE WHEN v_role = 'retention' THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', u.id, 'email', u.email, 'first_name', u.first_name, 'last_name', u.last_name,
        'client_count', (SELECT count(*) FROM public.crm_client_agent_assignments c WHERE c.agent_id = u.id)
      ) ORDER BY u.first_name, u.email)
      FROM public.crm_agent_retention_assignments a
      JOIN public.users u ON u.id = a.agent_id
      JOIN public.crm_staff_roles s ON s.user_id = u.id AND s.role = 'agent'
      WHERE a.retention_id = auth.uid()
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'clients', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', u.id, 'email', u.email, 'first_name', u.first_name,
        'last_name', u.last_name, 'country', u.country,
        'kyc_status', u.kyc_status, 'created_at', u.created_at,
        'agent_id', c.agent_id, 'agent_name', COALESCE(NULLIF(btrim(concat_ws(' ', a.first_name, a.last_name)), ''), a.email),
        'usdt_balance', COALESCE(b.usdt_balance, 0), 'btc_balance', COALESCE(b.btc_balance, 0)
      ) ORDER BY u.created_at DESC)
      FROM public.crm_client_agent_assignments c
      JOIN public.users u ON u.id = c.client_id
      JOIN public.users a ON a.id = c.agent_id
      JOIN public.crm_staff_roles s ON s.user_id = a.id AND s.role = 'agent'
      LEFT JOIN public.balances b ON b.user_id = u.id
      LEFT JOIN public.crm_agent_retention_assignments ar ON ar.agent_id = c.agent_id
      WHERE u.is_admin = false
        AND NOT EXISTS (SELECT 1 FROM public.crm_staff_roles staff WHERE staff.user_id = u.id)
        AND ((v_role = 'agent' AND c.agent_id = auth.uid())
          OR (v_role = 'retention' AND ar.retention_id = auth.uid()))
        AND (p_search IS NULL OR btrim(p_search) = ''
          OR u.email ILIKE '%' || btrim(p_search) || '%'
          OR COALESCE(u.first_name, '') ILIKE '%' || btrim(p_search) || '%'
          OR COALESCE(u.last_name, '') ILIKE '%' || btrim(p_search) || '%'
          OR u.id::text ILIKE '%' || btrim(p_search) || '%')
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_staff_get_client_workspace(p_client_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role text := crm_private.actor_role(); v_profile jsonb;
BEGIN
  IF v_role NOT IN ('agent', 'retention') OR NOT crm_private.can_view_client(p_client_id) THEN
    RAISE EXCEPTION 'Client access denied';
  END IF;
  SELECT jsonb_build_object(
    'id', u.id, 'email', u.email, 'first_name', u.first_name, 'last_name', u.last_name,
    'country', u.country, 'phone_number', u.phone_number,
    'kyc_status', u.kyc_status, 'created_at', u.created_at
  ) INTO v_profile FROM public.users u
  WHERE u.id = p_client_id AND u.is_admin = false
    AND NOT EXISTS (SELECT 1 FROM public.crm_staff_roles s WHERE s.user_id = u.id);
  IF v_profile IS NULL THEN RAISE EXCEPTION 'Client access denied'; END IF;
  RETURN jsonb_build_object(
    'profile', v_profile,
    'balance', COALESCE((SELECT to_jsonb(x) FROM public.balances x WHERE x.user_id = p_client_id), '{}'::jsonb),
    'robot', COALESCE((SELECT to_jsonb(x) FROM public.robot_states x WHERE x.user_id = p_client_id), '{}'::jsonb),
    'assets', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.asset_symbol) FROM public.user_assets x WHERE x.user_id = p_client_id), '[]'::jsonb),
    'transactions', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.transactions WHERE user_id = p_client_id ORDER BY created_at DESC LIMIT 100) x), '[]'::jsonb),
    'positions', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.futures_positions WHERE user_id = p_client_id ORDER BY created_at DESC LIMIT 100) x), '[]'::jsonb),
    'orders', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.futures_orders WHERE user_id = p_client_id ORDER BY created_at DESC LIMIT 100) x), '[]'::jsonb),
    'stakes', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.user_stakes WHERE user_id = p_client_id ORDER BY created_at DESC LIMIT 100) x), '[]'::jsonb),
    'deposits', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.crypto_deposits WHERE user_id = p_client_id ORDER BY created_at DESC LIMIT 100) x), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION crm_private.actor_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION crm_private.can_view_client(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION crm_private.clear_staff_on_admin_promotion() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_my_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_admin_get_hierarchy() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_admin_set_role(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_admin_assign_agent(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_admin_assign_client(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_staff_get_scope(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_staff_get_client_workspace(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_admin_get_hierarchy() TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_admin_set_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_admin_assign_agent(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_admin_assign_client(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_staff_get_scope(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_staff_get_client_workspace(uuid) TO authenticated;
