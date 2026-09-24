/* Deliberately destructive Office removal. The UI previews impact and the Edge
   function removes Auth identities before this transactional database cleanup. */

CREATE OR REPLACE FUNCTION public.crm_admin_get_office_delete_preview(p_office_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_office public.crm_offices%ROWTYPE;
BEGIN
  PERFORM public.require_admin();
  SELECT * INTO v_office FROM public.crm_offices WHERE id=p_office_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Office not found'; END IF;
  RETURN jsonb_build_object(
    'id',v_office.id,'name',v_office.name,'code',v_office.code,
    'user_count',(SELECT count(*) FROM public.users WHERE office_id=p_office_id),
    'lead_count',(SELECT count(*) FROM public.crm_leads WHERE office_id=p_office_id),
    'sales_client_count',(SELECT count(*) FROM public.users u WHERE u.office_id=p_office_id AND NOT u.is_promoted AND NOT u.is_admin AND NOT EXISTS(SELECT 1 FROM public.crm_staff_roles s WHERE s.user_id=u.id)),
    'retention_client_count',(SELECT count(*) FROM public.users u WHERE u.office_id=p_office_id AND u.is_promoted AND NOT u.is_admin AND NOT EXISTS(SELECT 1 FROM public.crm_staff_roles s WHERE s.user_id=u.id)),
    'staff_count',(SELECT count(*) FROM public.crm_staff_roles s JOIN public.users u ON u.id=s.user_id WHERE u.office_id=p_office_id),
    'admin_count',(SELECT count(*) FROM public.users WHERE office_id=p_office_id AND is_admin));
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_service_delete_office_data(p_actor_id uuid,p_office_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_office public.crm_offices%ROWTYPE; v_users integer; v_leads integer;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_actor_id AND is_admin) THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  SELECT * INTO v_office FROM public.crm_offices WHERE id=p_office_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Office not found'; END IF;
  IF EXISTS(SELECT 1 FROM public.users WHERE office_id=p_office_id AND is_admin) THEN
    RAISE EXCEPTION 'Move global Administrators out of this Office before deleting it'; END IF;
  SELECT count(*) INTO v_users FROM public.users WHERE office_id=p_office_id;
  SELECT count(*) INTO v_leads FROM public.crm_leads WHERE office_id=p_office_id;
  DELETE FROM public.crm_leads WHERE office_id=p_office_id;
  DELETE FROM public.users WHERE office_id=p_office_id;
  DELETE FROM public.crm_offices WHERE id=p_office_id;
  INSERT INTO public.admin_action_logs(admin_user_id,action,before_data,after_data,reason)
  VALUES(p_actor_id,'crm_office_deleted',jsonb_build_object('office_id',p_office_id,'name',v_office.name,'code',v_office.code,'remaining_database_users',v_users,'leads',v_leads),jsonb_build_object('deleted',true),'Confirmed destructive Office deletion');
  RETURN jsonb_build_object('success',true,'office_id',p_office_id,'name',v_office.name,'code',v_office.code,'users_deleted',v_users,'leads_deleted',v_leads);
END;
$$;

REVOKE ALL ON FUNCTION public.crm_admin_get_office_delete_preview(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.crm_service_delete_office_data(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_admin_get_office_delete_preview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_service_delete_office_data(uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
