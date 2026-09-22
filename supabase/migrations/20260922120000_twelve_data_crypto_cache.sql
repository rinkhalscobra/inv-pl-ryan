CREATE TABLE public.crypto_market_quotes (
  symbol text PRIMARY KEY,
  provider_symbol text NOT NULL,
  provider text NOT NULL DEFAULT 'Twelve Data' CHECK (provider = 'Twelve Data'),
  price numeric(30, 12) NOT NULL CHECK (price > 0),
  price_usd numeric(30, 12) NOT NULL CHECK (price_usd > 0),
  change_24h numeric(20, 8) NOT NULL DEFAULT 0,
  high_price_24h numeric(30, 12) NOT NULL DEFAULT 0,
  low_price_24h numeric(30, 12) NOT NULL DEFAULT 0,
  volume_24h numeric(30, 8) NOT NULL DEFAULT 0,
  timestamp timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crypto_market_quotes_timestamp_idx ON public.crypto_market_quotes(timestamp DESC);
ALTER TABLE public.crypto_market_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crypto_market_quotes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.crypto_market_quotes TO authenticated;
GRANT ALL ON public.crypto_market_quotes TO service_role;
CREATE POLICY "Authenticated users read Twelve Data crypto quotes" ON public.crypto_market_quotes
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.crypto_market_candles (
  symbol text NOT NULL,
  candle_time timestamptz NOT NULL,
  open numeric(30, 12) NOT NULL CHECK (open > 0),
  high numeric(30, 12) NOT NULL CHECK (high > 0),
  low numeric(30, 12) NOT NULL CHECK (low > 0),
  close numeric(30, 12) NOT NULL CHECK (close > 0),
  volume numeric(30, 8) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(symbol,candle_time)
);
CREATE INDEX crypto_market_candles_time_idx ON public.crypto_market_candles(candle_time DESC);
ALTER TABLE public.crypto_market_candles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crypto_market_candles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.crypto_market_candles TO authenticated;
GRANT ALL ON public.crypto_market_candles TO service_role;
CREATE POLICY "Authenticated users read Twelve Data crypto candles" ON public.crypto_market_candles
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.crypto_quote_refresh_state (
  cache_key text PRIMARY KEY,
  next_refresh_at timestamptz NOT NULL DEFAULT '-infinity',
  lease_until timestamptz NOT NULL DEFAULT '-infinity',
  last_attempt_at timestamptz,
  last_success_at timestamptz
);
ALTER TABLE public.crypto_quote_refresh_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crypto_quote_refresh_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.crypto_quote_refresh_state TO service_role;

CREATE FUNCTION public.claim_crypto_quote_refresh(p_cache_key text, p_interval_seconds integer, p_force boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_claimed text;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_cache_key IS NULL OR length(p_cache_key) > 80 OR
     (p_cache_key <> 'catalog' AND p_cache_key !~ '^(selected|candles):[A-Z0-9]{2,24}$') THEN
    RAISE EXCEPTION 'Invalid crypto refresh key';
  END IF;
  IF p_interval_seconds < 30 OR p_interval_seconds > 3600 THEN RAISE EXCEPTION 'Invalid crypto refresh interval'; END IF;
  INSERT INTO public.crypto_quote_refresh_state(cache_key,next_refresh_at,lease_until,last_attempt_at)
  VALUES(p_cache_key,now(),now()+interval '2 minutes',now())
  ON CONFLICT(cache_key) DO UPDATE
  SET lease_until=now()+interval '2 minutes',last_attempt_at=now()
  WHERE public.crypto_quote_refresh_state.lease_until<=now()
    AND (public.crypto_quote_refresh_state.next_refresh_at<=now()
      OR (p_force AND p_cache_key LIKE 'selected:%'
        AND public.crypto_quote_refresh_state.last_attempt_at<=now()-interval '30 seconds'))
  RETURNING cache_key INTO v_claimed;
  RETURN v_claimed IS NOT NULL;
END;
$$;
CREATE FUNCTION public.finish_crypto_quote_refresh(p_cache_key text,p_interval_seconds integer,p_success boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  UPDATE public.crypto_quote_refresh_state SET lease_until=now(),
    next_refresh_at=now()+make_interval(secs=>CASE WHEN p_success THEN p_interval_seconds ELSE 30 END),
    last_success_at=CASE WHEN p_success THEN now() ELSE last_success_at END
  WHERE cache_key=p_cache_key;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_crypto_quote_refresh(text,integer,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finish_crypto_quote_refresh(text,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_crypto_quote_refresh(text,integer,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_crypto_quote_refresh(text,integer,boolean) TO service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime'
    AND schemaname='public' AND tablename='crypto_market_quotes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crypto_market_quotes;
  END IF;
END $$;

SELECT cron.schedule('sync-twelve-data-crypto-quotes','*/4 * * * *',$job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cfd_sync_url')
      || '/functions/v1/twelve-crypto-market-data',
    headers := jsonb_build_object('Content-Type','application/json','x-cfd-sync-token',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cfd_sync_token')),
    body := '{"action":"sync_all"}'::jsonb,
    timeout_milliseconds := 120000
  );
$job$);

SELECT cron.schedule('prune-twelve-data-crypto-history','25 2 * * *',$job$
  DELETE FROM public.crypto_market_candles WHERE candle_time < now()-interval '30 days';
$job$);
