/* Return exact lead totals per configured source and source kind without
   exposing crm_leads directly. Desk Manager totals use the same Office and
   Agent hierarchy boundary as the Lead Inbox. */

CREATE OR REPLACE FUNCTION public.crm_service_get_lead_source_counts(
  p_actor_id uuid,
  p_company_id uuid
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
  v_result jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF v_actor_role NOT IN ('admin', 'workflow_manager', 'desk_manager') THEN
    RAISE EXCEPTION 'Lead management access required';
  END IF;

  SELECT account.company_id, account.office_id
  INTO v_actor_company, v_actor_office
  FROM public.users account
  WHERE account.id = p_actor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CRM actor account not found'; END IF;
  IF v_actor_role <> 'admin' AND v_actor_company IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'CRM company access denied';
  END IF;

  WITH visible_leads AS (
    SELECT lead.source_id, lead.source_kind
    FROM public.crm_leads lead
    WHERE lead.company_id = p_company_id
      AND (
        v_actor_role <> 'desk_manager'
        OR (
          v_actor_office IS NOT NULL
          AND lead.office_id = v_actor_office
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
                      AND desk_assignment.desk_manager_id = p_actor_id
                  )
                )
            )
          )
        )
      )
  ), grouped AS (
    SELECT source_id, source_kind, count(*)::integer AS lead_count
    FROM visible_leads
    GROUP BY source_id, source_kind
  )
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'source_id', grouped.source_id,
      'source_kind', grouped.source_kind,
      'lead_count', grouped.lead_count
    ) ORDER BY grouped.source_kind, grouped.source_id),
    '[]'::jsonb
  )
  INTO v_result
  FROM grouped;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_service_get_lead_source_counts(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_service_get_lead_source_counts(uuid, uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';
