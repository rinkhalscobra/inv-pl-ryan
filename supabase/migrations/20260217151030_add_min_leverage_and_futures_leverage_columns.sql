/*
  # Add min leverage and futures leverage columns to users table

  1. New Columns on `users`
    - `min_leverage_forex` (integer) - Minimum allowed leverage for forex CFD trading
    - `min_leverage_commodities` (integer) - Minimum allowed leverage for commodities CFD trading
    - `min_leverage_stocks` (integer) - Minimum allowed leverage for stocks CFD trading
    - `max_leverage_futures` (integer) - Maximum allowed leverage for futures trading
    - `min_leverage_futures` (integer) - Minimum allowed leverage for futures trading

  2. Notes
    - If NULL, system uses default leverage based on account tier
    - If min and max are the same, that becomes the only allowed leverage for the user
    - These columns allow per-user leverage customization from the admin backend
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'min_leverage_forex'
  ) THEN
    ALTER TABLE users ADD COLUMN min_leverage_forex integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'min_leverage_commodities'
  ) THEN
    ALTER TABLE users ADD COLUMN min_leverage_commodities integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'min_leverage_stocks'
  ) THEN
    ALTER TABLE users ADD COLUMN min_leverage_stocks integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'max_leverage_futures'
  ) THEN
    ALTER TABLE users ADD COLUMN max_leverage_futures integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'min_leverage_futures'
  ) THEN
    ALTER TABLE users ADD COLUMN min_leverage_futures integer;
  END IF;
END $$;
