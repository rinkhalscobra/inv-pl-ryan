/* Tenant provisioning rule:
   - adding an IP from the owner/platform network creates an empty company;
   - adding an IP from a company network extends that same company. */

DO $$
DECLARE
  v_primary uuid;
  v_company uuid;
  v_creator uuid;
BEGIN
  SELECT c.id INTO v_primary
  FROM public.crm_companies c
  WHERE c.is_default_registration
  LIMIT 1;

  SELECT a.created_by INTO v_creator
  FROM crm_private.admin_ip_allowlist a
  WHERE a.address = '85.206.167.101'::inet;

  IF EXISTS (
    SELECT 1
    FROM crm_private.admin_ip_allowlist a
    WHERE a.address = '85.206.167.101'::inet
      AND a.company_id = v_primary
  ) THEN
    SELECT c.id INTO v_company
    FROM public.crm_companies c
    WHERE c.code = 'IP_85_206_167_101';

    IF v_company IS NULL THEN
      INSERT INTO public.crm_companies(name, code, created_by)
      VALUES ('Company 85.206.167.101', 'IP_85_206_167_101', v_creator)
      RETURNING id INTO v_company;
    END IF;

    UPDATE crm_private.admin_ip_allowlist
    SET company_id = v_company,
        access_scope = 'company'
    WHERE address = '85.206.167.101'::inet;
  END IF;
END;
$$;

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
  v_company_name text;
  v_company_code text;
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
    IF p_company_id IS NOT NULL THEN
      RAISE EXCEPTION 'Create a new company to approve an IP from the platform network';
    END IF;
    v_company_name := COALESCE(NULLIF(v_label, ''), 'Company ' || host(v_address));
    v_company_code := 'IP_' || upper(substr(md5(host(v_address)), 1, 12));
    INSERT INTO public.crm_companies(name, code, created_by)
    VALUES (v_company_name, v_company_code, auth.uid())
    RETURNING id INTO v_target;
  ELSE
    v_target := v_network_company;
  END IF;

  IF v_target IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.crm_companies c WHERE c.id = v_target AND c.status = 'active'
  ) THEN
    RAISE EXCEPTION 'The company for this network is unavailable';
  END IF;

  INSERT INTO crm_private.admin_ip_allowlist(address, label, created_by, company_id, access_scope)
  VALUES (v_address, v_label, auth.uid(), v_target, 'company');

  INSERT INTO public.admin_action_logs(admin_user_id, company_id, action, after_data, reason)
  VALUES (
    auth.uid(),
    v_target,
    CASE WHEN v_scope = 'platform' THEN 'crm_company_created_from_ip' ELSE 'admin_ip_added' END,
    jsonb_build_object('ip', host(v_address), 'label', v_label),
    'CRM company network access'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_admin_add_ip(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_admin_add_ip(text, text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
