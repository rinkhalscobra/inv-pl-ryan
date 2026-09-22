-- Leave a small margin before the next fixed cron tick. Without it, a run
-- finishing seconds after a tick can cause the following tick to skip.
CREATE OR REPLACE FUNCTION public.finish_crypto_quote_refresh(
  p_cache_key text, p_interval_seconds integer, p_success boolean
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  UPDATE public.crypto_quote_refresh_state SET
    lease_until = now(),
    next_refresh_at = now() + make_interval(secs => CASE
      WHEN NOT p_success THEN 30
      WHEN p_cache_key = 'catalog' THEN 180
      WHEN p_cache_key LIKE 'selected:%' THEN 45
      ELSE p_interval_seconds
    END),
    last_success_at = CASE WHEN p_success THEN now() ELSE last_success_at END
  WHERE cache_key = p_cache_key;
END;
$$;

UPDATE public.crypto_quote_refresh_state
SET next_refresh_at = now()
WHERE cache_key = 'catalog' OR cache_key LIKE 'selected:%';
