/* Resolve the registration path for an approved company network. Platform and
   unknown/public client IPs intentionally return NULL. The Vercel middleware
   uses this only to keep company staff on their own registration route. */

CREATE OR REPLACE FUNCTION public.crm_registration_network_route(p_ip text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_address inet;
  v_path text;
BEGIN
  BEGIN
    v_address := NULLIF(btrim(p_ip), '')::inet;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  SELECT CASE
    WHEN c.is_default_registration THEN '/register'
    ELSE '/signup/' || c.registration_slug
  END
  INTO v_path
  FROM crm_private.admin_ip_allowlist a
  JOIN public.crm_companies c ON c.id = a.company_id AND c.status = 'active'
  WHERE a.address = v_address
    AND a.access_scope = 'company';

  RETURN v_path;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_registration_network_route(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_registration_network_route(text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
