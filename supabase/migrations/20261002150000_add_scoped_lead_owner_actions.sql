/* Reuse one owner-change implementation for Admin and Desk Manager Lead Inbox
   actions. The public service wrapper validates tenant, office and hierarchy
   scope before the shared mutation is allowed to run. */

CREATE OR REPLACE FUNCTION crm_private.set_client_owner_for_actor(
  p_actor_id uuid,
  p_client_id uuid,
  p_owner_role text,
  p_owner_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_role text := crm_private.actor_role_for(p_actor_id);
  v_client_promoted boolean;
  v_client_company uuid;
  v_client_office uuid;
  v_owner_company uuid;
  v_owner_office uuid;
  v_old_agent uuid;
  v_old_retention uuid;
BEGIN
  IF v_actor_role NOT IN ('admin', 'desk_manager') THEN
    RAISE EXCEPTION 'Lead assignment access required';
  END IF;

  SELECT account.is_promoted, account.company_id, account.office_id
  INTO v_client_promoted, v_client_company, v_client_office
  FROM public.users account
  WHERE account.id = p_client_id
    AND NOT account.is_admin
    AND NOT EXISTS (
      SELECT 1 FROM public.crm_staff_roles staff WHERE staff.user_id = account.id
    )
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Select a client account'; END IF;

  IF p_owner_role IS NULL
     OR p_owner_role NOT IN ('agent', 'retention', 'unassigned') THEN
    RAISE EXCEPTION 'Invalid client owner type';
  END IF;
  IF (p_owner_role = 'unassigned' AND p_owner_id IS NOT NULL)
     OR (p_owner_role <> 'unassigned' AND p_owner_id IS NULL) THEN
    RAISE EXCEPTION 'Select an account for this owner type';
  END IF;
  IF NOT v_client_promoted AND p_owner_role NOT IN ('agent', 'unassigned') THEN
    RAISE EXCEPTION 'Unpromoted leads can only be assigned to Agents';
  END IF;
  IF v_client_promoted AND p_owner_role NOT IN ('retention', 'unassigned') THEN
    RAISE EXCEPTION 'Promoted clients can only be assigned to Retention users';
  END IF;

  IF p_owner_role <> 'unassigned' THEN
    SELECT owner.company_id, owner.office_id
    INTO v_owner_company, v_owner_office
    FROM public.users owner
    JOIN public.crm_staff_roles staff ON staff.user_id = owner.id
    WHERE owner.id = p_owner_id AND staff.role = p_owner_role;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The selected owner no longer has the required role';
    END IF;
    IF v_owner_company IS DISTINCT FROM v_client_company THEN
      RAISE EXCEPTION 'The selected owner belongs to a different company';
    END IF;
    IF v_owner_office IS NULL OR v_owner_office IS DISTINCT FROM v_client_office THEN
      RAISE EXCEPTION 'The selected owner belongs to a different Office';
    END IF;
  END IF;

  SELECT assignment.agent_id INTO v_old_agent
  FROM public.crm_client_agent_assignments assignment
  WHERE assignment.client_id = p_client_id;
  SELECT assignment.retention_id INTO v_old_retention
  FROM public.crm_client_retention_assignments assignment
  WHERE assignment.client_id = p_client_id;

  DELETE FROM public.crm_client_agent_assignments WHERE client_id = p_client_id;
  DELETE FROM public.crm_client_retention_assignments WHERE client_id = p_client_id;
  IF p_owner_role = 'agent' THEN
    INSERT INTO public.crm_client_agent_assignments(client_id, agent_id, assigned_by)
    VALUES (p_client_id, p_owner_id, p_actor_id);
  ELSIF p_owner_role = 'retention' THEN
    INSERT INTO public.crm_client_retention_assignments(client_id, retention_id, assigned_by)
    VALUES (p_client_id, p_owner_id, p_actor_id);
  END IF;

  INSERT INTO public.admin_action_logs(
    admin_user_id, target_user_id, company_id, action,
    before_data, after_data, reason
  ) VALUES (
    p_actor_id, p_client_id, v_client_company, 'crm_client_owner_changed',
    jsonb_build_object('agent_id', v_old_agent, 'retention_id', v_old_retention),
    jsonb_build_object('owner_role', p_owner_role, 'owner_id', p_owner_id),
    'Lead Inbox assignment update'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_admin_set_client_owner(
  p_client_id uuid,
  p_owner_role text,
  p_owner_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.require_admin();
  PERFORM crm_private.assert_actor_user_access(p_client_id);
  PERFORM crm_private.set_client_owner_for_actor(
    auth.uid(), p_client_id, p_owner_role, p_owner_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_service_set_lead_owner_for_actor(
  p_actor_id uuid,
  p_company_id uuid,
  p_lead_id uuid,
  p_owner_role text,
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
  v_client_id uuid;
  v_client_promoted boolean;
  v_client_company uuid;
  v_client_office uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF v_actor_role NOT IN ('admin', 'desk_manager') THEN
    RAISE EXCEPTION 'Lead assignment access required';
  END IF;

  SELECT account.company_id, account.office_id
  INTO v_actor_company, v_actor_office
  FROM public.users account WHERE account.id = p_actor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CRM actor account not found'; END IF;

  SELECT lead.registered_user_id
  INTO v_client_id
  FROM public.crm_leads lead
  WHERE lead.id = p_lead_id AND lead.company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead belongs to another company or no longer exists';
  END IF;
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'The lead does not have a linked client account';
  END IF;

  SELECT client.is_promoted, client.company_id, client.office_id
  INTO v_client_promoted, v_client_company, v_client_office
  FROM public.users client
  WHERE client.id = v_client_id
    AND NOT client.is_admin
    AND NOT EXISTS (
      SELECT 1 FROM public.crm_staff_roles staff WHERE staff.user_id = client.id
    );
  IF NOT FOUND OR v_client_company IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'The linked client belongs to another company';
  END IF;

  IF v_actor_role = 'desk_manager' THEN
    IF v_actor_company IS DISTINCT FROM p_company_id
       OR v_actor_office IS NULL
       OR v_actor_office IS DISTINCT FROM v_client_office THEN
      RAISE EXCEPTION 'This lead is outside your Desk Manager scope';
    END IF;
    IF v_client_promoted THEN
      RAISE EXCEPTION 'Desk Managers cannot manage promoted clients';
    END IF;
    IF p_owner_role NOT IN ('agent', 'unassigned') THEN
      RAISE EXCEPTION 'Desk Managers can only assign Sales Agents';
    END IF;
    /* Evaluate scope before changing the assignment. This prevents a Desk
       Manager from taking or unassigning a lead owned by another desk. */
    IF NOT crm_private.can_actor_view_client(p_actor_id, v_client_id) THEN
      RAISE EXCEPTION 'This lead is outside your Desk Manager scope';
    END IF;
    IF p_owner_role = 'agent' AND NOT EXISTS (
      SELECT 1
      FROM public.crm_agent_desk_assignments assignment
      WHERE assignment.agent_id = p_owner_id
        AND assignment.desk_manager_id = p_actor_id
    ) THEN
      RAISE EXCEPTION 'The selected Agent belongs to a different desk';
    END IF;
  END IF;

  PERFORM crm_private.set_client_owner_for_actor(
    p_actor_id, v_client_id, p_owner_role, p_owner_id
  );
END;
$$;

/* Tighten the shared assignee filter: Desk Managers may select themselves
   (the All Agents scope) or an Agent that explicitly reports to their desk. */
CREATE OR REPLACE FUNCTION public.crm_service_filter_lead_ids_by_assignee(
  p_actor_id uuid,
  p_company_id uuid,
  p_assignee_id uuid,
  p_page integer DEFAULT 0,
  p_status text DEFAULT NULL,
  p_disposition text DEFAULT NULL,
  p_search text DEFAULT '',
  p_office_filter text DEFAULT 'all',
  p_phone_filter text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_role text := crm_private.actor_role_for(p_actor_id);
  v_actor_company uuid;
  v_actor_office uuid;
  v_assignee_role text;
  v_assignee_office uuid;
  v_offset integer := GREATEST(0, LEAST(1000, COALESCE(p_page, 0))) * 50;
  v_result jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF v_actor_role NOT IN ('admin', 'workflow_manager', 'desk_manager') THEN
    RAISE EXCEPTION 'Lead management access required';
  END IF;

  SELECT account.company_id, account.office_id
  INTO v_actor_company, v_actor_office
  FROM public.users account WHERE account.id = p_actor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CRM actor account not found'; END IF;
  IF v_actor_role <> 'admin' AND v_actor_company IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'CRM company access denied';
  END IF;

  SELECT staff.role, account.office_id
  INTO v_assignee_role, v_assignee_office
  FROM public.crm_staff_roles staff
  JOIN public.users account ON account.id = staff.user_id
  WHERE staff.user_id = p_assignee_id
    AND account.company_id = p_company_id
    AND staff.role IN ('desk_manager', 'agent', 'retention');
  IF NOT FOUND THEN RAISE EXCEPTION 'Select a valid lead assignee'; END IF;

  IF v_actor_role = 'desk_manager' THEN
    IF p_assignee_id = p_actor_id AND v_assignee_role = 'desk_manager' THEN
      NULL;
    ELSIF v_assignee_role = 'agent' AND EXISTS (
      SELECT 1 FROM public.crm_agent_desk_assignments assignment
      WHERE assignment.agent_id = p_assignee_id
        AND assignment.desk_manager_id = p_actor_id
    ) THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'The selected assignee belongs to a different desk';
    END IF;
  END IF;

  WITH filtered AS MATERIALIZED (
    SELECT lead.id, lead.created_at
    FROM public.crm_leads lead
    WHERE lead.company_id = p_company_id
      AND (
        v_actor_role <> 'desk_manager'
        OR (v_actor_office IS NOT NULL AND lead.office_id = v_actor_office)
      )
      AND (p_status IS NULL OR lead.status = p_status)
      AND (p_disposition IS NULL OR lead.disposition_status = p_disposition)
      AND (COALESCE(p_search, '') = '' OR lead.email ILIKE '%' || p_search || '%')
      AND CASE
        WHEN p_office_filter = 'all' THEN true
        WHEN p_office_filter = 'unassigned' THEN lead.office_id IS NULL
        ELSE lead.office_id = p_office_filter::uuid
      END
      AND (
        p_phone_filter = 'all'
        OR (p_phone_filter = 'valid' AND lead.phone_validation_status = 'valid')
        OR (p_phone_filter = 'incorrect' AND lead.phone_validation_status IN ('invalid', 'unsupported', 'missing'))
        OR (p_phone_filter = 'routing_review' AND lead.phone_routing_status IN ('no_office', 'no_desk_manager'))
      )
      AND (
        (v_assignee_role = 'agent' AND EXISTS (
          SELECT 1 FROM public.crm_client_agent_assignments assignment
          WHERE assignment.client_id = lead.registered_user_id
            AND assignment.agent_id = p_assignee_id
        ))
        OR (v_assignee_role = 'retention' AND EXISTS (
          SELECT 1 FROM public.crm_client_retention_assignments assignment
          WHERE assignment.client_id = lead.registered_user_id
            AND assignment.retention_id = p_assignee_id
        ))
        OR (
          v_assignee_role = 'desk_manager'
          AND v_assignee_office IS NOT NULL
          AND lead.office_id = v_assignee_office
          AND (
            lead.registered_user_id IS NULL
            OR EXISTS (
              SELECT 1 FROM public.users client
              WHERE client.id = lead.registered_user_id
                AND NOT client.is_promoted
                AND (
                  NOT EXISTS (
                    SELECT 1
                    FROM public.crm_client_agent_assignments client_assignment
                    JOIN public.crm_agent_desk_assignments desk_assignment
                      ON desk_assignment.agent_id = client_assignment.agent_id
                    WHERE client_assignment.client_id = client.id
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM public.crm_client_agent_assignments client_assignment
                    JOIN public.crm_agent_desk_assignments desk_assignment
                      ON desk_assignment.agent_id = client_assignment.agent_id
                    WHERE client_assignment.client_id = client.id
                      AND desk_assignment.desk_manager_id = p_assignee_id
                  )
                )
            )
          )
        )
      )
  ), page AS (
    SELECT id, created_at FROM filtered
    ORDER BY created_at DESC, id DESC OFFSET v_offset LIMIT 50
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'lead_ids', COALESCE(
      (SELECT jsonb_agg(id ORDER BY created_at DESC, id DESC) FROM page),
      '[]'::jsonb
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION crm_private.set_client_owner_for_actor(uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_service_set_lead_owner_for_actor(uuid, uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_service_set_lead_owner_for_actor(uuid, uuid, uuid, text, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.crm_admin_set_client_owner(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_admin_set_client_owner(uuid, text, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.crm_service_filter_lead_ids_by_assignee(
  uuid, uuid, uuid, integer, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_service_filter_lead_ids_by_assignee(
  uuid, uuid, uuid, integer, text, text, text, text, text
) TO service_role;

NOTIFY pgrst, 'reload schema';
