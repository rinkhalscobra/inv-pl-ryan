/*
  # Event Betting System

  1. New Tables
    - `events` - Main event details for betting
    - `event_outcomes` - Possible outcomes for each event
    - `event_bets` - User bets on event outcomes

  2. Security
    - Enable RLS on all new tables
    - Add policies for authenticated users to access their own data
    - Allow users to view all open events

  3. Features
    - Automatic timestamps with updated_at triggers
    - Proper foreign key relationships
    - Indexes for performance
*/

-- Create events table
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  question text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general' CHECK (category IN ('politics', 'sports', 'crypto', 'economy', 'tech', 'general')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'resolved')),
  resolution_outcome_id uuid,
  end_date timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create event outcomes table
CREATE TABLE IF NOT EXISTS event_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE NOT NULL,
  outcome_name text NOT NULL,
  current_price numeric(10,4) NOT NULL DEFAULT 0.5000,
  total_volume numeric(20,8) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(event_id, outcome_name)
);

-- Create event bets table
CREATE TABLE IF NOT EXISTS event_bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  outcome_id uuid REFERENCES event_outcomes(id) ON DELETE CASCADE NOT NULL,
  amount numeric(20,8) NOT NULL,
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  price_at_bet numeric(10,4) NOT NULL,
  shares numeric(20,8) NOT NULL,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key constraint for resolution outcome
ALTER TABLE events ADD CONSTRAINT events_resolution_outcome_id_fkey 
  FOREIGN KEY (resolution_outcome_id) REFERENCES event_outcomes(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_outcomes_event_id ON event_outcomes(event_id);
CREATE INDEX IF NOT EXISTS idx_event_bets_user_id ON event_bets(user_id);
CREATE INDEX IF NOT EXISTS idx_event_bets_outcome_id ON event_bets(outcome_id);
CREATE INDEX IF NOT EXISTS idx_event_bets_created_at ON event_bets(created_at DESC);

-- Enable Row Level Security
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_bets ENABLE ROW LEVEL SECURITY;

-- RLS Policies for events
CREATE POLICY "Users can view all open events"
  ON events
  FOR SELECT
  TO authenticated
  USING (status = 'open' OR user_id = auth.uid());

CREATE POLICY "Users can create events"
  ON events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own events"
  ON events
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for event outcomes
CREATE POLICY "Users can view all event outcomes"
  ON event_outcomes
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create outcomes for own events"
  ON event_outcomes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events 
      WHERE id = event_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update outcomes for own events"
  ON event_outcomes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events 
      WHERE id = event_id AND user_id = auth.uid()
    )
  );

-- RLS Policies for event bets
CREATE POLICY "Users can view own bets"
  ON event_bets
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own bets"
  ON event_bets
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create triggers for updated_at
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_event_outcomes_updated_at
  BEFORE UPDATE ON event_outcomes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_event_bets_updated_at
  BEFORE UPDATE ON event_bets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample events
INSERT INTO events (question, description, category, end_date) VALUES
  ('Will Bitcoin reach $150,000 by end of 2025?', 'Bitcoin price prediction for end of year 2025', 'crypto', '2025-12-31 23:59:59+00'),
  ('Will the US Federal Reserve cut interest rates in Q1 2025?', 'Federal Reserve monetary policy decision', 'economy', '2025-03-31 23:59:59+00'),
  ('Will Tesla stock price exceed $300 by June 2025?', 'Tesla stock price prediction', 'tech', '2025-06-30 23:59:59+00'),
  ('Will there be a US recession in 2025?', 'Economic recession prediction for the United States', 'economy', '2025-12-31 23:59:59+00'),
  ('Will Ethereum 2.0 staking rewards exceed 5% APY in 2025?', 'Ethereum staking yield prediction', 'crypto', '2025-12-31 23:59:59+00')
ON CONFLICT DO NOTHING;

-- Insert sample outcomes for each event
INSERT INTO event_outcomes (event_id, outcome_name, current_price) 
SELECT 
  e.id,
  'Yes',
  0.3500
