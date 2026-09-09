/*
  # Add updated_at trigger for market_data table

  1. Changes
    - Add trigger to automatically update the updated_at column when a row is updated
    - This fixes the error in the sync-bybit-market-data Edge Function
  
  2. Security
    - No changes to existing RLS policies
*/

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