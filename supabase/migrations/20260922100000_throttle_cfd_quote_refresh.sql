-- Share CFD quote refresh windows across Edge Function instances and users.
CREATE TABLE public.cfd_quote_refresh_state (
  cache_key text PRIMARY KEY,
  next_refresh_at timestamptz NOT NULL DEFAULT '-infinity',
  lease_until timestamptz NOT NULL DEFAULT '-infinity',
  last_attempt_at timestamptz,
  last_success_at timestamptz
);
ALTER TABLE public.cfd_quote_refresh_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cfd_quote_refresh_state FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.claim_cfd_quote_refresh(
  p_cache_key text,
  p_interval_seconds integer,
  p_force boolean DEFAULT false
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_claimed text;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_cache_key IS NULL OR length(p_cache_key) > 80 OR
     (p_cache_key <> 'catalog' AND p_cache_key !~ '^selected:[A-Z0-9./^-]{1,24}$') THEN
    RAISE EXCEPTION 'Invalid CFD refresh key';
  END IF;
  IF p_interval_seconds < 30 OR p_interval_seconds > 3600 THEN
    RAISE EXCEPTION 'Invalid CFD refresh interval';
  END IF;

  INSERT INTO public.cfd_quote_refresh_state(cache_key, next_refresh_at, lease_until, last_attempt_at)
  VALUES (p_cache_key, now(), now() + interval '2 minutes', now())
  ON CONFLICT (cache_key) DO UPDATE
    SET lease_until = now() + interval '2 minutes', last_attempt_at = now()
    WHERE public.cfd_quote_refresh_state.lease_until <= now()
      AND (public.cfd_quote_refresh_state.next_refresh_at <= now()
        OR (p_force AND p_cache_key LIKE 'selected:%' AND
          public.cfd_quote_refresh_state.last_attempt_at <= now() - interval '30 seconds'))
  RETURNING cache_key INTO v_claimed;
  RETURN v_claimed IS NOT NULL;
END;
$$;

CREATE FUNCTION public.finish_cfd_quote_refresh(
  p_cache_key text,
  p_interval_seconds integer,
  p_success boolean
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_interval_seconds < 30 OR p_interval_seconds > 3600 THEN
    RAISE EXCEPTION 'Invalid CFD refresh interval';
  END IF;
  UPDATE public.cfd_quote_refresh_state SET
    lease_until = now(),
    next_refresh_at = now() + make_interval(secs => CASE WHEN p_success THEN p_interval_seconds ELSE 30 END),
    last_success_at = CASE WHEN p_success THEN now() ELSE last_success_at END
  WHERE cache_key = p_cache_key;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_cfd_quote_refresh(text, integer, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_cfd_quote_refresh(text, integer, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_cfd_quote_refresh(text, integer, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_cfd_quote_refresh(text, integer, boolean) TO service_role;
