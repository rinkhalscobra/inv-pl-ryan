/* Enrich the existing staff scope with retention tracking fields. The RPC
   remains authenticated-only and now applies company scope explicitly before
   returning phones, lead status, source, or promotion/assignment dates. */

CREATE OR REPLACE FUNCTION public.crm_staff_get_scope(p_search text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := crm_private.actor_role();
  v_office uuid;
  v_company uuid;
BEGIN
  IF NOT public.crm_staff_network_allowed() THEN
    RAISE EXCEPTION 'CRM access requires your company network';
  END IF;
  IF v_role NOT IN ('workflow_manager', 'desk_manager', 'agent', 'retention_manager', 'retention') THEN
    RAISE EXCEPTION 'CRM staff access required';
  END IF;

  SELECT account.office_id, account.company_id
  INTO v_office, v_company
  FROM public.users account
  WHERE account.id = auth.uid();
  IF NOT FOUND OR v_company IS NULL THEN
    RAISE EXCEPTION 'CRM staff company could not be resolved';
  END IF;

  RETURN jsonb_build_object(
    'role', v_role,
    'office', COALESCE((
      SELECT jsonb_build_object('id', office.id, 'name', office.name, 'code', office.code)
      FROM public.crm_offices office
      WHERE office.id = v_office AND office.company_id = v_company
    ), 'null'::jsonb),
    'offices', CASE WHEN v_role IN ('workflow_manager', 'retention_manager') THEN
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', office.id, 'name', office.name, 'code', office.code, 'status', office.status
        ) ORDER BY office.name)
        FROM public.crm_offices office
        WHERE office.company_id = v_company
      ), '[]'::jsonb)
    ELSE
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', office.id, 'name', office.name, 'code', office.code, 'status', office.status
        ))
        FROM public.crm_offices office
        WHERE office.id = v_office AND office.company_id = v_company
      ), '[]'::jsonb)
    END,
    'team_members', COALESCE((
      SELECT jsonb_agg(team.item ORDER BY team.sort_name)
      FROM (
        SELECT jsonb_build_object(
          'id', account.id,
          'email', account.email,
          'first_name', account.first_name,
          'last_name', account.last_name,
          'role', staff.role,
          'office_id', account.office_id,
          'office_name', office.name,
          'office_code', office.code,
          'manager_id', CASE
            WHEN staff.role = 'desk_manager' THEN workflow_assignment.workflow_manager_id
            WHEN staff.role = 'agent' THEN desk_assignment.desk_manager_id
            WHEN staff.role = 'retention' THEN retention_assignment.retention_manager_id
          END
        ) AS item,
        COALESCE(account.first_name, account.email) AS sort_name
        FROM public.users account
        JOIN public.crm_staff_roles staff ON staff.user_id = account.id
        LEFT JOIN public.crm_workflow_desk_assignments workflow_assignment
          ON workflow_assignment.desk_manager_id = account.id
        LEFT JOIN public.crm_agent_desk_assignments desk_assignment
          ON desk_assignment.agent_id = account.id
        LEFT JOIN public.crm_retention_manager_assignments retention_assignment
          ON retention_assignment.retention_id = account.id
        LEFT JOIN public.crm_offices office ON office.id = account.office_id
        WHERE account.company_id = v_company
          AND (
            (v_role = 'workflow_manager' AND staff.role IN ('desk_manager', 'agent'))
            OR (v_role = 'retention_manager' AND staff.role = 'retention')
            OR (
              v_role = 'desk_manager'
              AND staff.role = 'agent'
              AND desk_assignment.desk_manager_id = auth.uid()
              AND crm_private.same_office(auth.uid(), account.id)
            )
          )
      ) team
    ), '[]'::jsonb),
    'clients', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', client.id,
        'email', client.email,
        'first_name', client.first_name,
        'last_name', client.last_name,
        'phone_number', COALESCE(client.phone_number, lead.phone_e164, lead.phone),
        'country', client.country,
        'kyc_status', client.kyc_status,
        'created_at', client.created_at,
        'is_promoted', client.is_promoted,
        'promoted_at', client.promoted_at,
        'office_id', client.office_id,
        'office_name', office.name,
        'office_code', office.code,
        'owner_id', COALESCE(sales_assignment.agent_id, retention_client_assignment.retention_id),
        'owner_role', CASE WHEN client.is_promoted THEN 'retention' ELSE 'agent' END,
        'owner_name', COALESCE(
          NULLIF(btrim(concat_ws(' ', owner.first_name, owner.last_name)), ''),
          owner.email
        ),
        'retention_assigned_at', retention_client_assignment.assigned_at,
        'lead_id', lead.id,
        'lead_status', lead.disposition_status,
        'lead_status_changed_at', lead.disposition_changed_at,
        'lead_source_id', lead.source_id,
        'lead_source_name', lead.source_name,
        'lead_source_kind', lead.source_kind,
        'lead_created_at', lead.created_at,
        'usdt_balance', COALESCE(balance.usdt_balance, 0),
        'usd_balance', COALESCE(balance.usd_balance, 0),
        'btc_balance', COALESCE(balance.btc_balance, 0)
      ) ORDER BY COALESCE(client.promoted_at, client.created_at) DESC)
      FROM public.users client
      LEFT JOIN public.crm_client_agent_assignments sales_assignment
        ON sales_assignment.client_id = client.id
      LEFT JOIN public.crm_client_retention_assignments retention_client_assignment
        ON retention_client_assignment.client_id = client.id
      LEFT JOIN public.users owner
        ON owner.id = COALESCE(sales_assignment.agent_id, retention_client_assignment.retention_id)
      LEFT JOIN public.crm_offices office ON office.id = client.office_id
      LEFT JOIN public.balances balance ON balance.user_id = client.id
      LEFT JOIN LATERAL (
        SELECT inbox_lead.id,
               inbox_lead.disposition_status,
               inbox_lead.disposition_changed_at,
               inbox_lead.source_id,
               inbox_lead.source_name,
               inbox_lead.source_kind,
               inbox_lead.phone_e164,
               inbox_lead.phone,
               inbox_lead.created_at
        FROM public.crm_leads inbox_lead
        WHERE inbox_lead.registered_user_id = client.id
          AND inbox_lead.company_id = v_company
        ORDER BY inbox_lead.created_at DESC, inbox_lead.id DESC
        LIMIT 1
      ) lead ON true
      WHERE client.company_id = v_company
        AND crm_private.can_actor_view_client(auth.uid(), client.id)
        AND (
          p_search IS NULL
          OR btrim(p_search) = ''
          OR client.email ILIKE '%' || btrim(p_search) || '%'
          OR COALESCE(client.first_name, '') ILIKE '%' || btrim(p_search) || '%'
          OR COALESCE(client.last_name, '') ILIKE '%' || btrim(p_search) || '%'
          OR COALESCE(client.phone_number, '') ILIKE '%' || btrim(p_search) || '%'
        )
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_staff_get_scope(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_staff_get_scope(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
