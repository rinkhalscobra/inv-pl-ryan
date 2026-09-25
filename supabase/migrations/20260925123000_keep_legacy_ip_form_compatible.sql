/* Keep the already-deployed two-field IP form usable while the tenant-aware
   frontend is being published. Platform admins that omit a company attach the
   IP to the default company; the new UI always sends an explicit company. */

CREATE OR REPLACE FUNCTION public.crm_admin_add_ip(
  p_ip text,
  p_label text DEFAULT '',
  p_company_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_address inet;
  v_label text := btrim(COALESCE(p_label, ''));
  v_scope text;
  v_network_company uuid;
  v_target uuid;
BEGIN
  PERFORM public.require_admin();
  BEGIN
    v_address := btrim(p_ip)::inet;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Enter a single valid IP address';
  END;
  IF position('/' IN p_ip) > 0 OR length(v_label) > 80 THEN
    RAISE EXCEPTION 'Enter a single valid IP and a label up to 80 characters';
  END IF;

  SELECT n.access_scope, n.company_id
  INTO v_scope, v_network_company
  FROM crm_private.request_network_context() n;

  IF v_scope = 'platform' THEN
    v_target := COALESCE(
      p_company_id,
      (SELECT c.id FROM public.crm_companies c WHERE c.is_default_registration AND c.status = 'active')
    );
  ELSE
    v_target := v_network_company;
  END IF;

  IF v_target IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.crm_companies c WHERE c.id = v_target AND c.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Select an active company for this IP';
  END IF;

  INSERT INTO crm_private.admin_ip_allowlist(address, label, created_by, company_id, access_scope)
  VALUES (v_address, v_label, auth.uid(), v_target, 'company');

  INSERT INTO public.admin_action_logs(admin_user_id, company_id, action, after_data, reason)
  VALUES (
    auth.uid(),
    v_target,
    'admin_ip_added',
    jsonb_build_object('ip', host(v_address), 'label', v_label),
    'CRM company network access'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_admin_add_ip(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_admin_add_ip(text, text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
