/* The page-level gate permits an administrator from any approved company
   network. Platform-only powers remain enforced by effective_company and
   is_platform_request, so this does not expose the company split. */

CREATE OR REPLACE FUNCTION public.crm_admin_ip_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.is_admin = true
  )
  AND EXISTS (
    SELECT 1
    FROM crm_private.request_network_context()
  );
$$;

REVOKE ALL ON FUNCTION public.crm_admin_ip_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_admin_ip_allowed() TO authenticated;

NOTIFY pgrst, 'reload schema';
