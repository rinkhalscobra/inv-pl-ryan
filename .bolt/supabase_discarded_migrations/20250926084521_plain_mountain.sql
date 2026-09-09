/*
  # Remove old WTI symbols from database

  1. Database Cleanup
    - Remove `WTIUSD` entries from `market_data` table
    - Remove `WTIUSD` entries from `price_data` table
    - Remove `WTIUSD` entries from `cached_crypto_pairs` table (if exists)
  
  2. Purpose
    - Prevent old WTI symbols from accidentally showing up
    - Ensure only `WTICOUSD` is used going forward
    - Clean up any legacy data
*/

-- Remove old WTIUSD entries from market_data table
DELETE FROM market_data WHERE symbol = 'WTIUSD';

-- Remove old WTIUSD entries from price_data table
DELETE FROM price_data WHERE symbol = 'WTIUSD';

-- Remove old WTIUSD entries from cached_crypto_pairs table if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'cached_crypto_pairs' 
    AND table_schema = 'public'
  ) THEN
    DELETE FROM cached_crypto_pairs WHERE symbol = 'WTIUSD';
  END IF;
END $$;

-- Also remove any other potential WTI variations to be safe
DELETE FROM market_data WHERE symbol IN ('WTI', 'WTIUSDT', 'WTI_USD');
DELETE FROM price_data WHERE symbol IN ('WTI', 'WTIUSDT', 'WTI_USD');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'cached_crypto_pairs' 
    AND table_schema = 'public'
  ) THEN
    DELETE FROM cached_crypto_pairs WHERE symbol IN ('WTI', 'WTIUSDT', 'WTI_USD');
  END IF;
END $$;

-- Log the cleanup action
INSERT INTO system_logs (action, details) 
VALUES ('cleanup_old_wti_symbols', 'Removed old WTI symbol variations (WTIUSD, WTI, WTIUSDT, WTI_USD) from database tables');