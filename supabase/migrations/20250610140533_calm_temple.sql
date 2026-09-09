/*
  # Initial Trading Platform Schema

  1. New Tables
    - `users` - User authentication and profile data
    - `balances` - User wallet balances (USDT, BTC)
    - `spot_orders` - Spot trading order history
    - `futures_positions` - Futures trading positions
    - `binary_trades` - Binary options trading history
    - `robot_states` - Arbitrage robot configuration and state
    - `transactions` - All transaction history
    - `price_data` - Historical price data for charts

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to access their own data
    - Users can only read/write their own records

  3. Features
    - Automatic timestamps with updated_at triggers
    - Proper foreign key relationships
    - Indexes for performance
*/

-- Create users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create balances table
CREATE TABLE IF NOT EXISTS balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  usdt_balance decimal(20,8) DEFAULT 100000.00000000,
  btc_balance decimal(20,8) DEFAULT 0.00000000,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Create spot_orders table
CREATE TABLE IF NOT EXISTS spot_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  pair text NOT NULL DEFAULT 'BTC/USDT',
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  amount decimal(20,8) NOT NULL,
  rate decimal(20,8) NOT NULL,
  total decimal(20,8) NOT NULL,
  filled decimal(20,8) NOT NULL,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'partial', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create futures_positions table
CREATE TABLE IF NOT EXISTS futures_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  symbol text NOT NULL DEFAULT 'BTCUSDT',
  entry_price decimal(20,8) NOT NULL,
  current_price decimal(20,8) NOT NULL,
  amount decimal(20,8) NOT NULL,
  leverage integer NOT NULL DEFAULT 1,
  margin_type text NOT NULL DEFAULT 'isolated' CHECK (margin_type IN ('isolated', 'cross')),
  side text NOT NULL CHECK (side IN ('long', 'short')),
  liquidation_price decimal(20,8) NOT NULL,
  unrealized_pnl decimal(20,8) DEFAULT 0.00000000,
  margin decimal(20,8) NOT NULL,
  roi decimal(10,4) DEFAULT 0.0000,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create binary_trades table
CREATE TABLE IF NOT EXISTS binary_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  pair text NOT NULL DEFAULT 'BTC/USD',
  direction text NOT NULL CHECK (direction IN ('higher', 'lower')),
  amount decimal(20,8) NOT NULL,
  entry_price decimal(20,8) NOT NULL,
  settlement_price decimal(20,8) NOT NULL,
  duration text NOT NULL DEFAULT '0:30',
  outcome text NOT NULL CHECK (outcome IN ('win', 'loss')),
  pnl decimal(20,8) NOT NULL,
  profit_percentage decimal(10,4) NOT NULL DEFAULT 87.0000,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create robot_states table
CREATE TABLE IF NOT EXISTS robot_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  is_active boolean DEFAULT false,
  strategy text DEFAULT 'triangular',
  min_profit_threshold decimal(10,4) DEFAULT 0.5000,
  max_trade_amount decimal(20,8) DEFAULT 1000.00000000,
  allocated_balance decimal(20,8) DEFAULT 0.00000000,
  todays_profit decimal(20,8) DEFAULT 0.00000000,
  total_trades integer DEFAULT 0,
  successful_trades integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'trade', 'robot_profit', 'binary_trade')),
  amount decimal(20,8) NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'pending', 'failed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create price_data table for historical data
CREATE TABLE IF NOT EXISTS price_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL DEFAULT 'BTCUSDT',
  price decimal(20,8) NOT NULL,
  timestamp timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE spot_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE futures_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE binary_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE robot_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_data ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies

-- Users policies
CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = id::text);

-- Balances policies
CREATE POLICY "Users can read own balances"
  ON balances
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update own balances"
  ON balances
  FOR ALL
  TO authenticated
  USING (auth.uid()::text = user_id::text);

-- Spot orders policies
CREATE POLICY "Users can manage own spot orders"
  ON spot_orders
  FOR ALL
  TO authenticated
  USING (auth.uid()::text = user_id::text);

-- Futures positions policies
CREATE POLICY "Users can manage own futures positions"
  ON futures_positions
  FOR ALL
  TO authenticated
  USING (auth.uid()::text = user_id::text);

-- Binary trades policies
CREATE POLICY "Users can manage own binary trades"
  ON binary_trades
  FOR ALL
  TO authenticated
  USING (auth.uid()::text = user_id::text);

-- Robot states policies
CREATE POLICY "Users can manage own robot state"
  ON robot_states
  FOR ALL
  TO authenticated
  USING (auth.uid()::text = user_id::text);

-- Transactions policies
CREATE POLICY "Users can manage own transactions"
  ON transactions
  FOR ALL
  TO authenticated
  USING (auth.uid()::text = user_id::text);

-- Price data policies (read-only for all authenticated users)
CREATE POLICY "Authenticated users can read price data"
  ON price_data
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage price data"
  ON price_data
  FOR ALL
  TO service_role
  USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_balances_user_id ON balances(user_id);
CREATE INDEX IF NOT EXISTS idx_spot_orders_user_id ON spot_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_spot_orders_created_at ON spot_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_futures_positions_user_id ON futures_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_binary_trades_user_id ON binary_trades(user_id);
CREATE INDEX IF NOT EXISTS idx_binary_trades_created_at ON binary_trades(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_robot_states_user_id ON robot_states(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_data_symbol ON price_data(symbol);
CREATE INDEX IF NOT EXISTS idx_price_data_timestamp ON price_data(timestamp DESC);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_balances_updated_at BEFORE UPDATE ON balances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_spot_orders_updated_at BEFORE UPDATE ON spot_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_futures_positions_updated_at BEFORE UPDATE ON futures_positions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_binary_trades_updated_at BEFORE UPDATE ON binary_trades FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_robot_states_updated_at BEFORE UPDATE ON robot_states FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();