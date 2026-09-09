/*
  # Create Instrument Spreads Table and Configuration

  1. New Tables
    - `instrument_spreads`
      - `id` (uuid, primary key)
      - `symbol` (text, unique) - Trading pair/instrument symbol
      - `instrument_type` (text) - Type: crypto, forex, commodity, stock, index
      - `spread_percentage` (numeric) - Base spread as percentage (e.g., 0.0006 for 0.06%)
      - `min_spread_value` (numeric) - Minimum spread in absolute terms
      - `max_spread_value` (numeric) - Maximum spread in absolute terms
      - `is_active` (boolean) - Whether spread is currently active
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Security
    - Enable RLS on `instrument_spreads` table
    - Add policy for all authenticated users to read spreads
    - Add policy for service role to manage spreads
  
  3. Initial Data
    - Populate spreads for crypto futures (0.005-0.02%)
    - Populate spreads for forex majors (0.006-0.009%)
    - Populate spreads for forex minors (0.009-0.015%)
    - Populate spreads for forex exotics (0.05-0.3%)
    - Populate spreads for commodities (0.015-0.05%)
    - Populate spreads for indices (0.01-0.02%)
    - Populate spreads for stocks (0.01-0.015%)
*/

-- Create instrument_spreads table
CREATE TABLE IF NOT EXISTS instrument_spreads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text UNIQUE NOT NULL,
  instrument_type text NOT NULL,
  spread_percentage numeric(10, 6) NOT NULL DEFAULT 0.0001,
  min_spread_value numeric(20, 8) NOT NULL DEFAULT 0.00000001,
  max_spread_value numeric(20, 8) NOT NULL DEFAULT 999999.99999999,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_instrument_spreads_symbol ON instrument_spreads(symbol);
CREATE INDEX IF NOT EXISTS idx_instrument_spreads_type ON instrument_spreads(instrument_type);

-- Enable RLS
ALTER TABLE instrument_spreads ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read spreads
CREATE POLICY "Authenticated users can read spreads"
  ON instrument_spreads
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Service role can manage spreads
CREATE POLICY "Service role can manage spreads"
  ON instrument_spreads
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Insert crypto futures spreads (0.005-0.02%)
INSERT INTO instrument_spreads (symbol, instrument_type, spread_percentage, min_spread_value, max_spread_value)
VALUES
  ('BTCUSDT', 'crypto', 0.00005, 0.5, 2.0),
  ('ETHUSDT', 'crypto', 0.00008, 0.02, 0.5),
  ('BNBUSDT', 'crypto', 0.0001, 0.005, 0.1),
  ('SOLUSDT', 'crypto', 0.0001, 0.002, 0.05),
  ('XRPUSDT', 'crypto', 0.00015, 0.00005, 0.0005),
  ('DOGEUSDT', 'crypto', 0.0002, 0.000001, 0.00001),
  ('ADAUSDT', 'crypto', 0.00015, 0.00005, 0.0005),
  ('MATICUSDT', 'crypto', 0.00015, 0.00005, 0.001),
  ('LINKUSDT', 'crypto', 0.00012, 0.001, 0.01)
ON CONFLICT (symbol) DO NOTHING;

-- Insert forex major pairs spreads (0.006-0.009%)
INSERT INTO instrument_spreads (symbol, instrument_type, spread_percentage, min_spread_value, max_spread_value)
VALUES
  ('EUR/USD', 'forex', 0.00006, 0.00006, 0.0001),
  ('GBP/USD', 'forex', 0.00008, 0.00008, 0.00012),
  ('USD/JPY', 'forex', 0.00007, 0.007, 0.01),
  ('AUD/USD', 'forex', 0.00007, 0.00007, 0.0001),
  ('USD/CHF', 'forex', 0.00009, 0.00009, 0.00012),
  ('USD/CAD', 'forex', 0.00008, 0.00008, 0.00011)
ON CONFLICT (symbol) DO NOTHING;

