/* Resolve the effective CRM role for the shared administrator account workspace. */

CREATE OR REPLACE FUNCTION public.admin_get_account_role(p_target_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_role text;
BEGIN
  PERFORM public.require_admin();
  SELECT CASE
    WHEN u.is_admin THEN 'admin'
    ELSE COALESCE(s.role, 'client')
  END
  INTO v_role
  FROM public.users u
  LEFT JOIN public.crm_staff_roles s ON s.user_id = u.id
  WHERE u.id = p_target_user_id;

  IF v_role IS NULL THEN RAISE EXCEPTION 'Account not found'; END IF;
  RETURN v_role;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_account_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_account_role(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
