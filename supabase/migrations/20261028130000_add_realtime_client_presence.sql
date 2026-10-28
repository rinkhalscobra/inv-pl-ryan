/*
  Authenticated, tenant-scoped client presence for the CRM.

  A browser tab owns one session row and refreshes it every 25 seconds. Explicit
  sign-out closes the row immediately. Abrupt browser, tab, device, or network
  loss is treated as offline when the heartbeat is older than 75 seconds.
*/

CREATE TABLE IF NOT EXISTS public.user_presence_sessions (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  company_id uuid REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  signed_out_at timestamptz,
  PRIMARY KEY (user_id, session_id)
);

CREATE INDEX IF NOT EXISTS user_presence_company_live_idx
  ON public.user_presence_sessions(company_id, last_seen_at DESC)
  WHERE signed_out_at IS NULL;
CREATE INDEX IF NOT EXISTS user_presence_user_seen_idx
  ON public.user_presence_sessions(user_id, last_seen_at DESC);

ALTER TABLE public.user_presence_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_presence_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_presence_sessions TO authenticated;

DROP POLICY IF EXISTS user_presence_read_own ON public.user_presence_sessions;
CREATE POLICY user_presence_read_own
ON public.user_presence_sessions
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_presence_admin_read_company ON public.user_presence_sessions;
CREATE POLICY user_presence_admin_read_company
ON public.user_presence_sessions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users actor
    WHERE actor.id = auth.uid()
      AND actor.is_admin
      AND (actor.company_id IS NULL OR actor.company_id IS NOT DISTINCT FROM user_presence_sessions.company_id)
  )
);

CREATE OR REPLACE FUNCTION public.touch_client_presence(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_session_id IS NULL THEN RAISE EXCEPTION 'Presence session is required'; END IF;

  SELECT u.company_id INTO v_company_id
  FROM public.users u
  WHERE u.id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Account profile not found'; END IF;

  INSERT INTO public.user_presence_sessions(
    user_id, session_id, company_id, connected_at, last_seen_at, signed_out_at
  ) VALUES (
    auth.uid(), p_session_id, v_company_id, now(), now(), NULL
  )
  ON CONFLICT (user_id, session_id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    last_seen_at = now(),
    signed_out_at = NULL;

  DELETE FROM public.user_presence_sessions
  WHERE user_id = auth.uid()
    AND last_seen_at < now() - interval '7 days';
END;
$$;

CREATE OR REPLACE FUNCTION public.end_client_presence(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.user_presence_sessions
  SET signed_out_at = now(), last_seen_at = now()
  WHERE user_id = auth.uid() AND session_id = p_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_all_client_presence()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.user_presence_sessions
  SET signed_out_at = now(), last_seen_at = now()
  WHERE user_id = auth.uid() AND signed_out_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_client_presence(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.end_client_presence(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.end_all_client_presence() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_client_presence(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_client_presence(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_all_client_presence() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_users(
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0,
  p_kyc_status text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_company uuid;
BEGIN
  PERFORM public.require_admin();
  v_company := crm_private.effective_company(p_company_id);
  IF p_kyc_status IS NOT NULL AND p_kyc_status NOT IN ('not_verified','pending','verified') THEN
    RAISE EXCEPTION 'Invalid KYC status filter';
  END IF;

  WITH clients AS (
    SELECT u.* FROM public.users u
    WHERE u.company_id = v_company AND NOT u.is_admin
      AND NOT EXISTS(SELECT 1 FROM public.crm_staff_roles s WHERE s.user_id = u.id)
  ), filtered AS (
    SELECT u.* FROM clients u
    WHERE (p_kyc_status IS NULL OR u.kyc_status = p_kyc_status)
      AND (p_search IS NULL OR btrim(p_search) = '' OR u.email ILIKE '%'||btrim(p_search)||'%'
        OR COALESCE(u.first_name,'') ILIKE '%'||btrim(p_search)||'%'
        OR COALESCE(u.last_name,'') ILIKE '%'||btrim(p_search)||'%'
        OR u.id::text ILIKE '%'||btrim(p_search)||'%'
        OR EXISTS(SELECT 1 FROM public.client_profiles cp WHERE cp.user_id = u.id
          AND (cp.client_id ILIKE '%'||btrim(p_search)||'%' OR cp.client_number::text = btrim(p_search))))
  ), page AS (
    SELECT * FROM filtered ORDER BY created_at DESC
    LIMIT LEAST(GREATEST(p_limit,1),250) OFFSET GREATEST(p_offset,0)
  )
  SELECT jsonb_build_object(
    'company_id', v_company,
    'users', COALESCE((SELECT jsonb_agg((to_jsonb(p)-'is_demo')||jsonb_build_object(
      'client_number', cp.client_number,
      'client_id', cp.client_id,
      'usdt_balance', COALESCE(b.usdt_balance,0),
      'usd_balance', COALESCE(b.usd_balance,0),
      'btc_balance', COALESCE(b.btc_balance,0),
      'robot_allocated_balance', COALESCE(r.allocated_balance,0),
      'robot_active', COALESCE(r.is_active,false),
      'is_online', EXISTS(
        SELECT 1 FROM public.user_presence_sessions ps
        WHERE ps.user_id = p.id AND ps.signed_out_at IS NULL
          AND ps.last_seen_at >= now() - interval '75 seconds'
      ),
      'last_seen_at', (
        SELECT max(ps.last_seen_at) FROM public.user_presence_sessions ps WHERE ps.user_id = p.id
      )
    ) ORDER BY p.created_at DESC)
    FROM page p
    LEFT JOIN public.client_profiles cp ON cp.user_id = p.id
    LEFT JOIN public.balances b ON b.user_id = p.id
    LEFT JOIN public.robot_states r ON r.user_id = p.id), '[]'::jsonb),
    'total', (SELECT count(*) FROM clients),
    'stats', jsonb_build_object(
      'total_users',(SELECT count(*) FROM clients),
      'pending_kyc',(SELECT count(*) FROM clients WHERE kyc_status='pending'),
      'active_robots',(SELECT count(*) FROM public.robot_states r JOIN clients c ON c.id=r.user_id WHERE r.is_active),
      'total_usdt',(SELECT COALESCE(sum(b.usdt_balance),0) FROM public.balances b JOIN clients c ON c.id=b.user_id),
      'total_usd',(SELECT COALESCE(sum(b.usd_balance),0) FROM public.balances b JOIN clients c ON c.id=b.user_id),
      'total_robot_allocated',(SELECT COALESCE(sum(r.allocated_balance),0) FROM public.robot_states r JOIN clients c ON c.id=r.user_id)
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'user_presence_sessions'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_presence_sessions;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
