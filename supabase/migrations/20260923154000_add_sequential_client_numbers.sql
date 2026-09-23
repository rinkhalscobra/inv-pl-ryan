/*
  Give every client profile a short, immutable sequential number while keeping
  the existing UUID-backed client identifier.
*/

CREATE SEQUENCE IF NOT EXISTS public.client_number_seq
  AS bigint
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  CACHE 1;

ALTER TABLE public.client_profiles
  ADD COLUMN IF NOT EXISTS client_number bigint;

/* Preserve any existing numbers and backfill the rest by registration order. */
WITH numbered AS (
  SELECT
    p.user_id,
    COALESCE((SELECT max(existing.client_number) FROM public.client_profiles existing), 0)
      + row_number() OVER (ORDER BY u.created_at, p.created_at, p.user_id) AS client_number
  FROM public.client_profiles p
  JOIN public.users u ON u.id = p.user_id
  WHERE p.client_number IS NULL
)
UPDATE public.client_profiles p
SET client_number = numbered.client_number
FROM numbered
WHERE p.user_id = numbered.user_id;

SELECT setval(
  'public.client_number_seq',
  GREATEST(COALESCE((SELECT max(client_number) FROM public.client_profiles), 1), 1),
  EXISTS (SELECT 1 FROM public.client_profiles)
);

ALTER SEQUENCE public.client_number_seq
  OWNED BY public.client_profiles.client_number;

ALTER TABLE public.client_profiles
  ALTER COLUMN client_number SET DEFAULT nextval('public.client_number_seq'::regclass),
  ALTER COLUMN client_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS client_profiles_client_number_key
  ON public.client_profiles(client_number);

ALTER TABLE public.client_profiles
  DROP CONSTRAINT IF EXISTS client_profiles_client_number_positive;
ALTER TABLE public.client_profiles
  ADD CONSTRAINT client_profiles_client_number_positive CHECK (client_number > 0);

CREATE OR REPLACE FUNCTION public.prevent_client_number_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.client_number IS DISTINCT FROM OLD.client_number THEN
    RAISE EXCEPTION 'Client number is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_client_number ON public.client_profiles;
CREATE TRIGGER protect_client_number
BEFORE UPDATE OF client_number ON public.client_profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_client_number_change();

REVOKE ALL ON SEQUENCE public.client_number_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.client_number_seq TO service_role;

/* Include client identifiers in the CRM list and make both searchable. */
CREATE OR REPLACE FUNCTION public.admin_get_users(
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
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
  WITH filtered AS (
    SELECT u.*
    FROM public.users u
    WHERE p_search IS NULL
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

NOTIFY pgrst, 'reload schema';
