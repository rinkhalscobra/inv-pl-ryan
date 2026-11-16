/* Quotes for both market catalogs and candles for the selected market refresh
   once per minute. Keep a lease while a request runs and anchor its cooldown to
   the start of that request, allowing five seconds for timer / network drift. */
CREATE OR REPLACE FUNCTION public.finish_crypto_quote_refresh(
  p_cache_key text, p_interval_seconds integer, p_success boolean
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_interval_seconds IS NULL OR p_interval_seconds < 30 OR p_interval_seconds > 3600 THEN
    RAISE EXCEPTION 'Invalid crypto refresh interval';
  END IF;
  UPDATE public.crypto_quote_refresh_state SET
    lease_until = now(),
    next_refresh_at = CASE WHEN p_success
      THEN greatest(now(), coalesce(last_attempt_at, now())
        + make_interval(secs => p_interval_seconds - 5))
      ELSE now() + interval '30 seconds' END,
    last_success_at = CASE WHEN p_success THEN now() ELSE last_success_at END
  WHERE cache_key = p_cache_key;
END;
$$;

REVOKE ALL ON FUNCTION public.finish_crypto_quote_refresh(text,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_crypto_quote_refresh(text,integer,boolean) TO service_role;

DO $$
DECLARE v_name text; v_job bigint;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['sync-twelve-data-cfd-quotes','sync-twelve-data-crypto-quotes'] LOOP
    SELECT jobid INTO v_job FROM cron.job WHERE jobname=v_name;
    IF v_job IS NULL THEN RAISE EXCEPTION 'Expected market refresh job % was not found',v_name; END IF;
    PERFORM cron.alter_job(v_job,schedule => '* * * * *');
  END LOOP;
END;
$$;

-- Retire four-minute cooldowns without interrupting an in-flight refresh.
UPDATE public.crypto_quote_refresh_state SET next_refresh_at=least(next_refresh_at,now())
WHERE cache_key='catalog' OR cache_key LIKE 'selected:%' OR cache_key LIKE 'candles:%';
UPDATE public.cfd_quote_refresh_state SET next_refresh_at=least(next_refresh_at,now())
WHERE cache_key='catalog' OR cache_key LIKE 'selected:%' OR cache_key LIKE 'candles:%';
