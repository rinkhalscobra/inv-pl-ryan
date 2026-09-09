-- Create function to create the cached_crypto_pairs table if it doesn't exist
CREATE OR REPLACE FUNCTION create_cached_crypto_pairs_table_if_not_exists()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if the table exists
  IF NOT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'cached_crypto_pairs'
  ) THEN
    -- Create the table
    CREATE TABLE public.cached_crypto_pairs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      symbol text UNIQUE NOT NULL,
      name text NOT NULL,
      base text NOT NULL,
      quote text NOT NULL,
      last_updated_at timestamptz DEFAULT now()
    );

    -- Enable RLS
    ALTER TABLE public.cached_crypto_pairs ENABLE ROW LEVEL SECURITY;

    -- Create policies
    CREATE POLICY "Authenticated users can read cached crypto pairs"
      ON public.cached_crypto_pairs
      FOR SELECT
      TO authenticated
      USING (true);

    CREATE POLICY "Service role can manage cached crypto pairs"
      ON public.cached_crypto_pairs
      FOR ALL
      TO service_role
      USING (true);

    -- Create indexes
    CREATE INDEX idx_cached_crypto_pairs_symbol ON public.cached_crypto_pairs(symbol);
    CREATE INDEX idx_cached_crypto_pairs_base ON public.cached_crypto_pairs(base);
    CREATE INDEX idx_cached_crypto_pairs_quote ON public.cached_crypto_pairs(quote);
    CREATE INDEX idx_cached_crypto_pairs_last_updated_at ON public.cached_crypto_pairs(last_updated_at);
  END IF;
END;
$$;

-- Execute the function to create the table
SELECT create_cached_crypto_pairs_table_if_not_exists();