-- Insert forex cross pairs spreads (0.009-0.015%)
INSERT INTO instrument_spreads (symbol, instrument_type, spread_percentage, min_spread_value, max_spread_value)
VALUES
  ('EUR/GBP', 'forex', 0.00009, 0.00009, 0.00012),
  ('EUR/JPY', 'forex', 0.0001, 0.01, 0.015),
  ('GBP/JPY', 'forex', 0.00012, 0.015, 0.02),
  ('EUR/AUD', 'forex', 0.00011, 0.00011, 0.00015),
  ('EUR/CHF', 'forex', 0.0001, 0.0001, 0.00013),
  ('AUD/JPY', 'forex', 0.00011, 0.011, 0.015)
ON CONFLICT (symbol) DO NOTHING;

-- Insert forex exotic pairs spreads (0.05-0.3%)
INSERT INTO instrument_spreads (symbol, instrument_type, spread_percentage, min_spread_value, max_spread_value)
VALUES
  ('USD/TRY', 'forex', 0.001, 0.003, 0.01),
  ('USD/ZAR', 'forex', 0.0008, 0.001, 0.005),
  ('USD/MXN', 'forex', 0.0006, 0.001, 0.003),
  ('USD/BRL', 'forex', 0.0008, 0.001, 0.004),
  ('EUR/TRY', 'forex', 0.0012, 0.004, 0.012)
ON CONFLICT (symbol) DO NOTHING;

-- Insert commodity spreads (0.015-0.05%)
INSERT INTO instrument_spreads (symbol, instrument_type, spread_percentage, min_spread_value, max_spread_value)
VALUES
  ('XAU/USD', 'commodity', 0.00015, 0.20, 0.50),
  ('XAUUSD', 'commodity', 0.00015, 0.20, 0.50),
  ('XAG/USD', 'commodity', 0.0005, 0.02, 0.05),
  ('XAGUSD', 'commodity', 0.0005, 0.02, 0.05),
  ('WTICO/USD', 'commodity', 0.0003, 0.03, 0.05),
  ('BCO/USD', 'commodity', 0.0004, 0.04, 0.06),
  ('NATGAS/USD', 'commodity', 0.0005, 0.005, 0.01),
  ('XPT/USD', 'commodity', 0.0004, 0.40, 0.80),
  ('XPTUSD', 'commodity', 0.0004, 0.40, 0.80),
  ('XPD/USD', 'commodity', 0.0004, 0.40, 0.80),
  ('XPDUSD', 'commodity', 0.0004, 0.40, 0.80),
  ('CORN/USD', 'commodity', 0.0015, 0.05, 0.15),
  ('WHEAT/USD', 'commodity', 0.0015, 0.05, 0.15),
  ('SUGAR/USD', 'commodity', 0.002, 0.01, 0.03)
ON CONFLICT (symbol) DO NOTHING;

-- Insert index/ETF spreads (0.01-0.02%)
INSERT INTO instrument_spreads (symbol, instrument_type, spread_percentage, min_spread_value, max_spread_value)
VALUES
  ('SPY', 'index', 0.0001, 0.40, 1.0),
  ('QQQ', 'index', 0.00012, 1.0, 2.0),
  ('DIA', 'index', 0.0001, 1.0, 2.0),
  ('CAC', 'index', 0.0001, 1.0, 2.0),
  ('ASX', 'index', 0.00015, 1.0, 2.0)
ON CONFLICT (symbol) DO NOTHING;

-- Insert stock spreads (0.01-0.015%)
INSERT INTO instrument_spreads (symbol, instrument_type, spread_percentage, min_spread_value, max_spread_value)
VALUES
  ('AAPL', 'stock', 0.0001, 0.01, 0.03),
  ('MSFT', 'stock', 0.0001, 0.01, 0.03),
  ('TSLA', 'stock', 0.00015, 0.03, 0.06),
  ('AMZN', 'stock', 0.00012, 0.02, 0.04),
  ('META', 'stock', 0.00012, 0.02, 0.04),
  ('NVDA', 'stock', 0.00012, 0.03, 0.06),
  ('GOOGL', 'stock', 0.0001, 0.02, 0.04)
ON CONFLICT (symbol) DO NOTHING;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_instrument_spreads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS instrument_spreads_updated_at ON instrument_spreads;
CREATE TRIGGER instrument_spreads_updated_at
  BEFORE UPDATE ON instrument_spreads
  FOR EACH ROW
  EXECUTE FUNCTION update_instrument_spreads_updated_at();
