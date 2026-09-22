-- The refresh lease used to start after the request completed. A one-minute
-- selected refresh (and the four-minute cron) therefore missed every other
-- scheduled tick. Anchor the next window to the claim time with five seconds
-- of scheduling room; the lease still prevents concurrent requests.
CREATE OR REPLACE FUNCTION public.finish_cfd_quote_refresh(
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
    next_refresh_at = CASE WHEN p_success
      THEN greatest(now(), coalesce(last_attempt_at, now())
        + make_interval(secs => p_interval_seconds - 5))
      ELSE now() + interval '30 seconds' END,
    last_success_at = CASE WHEN p_success THEN now() ELSE last_success_at END
  WHERE cache_key = p_cache_key;
END;
$$;

-- Keep the database execution guard aligned with the CFD order form and Edge
-- Function. The Edge Function retains its stricter two-minute crypto guard.
DO $$
DECLARE
  signature text;
  definition text;
BEGIN
  FOREACH signature IN ARRAY ARRAY['public.process_futures_engine()'] LOOP
    SELECT pg_get_functiondef(to_regprocedure(signature)) INTO definition;
    IF definition IS NULL OR position('interval ''2 minutes''' IN definition) = 0 THEN
      RAISE EXCEPTION 'Expected quote age guard not found in %', signature;
    END IF;
    EXECUTE replace(definition, 'interval ''2 minutes''', 'interval ''3 minutes''');
  END LOOP;
END;
$$;
