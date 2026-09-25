/* Platform-only company display-name editing. Registration keys and tenant
   membership remain unchanged. */

CREATE OR REPLACE FUNCTION public.crm_admin_update_company_name(
  p_company_id uuid,
  p_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_before text;
  v_company public.crm_companies%ROWTYPE;
BEGIN
  PERFORM public.require_admin();
  IF NOT crm_private.is_platform_request() THEN
    RAISE EXCEPTION 'Platform network required to edit companies';
  END IF;
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Select a company';
  END IF;
  IF length(btrim(COALESCE(p_name, ''))) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Enter a company name between 1 and 100 characters';
  END IF;

  SELECT c.name INTO v_before
  FROM public.crm_companies c
  WHERE c.id = p_company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  UPDATE public.crm_companies
  SET name = btrim(p_name),
      updated_at = now()
  WHERE id = p_company_id
  RETURNING * INTO v_company;

  INSERT INTO public.admin_action_logs(admin_user_id, company_id, action, before_data, after_data, reason)
  VALUES (
    auth.uid(),
    v_company.id,
    'crm_company_name_updated',
    jsonb_build_object('name', v_before),
    jsonb_build_object('name', v_company.name),
    'CRM company administration'
  );

  RETURN jsonb_build_object(
    'id', v_company.id,
    'name', v_company.name,
    'code', v_company.code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_admin_update_company_name(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_admin_update_company_name(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
