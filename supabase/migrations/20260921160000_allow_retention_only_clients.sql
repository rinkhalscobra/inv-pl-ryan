-- A client can be assigned directly to one retention manager, without an agent.
-- Client ownership is exclusive: unassigned, agent, or direct retention.
CREATE TABLE public.crm_client_retention_assignments (
  client_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  retention_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX crm_client_retention_by_retention
  ON public.crm_client_retention_assignments(retention_id);
ALTER TABLE public.crm_client_retention_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_client_retention_assignments FROM PUBLIC, anon, authenticated;

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
      SELECT 1 FROM public.crm_client_retention_assignments d
      WHERE d.client_id = p_client_id AND d.retention_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.crm_client_agent_assignments c
      JOIN public.crm_agent_retention_assignments a ON a.agent_id = c.agent_id
      WHERE c.client_id = p_client_id AND a.retention_id = auth.uid()
    );
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION crm_private.clear_staff_on_admin_promotion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.is_admin = true AND OLD.is_admin IS DISTINCT FROM NEW.is_admin THEN
    DELETE FROM public.crm_client_agent_assignments WHERE client_id = NEW.id OR agent_id = NEW.id;
    DELETE FROM public.crm_agent_retention_assignments WHERE agent_id = NEW.id OR retention_id = NEW.id;
    DELETE FROM public.crm_client_retention_assignments WHERE client_id = NEW.id OR retention_id = NEW.id;
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
    ), '[]'::jsonb),
    'retention_client_assignments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('client_id', d.client_id, 'retention_id', d.retention_id))
      FROM public.crm_client_retention_assignments d
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
  DELETE FROM public.crm_client_retention_assignments WHERE client_id = p_user_id OR retention_id = p_user_id;
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

