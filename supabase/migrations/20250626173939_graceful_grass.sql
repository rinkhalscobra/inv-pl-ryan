/*
  # Add Arbitrage Bot Trading Logs Table

  1. New Table
    - `trading_logs` - Stores simulated arbitrage bot trading logs
    
  2. Security
    - Enable RLS on the new table
    - Add policies for authenticated users to access their own logs
    - Add policy for service role to manage all logs
    
  3. Features
    - Store trade details like pair, exchange, amount, price, profit
    - Track when trades were executed
    - Maintain proper foreign key relationships
*/

-- Create trading_logs table
CREATE TABLE IF NOT EXISTS trading_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('BUY', 'SELL')),
  pair text NOT NULL,
  exchange text NOT NULL,
  amount text NOT NULL,
  price text NOT NULL,
  profit text NOT NULL,
  status text NOT NULL CHECK (status IN ('completed', 'failed')),
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE trading_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
CREATE POLICY "Users can view own trading logs"
  ON trading_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trading logs"
  ON trading_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage all trading logs"
  ON trading_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_trading_logs_user_id ON trading_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_trading_logs_created_at ON trading_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trading_logs_pair ON trading_logs(pair);
CREATE INDEX IF NOT EXISTS idx_trading_logs_action ON trading_logs(action);

-- Add last_profit_timestamp column to robot_states table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'robot_states' AND column_name = 'last_profit_timestamp'
  ) THEN
    ALTER TABLE robot_states ADD COLUMN last_profit_timestamp timestamptz;
  END IF;
END $$;