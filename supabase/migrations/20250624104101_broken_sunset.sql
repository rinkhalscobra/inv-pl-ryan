-- Add bid_price column to market_data table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'market_data'
      AND column_name = 'bid_price'
  ) THEN
    ALTER TABLE market_data ADD COLUMN bid_price numeric(20,8);
  END IF;
END $$;

-- Add ask_price column to market_data table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'market_data'
      AND column_name = 'ask_price'
  ) THEN
    ALTER TABLE market_data ADD COLUMN ask_price numeric(20,8);
  END IF;
END $$;