/*
  # Add Additional Market Data Fields

  1. Schema Updates
    - Add high_price_24h column to market_data table
    - Add low_price_24h column to market_data table
    - Add market_cap column to market_data table
    - Add funding_rate column to market_data table
    - Add open_interest column to market_data table
    
  2. Data Integrity
    - Set default values for new columns
    - Ensure proper data types for all fields
*/

-- Add new columns to market_data table if they don't exist
DO $$
BEGIN
  -- Add high_price_24h column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'market_data' AND column_name = 'high_price_24h'
  ) THEN
    ALTER TABLE market_data ADD COLUMN high_price_24h numeric(20,8) DEFAULT 0;
  END IF;

  -- Add low_price_24h column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'market_data' AND column_name = 'low_price_24h'
  ) THEN
    ALTER TABLE market_data ADD COLUMN low_price_24h numeric(20,8) DEFAULT 0;
  END IF;

  -- Add market_cap column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'market_data' AND column_name = 'market_cap'
  ) THEN
    ALTER TABLE market_data ADD COLUMN market_cap numeric(30,2) DEFAULT 0;
  END IF;

  -- Add funding_rate column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'market_data' AND column_name = 'funding_rate'
  ) THEN
    ALTER TABLE market_data ADD COLUMN funding_rate numeric(10,6) DEFAULT 0;
  END IF;

  -- Add open_interest column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'market_data' AND column_name = 'open_interest'
  ) THEN
    ALTER TABLE market_data ADD COLUMN open_interest numeric(30,2) DEFAULT 0;
  END IF;
END $$;

-- Update sample data with realistic values
UPDATE market_data
SET 
  high_price_24h = price * 1.05,
  low_price_24h = price * 0.95,
  market_cap = CASE 
    WHEN symbol = 'BTCUSDT' THEN 2070000000000
    WHEN symbol = 'ETHUSDT' THEN 450000000000
    WHEN symbol = 'BNBUSDT' THEN 65000000000
    WHEN symbol = 'SOLUSDT' THEN 42000000000
    WHEN symbol = 'XRPUSDT' THEN 35000000000
    ELSE price * 1000000000
  END,
  funding_rate = 0.0100,
  open_interest = CASE 
    WHEN symbol = 'BTCUSDT' THEN 2070000000000
    WHEN symbol = 'ETHUSDT' THEN 450000000000
    WHEN symbol = 'BNBUSDT' THEN 65000000000
    WHEN symbol = 'SOLUSDT' THEN 42000000000
    WHEN symbol = 'XRPUSDT' THEN 35000000000
    ELSE price * 1000000000
  END
WHERE symbol LIKE '%USDT';