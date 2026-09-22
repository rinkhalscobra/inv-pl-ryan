-- Supabase's gateway supplies cf-connecting-ip to PostgREST. Use only this
-- gateway-supplied client address; never trust x-forwarded-for from the caller.
CREATE OR REPLACE FUNCTION crm_private.admin_ip_allowed()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'cf-connecting-ip'
      IN ('46.166.172.116', '92.246.87.144'),
    false
  );
$$;
REVOKE ALL ON FUNCTION crm_private.admin_ip_allowed() FROM PUBLIC, anon, authenticated;

-- Keep the existing service-role path for trusted server jobs. Every
-- browser-facing administrator RPC and admin RLS policy uses this helper.
CREATE OR REPLACE FUNCTION public.check_admin_role(user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(auth.role() = 'service_role', false)
    OR (
      user_id = auth.uid()
      AND crm_private.admin_ip_allowed()
      AND EXISTS (
        SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = true
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.crm_admin_ip_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.check_admin_role(auth.uid());
$$;
REVOKE ALL ON FUNCTION public.crm_admin_ip_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_admin_ip_allowed() TO authenticated;

-- These older support policies used the is_admin column directly and would
-- otherwise bypass the shared IP gate when accessing tables without the CRM.
DROP POLICY IF EXISTS "Admins can view all conversations" ON public.conversations;
CREATE POLICY "Admins can view all conversations" ON public.conversations
  FOR SELECT TO authenticated USING (public.check_admin_role(auth.uid()));
DROP POLICY IF EXISTS "Admins can update all conversations" ON public.conversations;
CREATE POLICY "Admins can update all conversations" ON public.conversations
  FOR UPDATE TO authenticated USING (public.check_admin_role(auth.uid()))
  WITH CHECK (public.check_admin_role(auth.uid()));
DROP POLICY IF EXISTS "Admins can view all messages" ON public.messages;
CREATE POLICY "Admins can view all messages" ON public.messages
  FOR SELECT TO authenticated USING (public.check_admin_role(auth.uid()));
DROP POLICY IF EXISTS "Admins can update any message" ON public.messages;
CREATE POLICY "Admins can update any message" ON public.messages
  FOR UPDATE TO authenticated USING (public.check_admin_role(auth.uid()))
  WITH CHECK (public.check_admin_role(auth.uid()));
DROP POLICY IF EXISTS "Admins can send messages in any conversation" ON public.messages;
CREATE POLICY "Admins can send messages in any conversation" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.check_admin_role(auth.uid()));
