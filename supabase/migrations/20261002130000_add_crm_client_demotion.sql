/* Promotion has an explicit workflow because it changes the client's workspace
   and access graph. Demotion needs the same guarantees in reverse instead of a
   direct users.is_promoted update or a generic role change. */

CREATE OR REPLACE FUNCTION public.crm_admin_demote_client_to_sales(
  p_client_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid;
  v_office uuid;
  v_retention uuid;
  v_retention_manager uuid;
  v_assigned_at timestamptz;
BEGIN
  PERFORM public.require_admin();
  PERFORM crm_private.assert_actor_user_access(p_client_id);

  SELECT u.company_id, u.office_id
  INTO v_company, v_office
  FROM public.users u
  WHERE u.id = p_client_id
    AND u.is_promoted
    AND NOT u.is_admin
    AND NOT EXISTS (
      SELECT 1 FROM public.crm_staff_roles s WHERE s.user_id = u.id
    )
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Select a promoted client';
  END IF;

  SELECT assignment.retention_id,
         assignment.assigned_at,
         manager.retention_manager_id
  INTO v_retention, v_assigned_at, v_retention_manager
  FROM public.crm_client_retention_assignments assignment
  LEFT JOIN public.crm_retention_manager_assignments manager
    ON manager.retention_id = assignment.retention_id
  WHERE assignment.client_id = p_client_id;

  INSERT INTO public.crm_client_assignment_history(
    client_id,
    workspace,
    owner_role,
    owner_id,
    started_at,
    recorded_by,
    reason,
    details
  ) VALUES (
    p_client_id,
    'retention',
    'retention',
    v_retention,
    v_assigned_at,
    auth.uid(),
    'Demoted from Retention to Sales',
    jsonb_build_object(
      'company_id', v_company,
      'office_id', v_office,
      'retention_manager_id', v_retention_manager
    )
  );

  DELETE FROM public.crm_client_retention_assignments
  WHERE client_id = p_client_id;

  PERFORM set_config('crm.promotion_authorized', 'yes', true);
  UPDATE public.users
  SET is_promoted = false,
      promoted_at = NULL,
      promoted_by = NULL,
      updated_at = now()
  WHERE id = p_client_id;

  INSERT INTO public.admin_action_logs(
    admin_user_id,
    target_user_id,
    company_id,
    action,
    before_data,
    after_data,
    reason
  ) VALUES (
    auth.uid(),
    p_client_id,
    v_company,
    'crm_client_demoted',
    jsonb_build_object(
      'workspace', 'retention',
      'office_id', v_office,
      'retention_id', v_retention,
      'retention_manager_id', v_retention_manager
    ),
    jsonb_build_object(
      'workspace', 'sales',
      'office_id', v_office,
      'owner_id', NULL
    ),
    'Demoted to Sales'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_admin_demote_client_to_sales(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_admin_demote_client_to_sales(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
