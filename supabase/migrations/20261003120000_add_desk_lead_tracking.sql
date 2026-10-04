/* Extend the existing service-only Lead Inbox boundary with combined source
   filtering and a hierarchy-scoped assignment audit. Raw lead and audit tables
   remain unavailable to authenticated clients; the Edge Function is the only
   caller and these functions independently enforce Desk Manager scope. */

CREATE OR REPLACE FUNCTION crm_private.filter_lead_ids_by_assignee(
  p_actor_id uuid,
  p_company_id uuid,
  p_assignee_id uuid,
  p_page integer,
  p_status text,
  p_disposition text,
  p_search text,
  p_office_filter text,
  p_phone_filter text,
  p_date_from date,
  p_date_to date,
  p_source_filter text
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
  v_source_filter text := COALESCE(NULLIF(p_source_filter, ''), 'all');
  v_offset integer := GREATEST(0, LEAST(1000, COALESCE(p_page, 0))) * 50;
  v_result jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF v_actor_role NOT IN ('admin', 'workflow_manager', 'desk_manager') THEN
    RAISE EXCEPTION 'Lead management access required';
  END IF;
  IF p_date_from IS NOT NULL AND p_date_to IS NOT NULL AND p_date_from > p_date_to THEN
    RAISE EXCEPTION 'Created from date must be before created to date';
  END IF;
  IF v_source_filter <> 'all'
     AND v_source_filter NOT IN ('kind:affiliate_api', 'kind:google_sheet', 'kind:file')
     AND v_source_filter !~ '^source:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION 'Select a valid lead source';
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
      AND (
        COALESCE(p_search, '') = ''
        OR lead.email ILIKE '%' || p_search || '%'
        OR lead.first_name ILIKE '%' || p_search || '%'
        OR lead.last_name ILIKE '%' || p_search || '%'
        OR lead.phone ILIKE '%' || p_search || '%'
        OR lead.phone_e164 ILIKE '%' || p_search || '%'
      )
      AND (p_date_from IS NULL OR lead.created_at >= (p_date_from::timestamp AT TIME ZONE 'UTC'))
      AND (p_date_to IS NULL OR lead.created_at < ((p_date_to + 1)::timestamp AT TIME ZONE 'UTC'))
      AND CASE
        WHEN v_source_filter = 'all' THEN true
        WHEN v_source_filter LIKE 'kind:%' THEN lead.source_kind = substring(v_source_filter FROM 6)
        ELSE lead.source_id = substring(v_source_filter FROM 8)::uuid
      END
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

CREATE OR REPLACE FUNCTION public.crm_service_filter_lead_ids_by_assignee(
  p_actor_id uuid,
  p_company_id uuid,
  p_assignee_id uuid,
  p_page integer,
  p_status text,
  p_disposition text,
  p_search text,
  p_office_filter text,
  p_phone_filter text,
  p_date_from date,
  p_date_to date,
  p_source_filter text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT crm_private.filter_lead_ids_by_assignee(
    p_actor_id, p_company_id, p_assignee_id, p_page, p_status,
    p_disposition, p_search, p_office_filter, p_phone_filter,
    p_date_from, p_date_to, p_source_filter
  );
$$;

CREATE OR REPLACE FUNCTION public.crm_service_get_lead_assignment_history(
  p_actor_id uuid,
  p_company_id uuid,
  p_lead_id uuid
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
  v_client_id uuid;
  v_lead_office uuid;
  v_result jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF v_actor_role NOT IN ('admin', 'workflow_manager', 'desk_manager') THEN
    RAISE EXCEPTION 'Lead assignment history access required';
  END IF;

  SELECT account.company_id, account.office_id
  INTO v_actor_company, v_actor_office
  FROM public.users account WHERE account.id = p_actor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CRM actor account not found'; END IF;
  IF v_actor_role <> 'admin' AND v_actor_company IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'CRM company access denied';
  END IF;

  SELECT lead.registered_user_id, lead.office_id
  INTO v_client_id, v_lead_office
  FROM public.crm_leads lead
  WHERE lead.id = p_lead_id AND lead.company_id = p_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead belongs to another company or no longer exists'; END IF;
  IF v_client_id IS NULL THEN RETURN '[]'::jsonb; END IF;

  IF v_actor_role = 'desk_manager' AND (
    v_actor_office IS NULL
    OR v_actor_office IS DISTINCT FROM v_lead_office
    OR NOT crm_private.can_actor_view_client(p_actor_id, v_client_id)
  ) THEN
    RAISE EXCEPTION 'This lead is outside your Desk Manager scope';
  END IF;
  IF v_actor_role = 'workflow_manager'
     AND NOT crm_private.can_actor_view_client(p_actor_id, v_client_id) THEN
    RAISE EXCEPTION 'This lead is outside your Sales scope';
  END IF;

  WITH log_events AS (
    SELECT
      log.id::text AS event_id,
      log.created_at AS assigned_at,
      NULLIF(log.before_data->>'agent_id', '')::uuid AS previous_agent_id,
      CASE WHEN log.after_data->>'owner_role' = 'agent'
        THEN NULLIF(log.after_data->>'owner_id', '')::uuid ELSE NULL END AS new_agent_id,
      log.admin_user_id AS performed_by,
      false AS initial_assignment
    FROM public.admin_action_logs log
    WHERE log.target_user_id = v_client_id
      AND log.action = 'crm_client_owner_changed'
      AND COALESCE(log.after_data->>'owner_role', '') IN ('agent', 'unassigned')
  ), initial_event AS (
    SELECT
      'current-' || assignment.client_id::text AS event_id,
      assignment.assigned_at,
      NULL::uuid AS previous_agent_id,
      assignment.agent_id AS new_agent_id,
      assignment.assigned_by AS performed_by,
      true AS initial_assignment
    FROM public.crm_client_agent_assignments assignment
    WHERE assignment.client_id = v_client_id
      AND NOT EXISTS (SELECT 1 FROM log_events)
  ), events AS (
    SELECT * FROM log_events
    UNION ALL
    SELECT * FROM initial_event
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', event.event_id,
    'previous_agent_id', event.previous_agent_id,
    'previous_agent_name', COALESCE(NULLIF(btrim(concat_ws(' ', previous_agent.first_name, previous_agent.last_name)), ''), previous_agent.email),
    'new_agent_id', event.new_agent_id,
    'new_agent_name', COALESCE(NULLIF(btrim(concat_ws(' ', new_agent.first_name, new_agent.last_name)), ''), new_agent.email),
    'performed_by_id', event.performed_by,
    'performed_by_name', COALESCE(NULLIF(btrim(concat_ws(' ', performer.first_name, performer.last_name)), ''), performer.email, 'System'),
    'assigned_at', event.assigned_at,
    'initial_assignment', event.initial_assignment
  ) ORDER BY event.assigned_at DESC), '[]'::jsonb)
  INTO v_result
  FROM events event
  LEFT JOIN public.users previous_agent ON previous_agent.id = event.previous_agent_id
  LEFT JOIN public.users new_agent ON new_agent.id = event.new_agent_id
  LEFT JOIN public.users performer ON performer.id = event.performed_by;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION crm_private.filter_lead_ids_by_assignee(
  uuid, uuid, uuid, integer, text, text, text, text, text, date, date, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_service_filter_lead_ids_by_assignee(
  uuid, uuid, uuid, integer, text, text, text, text, text, date, date, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_service_get_lead_assignment_history(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_service_filter_lead_ids_by_assignee(
  uuid, uuid, uuid, integer, text, text, text, text, text, date, date, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_service_get_lead_assignment_history(uuid, uuid, uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';
