/*
  # Add unique constraint to market_data symbol column

  1. Changes
    - Add unique constraint on `symbol` column in `market_data` table
    - This enables upsert operations with onConflict: 'symbol'
  
  2. Security
    - No changes to existing RLS policies
*/

-- Add unique constraint to symbol column in market_data table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'market_data_symbol_key' 
    AND table_name = 'market_data'
  ) THEN
    ALTER TABLE market_data ADD CONSTRAINT market_data_symbol_key UNIQUE (symbol);
  END IF;
END $$;