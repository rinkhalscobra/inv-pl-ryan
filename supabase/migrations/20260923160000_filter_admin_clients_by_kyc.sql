/* Filter the CRM customer list in the database while keeping summary counts global. */

DROP FUNCTION IF EXISTS public.admin_get_users(text, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_get_users(
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0,
  p_kyc_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.require_admin();
  IF p_kyc_status IS NOT NULL AND p_kyc_status NOT IN ('not_verified', 'pending', 'verified') THEN
    RAISE EXCEPTION 'Invalid KYC status filter';
  END IF;

  WITH filtered AS (
    SELECT u.*
    FROM public.users u
    WHERE (p_kyc_status IS NULL OR u.kyc_status = p_kyc_status)
      AND (
        p_search IS NULL
        OR btrim(p_search) = ''
        OR u.email ILIKE '%' || btrim(p_search) || '%'
        OR COALESCE(u.first_name, '') ILIKE '%' || btrim(p_search) || '%'
        OR COALESCE(u.last_name, '') ILIKE '%' || btrim(p_search) || '%'
        OR u.id::text ILIKE '%' || btrim(p_search) || '%'
        OR EXISTS (
          SELECT 1
          FROM public.client_profiles cp
          WHERE cp.user_id = u.id
            AND (
              cp.client_id ILIKE '%' || btrim(p_search) || '%'
              OR cp.client_number::text = btrim(p_search)
            )
        )
      )
  ),
  page AS (
    SELECT f.*
    FROM filtered f
    ORDER BY f.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 250)
    OFFSET GREATEST(p_offset, 0)
  )
  SELECT jsonb_build_object(
    'users', COALESCE((
      SELECT jsonb_agg(
        (to_jsonb(p) - 'is_demo') || jsonb_build_object(
          'client_number', cp.client_number,
          'client_id', cp.client_id,
          'usdt_balance', COALESCE(b.usdt_balance, 0),
          'usd_balance', COALESCE(b.usd_balance, 0),
          'btc_balance', COALESCE(b.btc_balance, 0),
          'robot_allocated_balance', COALESCE(r.allocated_balance, 0),
          'robot_active', COALESCE(r.is_active, false)
        )
        ORDER BY p.created_at DESC
      )
      FROM page p
      LEFT JOIN public.client_profiles cp ON cp.user_id = p.id
      LEFT JOIN public.balances b ON b.user_id = p.id
      LEFT JOIN public.robot_states r ON r.user_id = p.id
    ), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered),
    'stats', jsonb_build_object(
      'total_users', (SELECT count(*) FROM public.users),
      'pending_kyc', (SELECT count(*) FROM public.users WHERE kyc_status = 'pending'),
      'active_robots', (SELECT count(*) FROM public.robot_states WHERE is_active = true),
      'total_usdt', (SELECT COALESCE(sum(usdt_balance), 0) FROM public.balances),
      'total_usd', (SELECT COALESCE(sum(usd_balance), 0) FROM public.balances),
      'total_robot_allocated', (SELECT COALESCE(sum(allocated_balance), 0) FROM public.robot_states)
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_users(text, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_users(text, integer, integer, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
