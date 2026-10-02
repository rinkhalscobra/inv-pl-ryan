/* Return one server-side page of lead IDs for a concrete CRM assignee. The
   Lead Inbox Edge Function remains responsible for actor/company validation
   and loads the full records after this function applies assignment-aware
   pagination. */

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
  v_actor_office uuid;
  v_assignee_role text;
  v_assignee_office uuid;
  v_offset integer := GREATEST(0, LEAST(1000, COALESCE(p_page, 0))) * 50;
  v_result jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF v_actor_role NOT IN ('admin', 'workflow_manager', 'desk_manager') THEN
    RAISE EXCEPTION 'Lead management access required';
  END IF;

  SELECT staff.role, account.office_id
  INTO v_assignee_role, v_assignee_office
  FROM public.crm_staff_roles staff
  JOIN public.users account ON account.id = staff.user_id
  WHERE staff.user_id = p_assignee_id
    AND account.company_id = p_company_id
    AND staff.role IN ('desk_manager', 'agent', 'retention');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Select a valid lead assignee';
  END IF;

  SELECT office_id INTO v_actor_office
  FROM public.users
  WHERE id = p_actor_id;

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
      AND (
        COALESCE(p_search, '') = ''
        OR lead.email ILIKE '%' || p_search || '%'
      )
      AND CASE
        WHEN p_office_filter = 'all' THEN true
        WHEN p_office_filter = 'unassigned' THEN lead.office_id IS NULL
        ELSE lead.office_id = p_office_filter::uuid
      END
      AND (
        p_phone_filter = 'all'
        OR (p_phone_filter = 'valid' AND lead.phone_validation_status = 'valid')
        OR (
          p_phone_filter = 'incorrect'
          AND lead.phone_validation_status IN ('invalid', 'unsupported', 'missing')
        )
        OR (
          p_phone_filter = 'routing_review'
          AND lead.phone_routing_status IN ('no_office', 'no_desk_manager')
        )
      )
      AND (
        (
          v_assignee_role = 'agent'
          AND EXISTS (
            SELECT 1
            FROM public.crm_client_agent_assignments assignment
            WHERE assignment.client_id = lead.registered_user_id
              AND assignment.agent_id = p_assignee_id
          )
        )
        OR (
          v_assignee_role = 'retention'
          AND EXISTS (
            SELECT 1
            FROM public.crm_client_retention_assignments assignment
            WHERE assignment.client_id = lead.registered_user_id
              AND assignment.retention_id = p_assignee_id
          )
        )
        OR (
          v_assignee_role = 'desk_manager'
          AND v_assignee_office IS NOT NULL
          AND lead.office_id = v_assignee_office
          AND (
            lead.registered_user_id IS NULL
            OR EXISTS (
              SELECT 1
              FROM public.users client
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
    SELECT id, created_at
    FROM filtered
    ORDER BY created_at DESC, id DESC
    OFFSET v_offset
    LIMIT 50
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

REVOKE ALL ON FUNCTION public.crm_service_filter_lead_ids_by_assignee(
  uuid, uuid, uuid, integer, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_service_filter_lead_ids_by_assignee(
  uuid, uuid, uuid, integer, text, text, text, text, text
) TO service_role;

NOTIFY pgrst, 'reload schema';
