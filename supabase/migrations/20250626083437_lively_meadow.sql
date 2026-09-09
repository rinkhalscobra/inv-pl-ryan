/*
  # Prop Firm Challenge System

  1. New Tables
    - `prop_positions` - Stores prop firm challenge positions
    - `prop_orders` - Stores prop firm challenge orders
    - `prop_position_history` - Stores closed prop firm challenge positions
    - `prop_account_balances` - Stores prop firm challenge account balances
    - `prop_logs` - Stores prop firm challenge activity logs

  2. Security
    - Enable RLS on all new tables
    - Add policies for authenticated users to access their own data
    - Add policies for service role to manage all data

  3. Features
    - Separate tables from live trading
    - Track challenge-specific metrics
    - Maintain proper foreign key relationships
*/

-- Create prop_positions table (similar to futures_positions)
CREATE TABLE IF NOT EXISTS prop_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  challenge_id text NOT NULL, -- 'starter', 'bronze', 'silver', 'gold', 'platinum', 'diamond'
  symbol text NOT NULL DEFAULT 'BTCUSDT',
  entry_price numeric(20,8) NOT NULL,
  current_price numeric(20,8) NOT NULL,
  amount numeric(20,8) NOT NULL,
  leverage integer NOT NULL DEFAULT 1,
  margin_type text NOT NULL DEFAULT 'isolated' CHECK (margin_type IN ('isolated', 'cross')),
  side text NOT NULL CHECK (side IN ('long', 'short')),
  liquidation_price numeric(20,8) NOT NULL,
  unrealized_pnl numeric(20,8) DEFAULT 0.00000000,
  margin numeric(20,8) NOT NULL,
  roi numeric(10,4) DEFAULT 0.0000,
  is_open boolean DEFAULT true,
  position_size numeric(20,8),
  tp_price numeric(20,8),
  sl_price numeric(20,8),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create prop_orders table (similar to futures_orders)
CREATE TABLE IF NOT EXISTS prop_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  challenge_id text NOT NULL, -- 'starter', 'bronze', 'silver', 'gold', 'platinum', 'diamond'
  symbol text NOT NULL DEFAULT 'BTCUSDT',
  type text NOT NULL CHECK (type IN ('limit', 'market', 'stop')),
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  price numeric(20,8),
  amount numeric(20,8) NOT NULL,
  leverage integer NOT NULL DEFAULT 1,
  margin_type text NOT NULL DEFAULT 'isolated' CHECK (margin_type IN ('isolated', 'cross')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'cancelled')),
  tp_price numeric(20,8),
  sl_price numeric(20,8),
  created_at timestamptz DEFAULT now(),
  filled_at timestamptz,
  position_id uuid REFERENCES prop_positions(id) ON DELETE SET NULL
);

-- Create prop_position_history table (similar to futures_position_history)
CREATE TABLE IF NOT EXISTS prop_position_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  challenge_id text NOT NULL, -- 'starter', 'bronze', 'silver', 'gold', 'platinum', 'diamond'
  symbol text NOT NULL,
  side text NOT NULL CHECK (side IN ('long', 'short')),
  entry_price numeric(20,8) NOT NULL,
  exit_price numeric(20,8) NOT NULL,
  amount numeric(20,8) NOT NULL,
  leverage integer NOT NULL,
  margin numeric(20,8) NOT NULL,
  pnl numeric(20,8) NOT NULL,
  roi numeric(10,4) NOT NULL,
  open_time timestamptz NOT NULL,
  close_time timestamptz DEFAULT now(),
  duration_seconds integer
);

-- Create prop_account_balances table
CREATE TABLE IF NOT EXISTS prop_account_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  challenge_id text NOT NULL, -- 'starter', 'bronze', 'silver', 'gold', 'platinum', 'diamond'
  starting_balance numeric(20,8) NOT NULL,
  current_balance numeric(20,8) NOT NULL,
  max_balance numeric(20,8) NOT NULL DEFAULT 0, -- Track highest balance achieved
  max_drawdown numeric(20,8) NOT NULL, -- Maximum allowed drawdown
  max_drawdown_reached numeric(20,8) DEFAULT 0, -- Track maximum drawdown reached
  target_profit numeric(20,8) NOT NULL, -- Target profit to pass challenge
  daily_loss_limit numeric(20,8), -- Optional daily loss limit
  weekly_loss_limit numeric(20,8), -- Optional weekly loss limit
  start_date timestamptz DEFAULT now(),
  end_date timestamptz, -- Challenge end date
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create prop_logs table
CREATE TABLE IF NOT EXISTS prop_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  challenge_id text NOT NULL, -- 'starter', 'bronze', 'silver', 'gold', 'platinum', 'diamond'
  action text NOT NULL, -- 'order_placed', 'order_executed', 'position_closed', 'liquidated', 'challenge_failed', etc.
  details jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE prop_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prop_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE prop_position_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE prop_account_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE prop_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for prop_positions
CREATE POLICY "Users can manage own prop positions"
  ON prop_positions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage all prop positions"
  ON prop_positions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create RLS Policies for prop_orders
CREATE POLICY "Users can manage own prop orders"
  ON prop_orders
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage all prop orders"
  ON prop_orders
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create RLS Policies for prop_position_history
CREATE POLICY "Users can view own prop position history"
  ON prop_position_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all prop position history"
  ON prop_position_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create RLS Policies for prop_account_balances
CREATE POLICY "Users can manage own prop account balances"
  ON prop_account_balances
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage all prop account balances"
  ON prop_account_balances
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create RLS Policies for prop_logs
CREATE POLICY "Users can view own prop logs"
  ON prop_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all prop logs"
  ON prop_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_prop_positions_user_id ON prop_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_prop_positions_challenge_id ON prop_positions(challenge_id);
CREATE INDEX IF NOT EXISTS idx_prop_positions_symbol ON prop_positions(symbol);
CREATE INDEX IF NOT EXISTS idx_prop_positions_is_open ON prop_positions(is_open);

CREATE INDEX IF NOT EXISTS idx_prop_orders_user_id ON prop_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_prop_orders_challenge_id ON prop_orders(challenge_id);
CREATE INDEX IF NOT EXISTS idx_prop_orders_status ON prop_orders(status);

CREATE INDEX IF NOT EXISTS idx_prop_position_history_user_id ON prop_position_history(user_id);
CREATE INDEX IF NOT EXISTS idx_prop_position_history_challenge_id ON prop_position_history(challenge_id);
CREATE INDEX IF NOT EXISTS idx_prop_position_history_close_time ON prop_position_history(close_time DESC);

CREATE INDEX IF NOT EXISTS idx_prop_account_balances_user_id ON prop_account_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_prop_account_balances_challenge_id ON prop_account_balances(challenge_id);
CREATE INDEX IF NOT EXISTS idx_prop_account_balances_status ON prop_account_balances(status);

CREATE INDEX IF NOT EXISTS idx_prop_logs_user_id ON prop_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_prop_logs_challenge_id ON prop_logs(challenge_id);
CREATE INDEX IF NOT EXISTS idx_prop_logs_action ON prop_logs(action);
CREATE INDEX IF NOT EXISTS idx_prop_logs_created_at ON prop_logs(created_at DESC);

-- Create triggers for updated_at
CREATE TRIGGER update_prop_positions_updated_at
  BEFORE UPDATE ON prop_positions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_prop_account_balances_updated_at
  BEFORE UPDATE ON prop_account_balances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();