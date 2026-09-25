/* Final transactional cleanup after the Edge function deletes the company's
   Supabase Auth accounts. Only service_role may execute this function. */

CREATE OR REPLACE FUNCTION public.crm_service_delete_company_data(
  p_actor_id uuid,
  p_company_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company public.crm_companies%ROWTYPE;
  v_user_count integer;
  v_lead_count integer;
  v_office_count integer;
  v_source_count integer;
  v_ip_count integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = p_actor_id AND u.is_admin = true
  ) THEN
    RAISE EXCEPTION 'Platform administrator required';
  END IF;

  SELECT * INTO v_company
  FROM public.crm_companies c
  WHERE c.id = p_company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company not found';
  END IF;
  IF v_company.is_default_registration THEN
    RAISE EXCEPTION 'Primary Company cannot be deleted';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.company_id = p_company_id AND u.is_admin = true
  ) THEN
    RAISE EXCEPTION 'Move platform administrators out of this company before deletion';
  END IF;

  SELECT count(*) INTO v_user_count FROM public.users u WHERE u.company_id = p_company_id;
  SELECT count(*) INTO v_lead_count FROM public.crm_leads l WHERE l.company_id = p_company_id;
  SELECT count(*) INTO v_office_count FROM public.crm_offices o WHERE o.company_id = p_company_id;
  SELECT count(*) INTO v_source_count FROM public.crm_lead_sources s WHERE s.company_id = p_company_id;
  SELECT count(*) INTO v_ip_count FROM crm_private.admin_ip_allowlist a WHERE a.company_id = p_company_id;

  /* This also cascades all user-owned wallet, trading, support and CRM rows. */
  DELETE FROM public.users WHERE company_id = p_company_id;
  /* Company-owned rows and approved IPs cascade through their company_id FKs. */
  DELETE FROM public.crm_companies WHERE id = p_company_id;

  INSERT INTO public.admin_action_logs(admin_user_id, target_user_id, company_id, action, before_data, after_data, reason)
  VALUES (
    p_actor_id,
    NULL,
    NULL,
    'crm_company_deleted',
    jsonb_build_object(
      'company_id', v_company.id,
      'name', v_company.name,
      'code', v_company.code,
      'users', v_user_count,
      'leads', v_lead_count,
      'offices', v_office_count,
      'sources', v_source_count,
      'approved_ips', v_ip_count
    ),
    jsonb_build_object('deleted', true),
    'Permanent CRM company deletion'
  );

  RETURN jsonb_build_object(
    'company_id', v_company.id,
    'name', v_company.name,
    'users_deleted', v_user_count,
    'leads_deleted', v_lead_count,
    'offices_deleted', v_office_count,
    'sources_deleted', v_source_count,
    'approved_ips_deleted', v_ip_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_service_delete_company_data(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_service_delete_company_data(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
