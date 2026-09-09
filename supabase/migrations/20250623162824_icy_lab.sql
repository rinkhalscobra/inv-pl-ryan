/*
  # Remove Yahoo Market Data Table

  1. Changes
    - Drop the yahoo_market_data table
    - Remove any associated policies, triggers, and functions
    - This migration removes all traces of Yahoo Finance integration
  
  2. Security
    - No changes to existing RLS policies for other tables
*/

-- Drop the yahoo_market_data table if it exists
DROP TABLE IF EXISTS yahoo_market_data;

-- Drop any associated triggers
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_yahoo_market_data_last_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS update_yahoo_market_data_last_updated_at ON yahoo_market_data;
  END IF;
END $$;