CREATE OR REPLACE FUNCTION public.crm_admin_set_client_owner(
  p_client_id uuid, p_owner_role text, p_owner_id uuid DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_old_agent uuid; v_old_retention uuid;
BEGIN
  PERFORM public.require_admin();
  IF p_owner_role IS NULL OR p_owner_role NOT IN ('agent', 'retention', 'unassigned') THEN
    RAISE EXCEPTION 'Invalid client owner type';
  END IF;
  IF (p_owner_role = 'unassigned' AND p_owner_id IS NOT NULL)
     OR (p_owner_role <> 'unassigned' AND p_owner_id IS NULL) THEN
    RAISE EXCEPTION 'Select an account for this owner type';
  END IF;
  PERFORM 1 FROM public.users u LEFT JOIN public.crm_staff_roles s ON s.user_id = u.id
  WHERE u.id = p_client_id AND u.is_admin = false AND s.user_id IS NULL FOR UPDATE OF u;
  IF NOT FOUND THEN RAISE EXCEPTION 'Select a client account'; END IF;
  IF p_owner_role IN ('agent', 'retention') AND NOT EXISTS (
    SELECT 1 FROM public.crm_staff_roles s
    WHERE s.user_id = p_owner_id AND s.role = p_owner_role
  ) THEN RAISE EXCEPTION 'Select an account with the matching CRM role'; END IF;

  SELECT agent_id INTO v_old_agent FROM public.crm_client_agent_assignments WHERE client_id = p_client_id;
  SELECT retention_id INTO v_old_retention FROM public.crm_client_retention_assignments WHERE client_id = p_client_id;
  IF (p_owner_role = 'agent' AND v_old_agent = p_owner_id AND v_old_retention IS NULL)
     OR (p_owner_role = 'retention' AND v_old_retention = p_owner_id AND v_old_agent IS NULL)
     OR (p_owner_role = 'unassigned' AND v_old_agent IS NULL AND v_old_retention IS NULL) THEN
    RETURN;
  END IF;

  DELETE FROM public.crm_client_agent_assignments WHERE client_id = p_client_id;
  DELETE FROM public.crm_client_retention_assignments WHERE client_id = p_client_id;
  IF p_owner_role = 'agent' THEN
    INSERT INTO public.crm_client_agent_assignments(client_id, agent_id, assigned_by)
    VALUES (p_client_id, p_owner_id, auth.uid());
  ELSIF p_owner_role = 'retention' THEN
    INSERT INTO public.crm_client_retention_assignments(client_id, retention_id, assigned_by)
    VALUES (p_client_id, p_owner_id, auth.uid());
  END IF;

  INSERT INTO public.admin_action_logs(admin_user_id, target_user_id, action, before_data, after_data, reason)
  VALUES (auth.uid(), p_client_id, 'crm_client_owner_changed',
    jsonb_build_object('agent_id', v_old_agent, 'retention_id', v_old_retention),
    jsonb_build_object('owner_role', p_owner_role, 'owner_id', p_owner_id), 'CRM hierarchy update');
END;
$$;

-- Keep the original agent-assignment API compatible with existing clients.
CREATE OR REPLACE FUNCTION public.crm_admin_assign_client(p_client_id uuid, p_agent_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.crm_admin_set_client_owner(
    p_client_id,
    CASE WHEN p_agent_id IS NULL THEN 'unassigned' ELSE 'agent' END,
    p_agent_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_admin_promote_agent(p_user_id uuid, p_retention_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.require_admin();
  IF p_retention_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.crm_staff_roles s WHERE s.user_id = p_retention_id AND s.role = 'retention'
  ) THEN RAISE EXCEPTION 'Select a retention manager'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u LEFT JOIN public.crm_staff_roles s ON s.user_id = u.id
    WHERE u.id = p_user_id AND u.is_admin = false AND s.user_id IS NULL
  ) THEN RAISE EXCEPTION 'Select a client account to promote'; END IF;
  PERFORM public.crm_admin_set_role(p_user_id, 'agent');
  IF p_retention_id IS NOT NULL THEN
    PERFORM public.crm_admin_assign_agent(p_user_id, p_retention_id);
  END IF;
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
        'agent_id', c.agent_id,
        'agent_name', CASE WHEN c.agent_id IS NOT NULL THEN
          COALESCE(NULLIF(btrim(concat_ws(' ', a.first_name, a.last_name)), ''), a.email) ELSE NULL END,
        'direct_retention_id', d.retention_id,
        'assignment_type', CASE WHEN d.retention_id IS NOT NULL THEN 'retention' ELSE 'agent' END,
        'usdt_balance', COALESCE(b.usdt_balance, 0), 'btc_balance', COALESCE(b.btc_balance, 0)
      ) ORDER BY u.created_at DESC)
      FROM public.users u
      LEFT JOIN public.crm_client_agent_assignments c ON c.client_id = u.id
      LEFT JOIN public.users a ON a.id = c.agent_id
      LEFT JOIN public.crm_staff_roles agent_role ON agent_role.user_id = a.id AND agent_role.role = 'agent'
      LEFT JOIN public.crm_agent_retention_assignments ar ON ar.agent_id = c.agent_id
      LEFT JOIN public.crm_client_retention_assignments d ON d.client_id = u.id
      LEFT JOIN public.balances b ON b.user_id = u.id
      WHERE u.is_admin = false
        AND NOT EXISTS (SELECT 1 FROM public.crm_staff_roles staff WHERE staff.user_id = u.id)
        AND ((v_role = 'agent' AND c.agent_id = auth.uid() AND agent_role.user_id IS NOT NULL)
          OR (v_role = 'retention' AND
            ((ar.retention_id = auth.uid() AND agent_role.user_id IS NOT NULL) OR d.retention_id = auth.uid())))
        AND (p_search IS NULL OR btrim(p_search) = ''
          OR u.email ILIKE '%' || btrim(p_search) || '%'
          OR COALESCE(u.first_name, '') ILIKE '%' || btrim(p_search) || '%'
          OR COALESCE(u.last_name, '') ILIKE '%' || btrim(p_search) || '%'
          OR u.id::text ILIKE '%' || btrim(p_search) || '%')
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_admin_set_client_owner(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_admin_promote_agent(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_admin_set_client_owner(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_admin_promote_agent(uuid, uuid) TO authenticated;
