-- Preload chart history so changing markets does not depend on a new provider
-- request before a chart can render. Runs eight times a day, between quote jobs.
SELECT cron.schedule('warm-twelve-data-crypto-charts', '2 */3 * * *', $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cfd_sync_url')
      || '/functions/v1/twelve-crypto-market-data',
    headers := jsonb_build_object('Content-Type','application/json','x-cfd-sync-token',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cfd_sync_token')),
    body := '{"action":"warm_history"}'::jsonb,
    timeout_milliseconds := 120000
  );
$job$);

SELECT cron.unschedule('prune-twelve-data-crypto-history');
SELECT cron.schedule('prune-twelve-data-crypto-history','25 * * * *',$job$
  DELETE FROM public.crypto_market_candles WHERE candle_time < now()-interval '6 hours';
$job$);
