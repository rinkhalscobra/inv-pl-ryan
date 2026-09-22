-- Verify one shared refresh at a time and a global minimum between forced refreshes.
BEGIN;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.claim_cfd_quote_refresh('selected:TESTUSD', 60, false);
    RAISE EXCEPTION 'A browser session acquired a server refresh lease';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;
DO $$ BEGIN
  IF NOT public.claim_cfd_quote_refresh('selected:TESTUSD', 60, false) THEN
    RAISE EXCEPTION 'First quote refresh did not acquire its lease';
  END IF;
  IF public.claim_cfd_quote_refresh('selected:TESTUSD', 60, true) THEN
    RAISE EXCEPTION 'Concurrent refresh acquired an active lease';
  END IF;
  PERFORM public.finish_cfd_quote_refresh('selected:TESTUSD', 60, true);
  IF public.claim_cfd_quote_refresh('selected:TESTUSD', 60, false) THEN
    RAISE EXCEPTION 'Normal refresh ignored the cooldown';
  END IF;
  IF public.claim_cfd_quote_refresh('selected:TESTUSD', 60, true) THEN
    RAISE EXCEPTION 'Forced refresh ignored the minimum interval';
  END IF;
END $$;
RESET ROLE;

UPDATE public.cfd_quote_refresh_state SET last_attempt_at = now() - interval '31 seconds'
WHERE cache_key = 'selected:TESTUSD';
SET LOCAL ROLE service_role;
DO $$ BEGIN
  IF NOT public.claim_cfd_quote_refresh('selected:TESTUSD', 60, true) THEN
    RAISE EXCEPTION 'Forced refresh could not run after its minimum interval';
  END IF;
  PERFORM public.finish_cfd_quote_refresh('selected:TESTUSD', 60, true);
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'CFD quote refresh lease checks passed' AS result;
