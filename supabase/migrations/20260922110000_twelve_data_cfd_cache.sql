-- Twelve Data is the sole source for CFD prices shown to clients and used by the trading engine.
CREATE TABLE public.cfd_market_quotes (
  symbol text PRIMARY KEY,
  provider_symbol text NOT NULL,
  provider text NOT NULL DEFAULT 'Twelve Data' CHECK (provider = 'Twelve Data'),
  price numeric(30, 10) NOT NULL CHECK (price > 0),
  change_24h numeric(20, 8) NOT NULL DEFAULT 0,
  high_price_24h numeric(30, 10) NOT NULL DEFAULT 0,
  low_price_24h numeric(30, 10) NOT NULL DEFAULT 0,
  volume_24h numeric(30, 8) NOT NULL DEFAULT 0,
  timestamp timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_market_open boolean
);
CREATE INDEX cfd_market_quotes_timestamp_idx ON public.cfd_market_quotes (timestamp DESC);
ALTER TABLE public.cfd_market_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read CFD quotes" ON public.cfd_market_quotes
  FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.cfd_market_quotes FROM anon;
GRANT SELECT ON public.cfd_market_quotes TO authenticated;
GRANT ALL ON public.cfd_market_quotes TO service_role;

CREATE TABLE public.cfd_quote_sync_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  scope text NOT NULL CHECK (scope IN ('catalog', 'selected')),
  requested_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  error text
);
CREATE INDEX cfd_quote_sync_runs_started_idx ON public.cfd_quote_sync_runs (started_at DESC);
ALTER TABLE public.cfd_quote_sync_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cfd_quote_sync_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.cfd_quote_sync_runs TO service_role;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cfd_market_quotes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cfd_market_quotes;
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
SELECT cron.schedule(
  'sync-twelve-data-cfd-quotes',
  '*/4 * * * *',
  $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cfd_sync_url')
        || '/functions/v1/cfd-market-data',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cfd-sync-token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cfd_sync_token')
      ),
      body := '{"action":"sync_all"}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$
);
