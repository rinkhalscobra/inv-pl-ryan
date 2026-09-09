/*
  # Yahoo Finance Market Data Table

  1. New Table
    - `yahoo_market_data` - Stores market data fetched from Yahoo Finance
    
  2. Security
    - Enable RLS on the new table
    - Add policies for authenticated users to read market data
    - Add policy for service role to manage market data
    
  3. Features
    - Store price, volume, change percentage, and other market metrics
    - Track when data was last updated
    - Add indexes for better performance
*/

-- Create yahoo_market_data table
CREATE TABLE IF NOT EXISTS yahoo_market_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text UNIQUE NOT NULL,
  price numeric(20,8) NOT NULL,
  volume numeric(20,8),
  change_24h numeric(10,4),
  high_24h numeric(20,8),
  low_24h numeric(20,8),
  open_price numeric(20,8),
  previous_close numeric(20,8),
  market_cap numeric(30,2),
  pe_ratio numeric(10,2),
  dividend_yield numeric(10,4),
  timestamp timestamptz NOT NULL,
  last_updated_at timestamptz DEFAULT now(),
  source text DEFAULT 'yahoo_finance',
  instrument_type text CHECK (instrument_type IN ('stock', 'forex', 'commodity', 'index', 'etf', 'crypto', 'other'))
);

-- Enable Row Level Security
ALTER TABLE yahoo_market_data ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
CREATE POLICY "Authenticated users can read yahoo market data"
  ON yahoo_market_data
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage yahoo market data"
  ON yahoo_market_data
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_yahoo_market_data_symbol ON yahoo_market_data(symbol);
CREATE INDEX IF NOT EXISTS idx_yahoo_market_data_instrument_type ON yahoo_market_data(instrument_type);
CREATE INDEX IF NOT EXISTS idx_yahoo_market_data_timestamp ON yahoo_market_data(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_yahoo_market_data_last_updated_at ON yahoo_market_data(last_updated_at DESC);

-- Create updated_at trigger
CREATE TRIGGER update_yahoo_market_data_last_updated_at
  BEFORE UPDATE ON yahoo_market_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data for testing
INSERT INTO yahoo_market_data (symbol, price, volume, change_24h, high_24h, low_24h, open_price, previous_close, market_cap, timestamp, instrument_type) VALUES
  ('AAPL', 195.50, 15000000000, 1.85, 196.73, 193.42, 194.20, 192.53, 3050000000000, now(), 'stock'),
  ('TSLA', 248.75, 20000000000, 3.25, 252.42, 245.10, 246.30, 241.20, 790000000000, now(), 'stock'),
  ('EURUSD=X', 1.0850, 0, 0.15, 1.0875, 1.0825, 1.0840, 1.0835, 0, now(), 'forex'),
  ('GC=F', 2045.50, 8000000000, 1.25, 2050.75, 2035.25, 2040.50, 2020.75, 0, now(), 'commodity'),
  ('CL=F', 72.30, 6000000000, -0.85, 73.45, 71.80, 73.10, 72.95, 0, now(), 'commodity')
ON CONFLICT (symbol) DO UPDATE SET
  price = EXCLUDED.price,
  volume = EXCLUDED.volume,
  change_24h = EXCLUDED.change_24h,
  high_24h = EXCLUDED.high_24h,
  low_24h = EXCLUDED.low_24h,
  open_price = EXCLUDED.open_price,
  previous_close = EXCLUDED.previous_close,
  market_cap = EXCLUDED.market_cap,
  timestamp = EXCLUDED.timestamp,
  last_updated_at = now();