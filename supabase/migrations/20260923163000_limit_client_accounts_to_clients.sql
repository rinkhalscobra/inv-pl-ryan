/* The Client Accounts CRM view must contain client roles only. */

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

  WITH clients AS (
    SELECT u.*
    FROM public.users u
    WHERE u.is_admin = false
      AND NOT EXISTS (
        SELECT 1 FROM public.crm_staff_roles staff WHERE staff.user_id = u.id
      )
  ),
  filtered AS (
    SELECT u.*
    FROM clients u
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
    'total', (SELECT count(*) FROM clients),
    'stats', jsonb_build_object(
      'total_users', (SELECT count(*) FROM clients),
      'pending_kyc', (SELECT count(*) FROM clients WHERE kyc_status = 'pending'),
      'active_robots', (
        SELECT count(*)
        FROM public.robot_states r
        JOIN clients c ON c.id = r.user_id
        WHERE r.is_active = true
      ),
      'total_usdt', (
        SELECT COALESCE(sum(b.usdt_balance), 0)
        FROM public.balances b JOIN clients c ON c.id = b.user_id
      ),
      'total_usd', (
        SELECT COALESCE(sum(b.usd_balance), 0)
        FROM public.balances b JOIN clients c ON c.id = b.user_id
      ),
      'total_robot_allocated', (
        SELECT COALESCE(sum(r.allocated_balance), 0)
        FROM public.robot_states r JOIN clients c ON c.id = r.user_id
      )
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

NOTIFY pgrst, 'reload schema';