FROM events e
WHERE e.question LIKE '%Bitcoin reach $150,000%'
ON CONFLICT DO NOTHING;

INSERT INTO event_outcomes (event_id, outcome_name, current_price) 
SELECT 
  e.id,
  'No',
  0.6500
FROM events e
WHERE e.question LIKE '%Bitcoin reach $150,000%'
ON CONFLICT DO NOTHING;

INSERT INTO event_outcomes (event_id, outcome_name, current_price) 
SELECT 
  e.id,
  'Yes',
  0.7200
FROM events e
WHERE e.question LIKE '%Federal Reserve cut%'
ON CONFLICT DO NOTHING;

INSERT INTO event_outcomes (event_id, outcome_name, current_price) 
SELECT 
  e.id,
  'No',
  0.2800
FROM events e
WHERE e.question LIKE '%Federal Reserve cut%'
ON CONFLICT DO NOTHING;

INSERT INTO event_outcomes (event_id, outcome_name, current_price) 
SELECT 
  e.id,
  'Yes',
  0.4100
FROM events e
WHERE e.question LIKE '%Tesla stock%'
ON CONFLICT DO NOTHING;

INSERT INTO event_outcomes (event_id, outcome_name, current_price) 
SELECT 
  e.id,
  'No',
  0.5900
FROM events e
WHERE e.question LIKE '%Tesla stock%'
ON CONFLICT DO NOTHING;

INSERT INTO event_outcomes (event_id, outcome_name, current_price) 
SELECT 
  e.id,
  'Yes',
  0.2300
FROM events e
WHERE e.question LIKE '%US recession%'
ON CONFLICT DO NOTHING;

INSERT INTO event_outcomes (event_id, outcome_name, current_price) 
SELECT 
  e.id,
  'No',
  0.7700
FROM events e
WHERE e.question LIKE '%US recession%'
ON CONFLICT DO NOTHING;

INSERT INTO event_outcomes (event_id, outcome_name, current_price) 
SELECT 
  e.id,
  'Yes',
  0.6800
FROM events e
WHERE e.question LIKE '%Ethereum 2.0%'
ON CONFLICT DO NOTHING;

INSERT INTO event_outcomes (event_id, outcome_name, current_price) 
SELECT 
  e.id,
  'No',
  0.3200
FROM events e
WHERE e.question LIKE '%Ethereum 2.0%'
ON CONFLICT DO NOTHING;

-- Add more market data for CFD trading
INSERT INTO market_data (symbol, price, volume_24h, change_24h) VALUES
  -- Forex pairs
  ('EURUSD', 1.0850, 5000000000, 0.15),
  ('GBPUSD', 1.2650, 3000000000, -0.25),
  ('USDJPY', 148.50, 4000000000, 0.35),
  ('AUDUSD', 0.6750, 1500000000, -0.12),
  ('USDCAD', 1.3450, 2000000000, 0.08),
  
  -- Commodities
  ('XAUUSD', 2045.50, 8000000000, 1.25), -- Gold
  ('XAGUSD', 24.85, 1000000000, 2.15),   -- Silver
  ('WTIUSD', 72.30, 6000000000, -0.85),  -- Oil WTI
  ('XPTUSD', 985.20, 500000000, 0.95),   -- Platinum
  
  -- Major Stocks
  ('AAPL', 195.50, 15000000000, 1.85),   -- Apple
  ('MSFT', 415.25, 12000000000, 0.95),   -- Microsoft
  ('GOOGL', 175.80, 8000000000, -0.45),  -- Google
  ('TSLA', 248.75, 20000000000, 3.25),   -- Tesla
  ('AMZN', 185.90, 10000000000, 1.15),   -- Amazon
  ('NVDA', 875.30, 25000000000, 2.85),   -- NVIDIA
  ('META', 485.60, 9000000000, 0.75),    -- Meta
  ('NFLX', 485.20, 5000000000, -1.25)    -- Netflix
ON CONFLICT (symbol) DO UPDATE SET
  price = EXCLUDED.price,
  volume_24h = EXCLUDED.volume_24h,
  change_24h = EXCLUDED.change_24h,
  timestamp = now();