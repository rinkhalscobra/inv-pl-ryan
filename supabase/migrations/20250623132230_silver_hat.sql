/*
  # Add updated_at column and trigger to market_data table

  1. Changes
    - Add updated_at column to market_data table if it doesn't exist
    - Create trigger to automatically update the updated_at column when a row is updated
    - This fixes the error in the sync-bybit-market-data Edge Function
  
  2. Security
    - No changes to existing RLS policies
*/

-- Add updated_at column to market_data table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'market_data' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE market_data ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Create or replace the update_updated_at_column function if it doesn't exist
-- This function is used by triggers to update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at trigger for market_data table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'market_data'::regclass AND tgname = 'update_market_data_updated_at'
  ) THEN
    CREATE TRIGGER update_market_data_updated_at
    BEFORE UPDATE ON market_data
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Update all existing rows to have a current updated_at value
UPDATE market_data
SET updated_at = now()
WHERE updated_at IS NULL;