-- The CFD chart reads the same provider as the displayed and traded quote.
CREATE TABLE public.cfd_market_candles (
  symbol text NOT NULL,
  candle_time timestamptz NOT NULL,
  open numeric(30, 10) NOT NULL,
  high numeric(30, 10) NOT NULL,
  low numeric(30, 10) NOT NULL,
  close numeric(30, 10) NOT NULL,
  volume numeric(30, 8) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, candle_time),
  CHECK (open > 0 AND high > 0 AND low > 0 AND close > 0)
);
CREATE INDEX cfd_market_candles_time_idx ON public.cfd_market_candles (candle_time DESC);
ALTER TABLE public.cfd_market_candles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read CFD candles" ON public.cfd_market_candles
  FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.cfd_market_candles FROM anon;
GRANT SELECT ON public.cfd_market_candles TO authenticated;
GRANT ALL ON public.cfd_market_candles TO service_role;

CREATE OR REPLACE FUNCTION public.claim_cfd_quote_refresh(
  p_cache_key text,
  p_interval_seconds integer,
  p_force boolean DEFAULT false
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_claimed text;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF p_cache_key IS NULL OR length(p_cache_key) > 80 OR
     (p_cache_key <> 'catalog' AND p_cache_key !~ '^(selected|candles):[A-Z0-9./^-]{1,24}$') THEN
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
