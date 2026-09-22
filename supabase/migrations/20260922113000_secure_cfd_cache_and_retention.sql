REVOKE ALL ON public.cfd_market_quotes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.cfd_market_quotes TO authenticated;
REVOKE ALL ON public.cfd_market_candles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.cfd_market_candles TO authenticated;

-- Only server functions may alter the shared price table consumed by the trading engine.
REVOKE INSERT, UPDATE, DELETE ON public.market_data FROM authenticated;

SELECT cron.schedule(
  'prune-twelve-data-cfd-history',
  '15 2 * * *',
  $job$DELETE FROM public.cfd_market_candles WHERE candle_time < now() - interval '30 days';$job$
);
