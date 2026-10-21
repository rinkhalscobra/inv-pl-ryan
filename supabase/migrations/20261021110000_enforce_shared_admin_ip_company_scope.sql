/*
  A shared administrator account is company-neutral. Its approved source IP
  selects the company it can manage for that request. Keep full administrator
  capability inside that company while denying every cross-company target.

  Most administrator RPCs already use effective_company() or
  assert_actor_user_access(). This closes the remaining generic CRM visibility
  helper, which previously returned true for every administrator before
  checking the request's company network.
*/

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

  /* For authenticated requests this resolves the shared administrator through
     the current approved IP. Service-role callers independently resolve the
     same network through crm_service_actor_context(). */
  IF v_role = 'admin' THEN
    RETURN crm_private.admin_can_manage_user(p_actor_id, p_client_id);
  END IF;

  IF NOT crm_private.same_company(p_actor_id, p_client_id) THEN
    RETURN false;
  END IF;

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
      WHERE c.client_id = p_client_id
        AND c.retention_id = p_actor_id
    );
  END IF;
  RETURN false;
END;
$$;

COMMENT ON FUNCTION crm_private.can_actor_view_client(uuid, uuid) IS
  'Company-scoped client visibility; shared admins resolve their company from the approved request IP.';

REVOKE ALL ON FUNCTION crm_private.can_actor_view_client(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
