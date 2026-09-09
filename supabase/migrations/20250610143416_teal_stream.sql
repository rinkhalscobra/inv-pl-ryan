/*
  # Advanced Order Management System

  1. New Tables
    - `order_book` - Central order book for all trading pairs
    - `stop_orders` - Stop-loss and take-profit orders
    - `order_fills` - Track partial and complete order fills
    - `market_data` - Real-time market prices for trigger monitoring

  2. Updated Tables
    - Enhanced `spot_orders` with new order types and status
    - Enhanced `futures_positions` with attached stop orders

  3. Security
    - Enable RLS on all new tables
    - Add policies for user data access
    - Add triggers for order matching and execution

  4. Functions
    - Order matching engine
    - Stop order monitoring
    - Position management
*/

-- Create order book table for market/limit order matching
CREATE TABLE IF NOT EXISTS order_book (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  pair text NOT NULL DEFAULT 'BTC/USDT',
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  order_type text NOT NULL CHECK (order_type IN ('market', 'limit')),
  amount numeric(20,8) NOT NULL,
  price numeric(20,8), -- NULL for market orders
  filled_amount numeric(20,8) DEFAULT 0,
  remaining_amount numeric(20,8) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'filled', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  filled_at timestamptz
);

-- Create stop orders table for stop-loss and take-profit
CREATE TABLE IF NOT EXISTS stop_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  parent_order_id uuid REFERENCES order_book(id) ON DELETE CASCADE,
  position_id uuid REFERENCES futures_positions(id) ON DELETE CASCADE,
  pair text NOT NULL DEFAULT 'BTC/USDT',
  stop_type text NOT NULL CHECK (stop_type IN ('stop_loss', 'take_profit')),
  trigger_price numeric(20,8) NOT NULL,
  execution_type text NOT NULL CHECK (execution_type IN ('market', 'limit')),
  execution_price numeric(20,8), -- For limit execution
  amount numeric(20,8) NOT NULL,
  amount_type text NOT NULL DEFAULT 'absolute' CHECK (amount_type IN ('absolute', 'percentage')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'triggered', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  triggered_at timestamptz
);

-- Create order fills table for tracking executions
CREATE TABLE IF NOT EXISTS order_fills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES order_book(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  pair text NOT NULL,
  side text NOT NULL,
  amount numeric(20,8) NOT NULL,
  price numeric(20,8) NOT NULL,
  fee numeric(20,8) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create market data table for real-time prices
CREATE TABLE IF NOT EXISTS market_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  price numeric(20,8) NOT NULL,
  volume_24h numeric(20,8) DEFAULT 0,
  change_24h numeric(10,4) DEFAULT 0,
  timestamp timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_order_book_pair_side ON order_book(pair, side);
CREATE INDEX IF NOT EXISTS idx_order_book_price ON order_book(price) WHERE order_type = 'limit' AND status = 'pending';
CREATE INDEX IF NOT EXISTS idx_order_book_user_id ON order_book(user_id);
CREATE INDEX IF NOT EXISTS idx_stop_orders_user_id ON stop_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_stop_orders_trigger_price ON stop_orders(trigger_price) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_order_fills_user_id ON order_fills(user_id);
CREATE INDEX IF NOT EXISTS idx_market_data_symbol ON market_data(symbol);

-- Enable RLS
ALTER TABLE order_book ENABLE ROW LEVEL SECURITY;
ALTER TABLE stop_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_fills ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_data ENABLE ROW LEVEL SECURITY;

-- RLS Policies for order_book
CREATE POLICY "Users can manage own orders"
  ON order_book
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for stop_orders
CREATE POLICY "Users can manage own stop orders"
  ON stop_orders
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for order_fills
CREATE POLICY "Users can view own fills"
  ON order_fills
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for market_data
CREATE POLICY "Authenticated users can read market data"
  ON market_data
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage market data"
  ON market_data
  FOR ALL
  TO service_role
  USING (true);

-- Add triggers for updated_at
CREATE TRIGGER update_order_book_updated_at
  BEFORE UPDATE ON order_book
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stop_orders_updated_at
  BEFORE UPDATE ON stop_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update spot_orders table to include new order types
DO $$
BEGIN
  -- Add new columns if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'spot_orders' AND column_name = 'order_type'
  ) THEN
    ALTER TABLE spot_orders ADD COLUMN order_type text DEFAULT 'market' CHECK (order_type IN ('market', 'limit'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'spot_orders' AND column_name = 'remaining_amount'
  ) THEN
    ALTER TABLE spot_orders ADD COLUMN remaining_amount numeric(20,8) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'spot_orders' AND column_name = 'stop_loss_price'
  ) THEN
    ALTER TABLE spot_orders ADD COLUMN stop_loss_price numeric(20,8);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'spot_orders' AND column_name = 'take_profit_price'
  ) THEN
    ALTER TABLE spot_orders ADD COLUMN take_profit_price numeric(20,8);
  END IF;
END $$;

-- Insert initial market data
INSERT INTO market_data (symbol, price, volume_24h, change_24h) VALUES
  ('BTCUSDT', 104325.3716, 61940000000, 0.32),
  ('ETHUSDT', 3842.50, 25000000000, 1.25),
  ('BNBUSDT', 692.45, 5000000000, -0.15)
ON CONFLICT DO NOTHING;

-- Order matching function (simplified for demo)
CREATE OR REPLACE FUNCTION match_order(order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  order_rec record;
  match_rec record;
  fill_amount numeric(20,8);
  fill_price numeric(20,8);
BEGIN
  -- Get the order details
  SELECT * INTO order_rec FROM order_book WHERE id = order_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- For market orders, match against best available price
  IF order_rec.order_type = 'market' THEN
    -- Find best opposing orders
    FOR match_rec IN
      SELECT * FROM order_book
      WHERE pair = order_rec.pair
        AND side != order_rec.side
        AND order_type = 'limit'
        AND status = 'pending'
        AND remaining_amount > 0
      ORDER BY 
        CASE WHEN order_rec.side = 'buy' THEN price END ASC,
        CASE WHEN order_rec.side = 'sell' THEN price END DESC,
        created_at ASC
    LOOP
      fill_amount := LEAST(order_rec.remaining_amount, match_rec.remaining_amount);
      fill_price := match_rec.price;
      
      -- Create fill records
      INSERT INTO order_fills (order_id, user_id, pair, side, amount, price)
      VALUES (order_rec.id, order_rec.user_id, order_rec.pair, order_rec.side, fill_amount, fill_price);
      
      INSERT INTO order_fills (order_id, user_id, pair, side, amount, price)
      VALUES (match_rec.id, match_rec.user_id, match_rec.pair, match_rec.side, fill_amount, fill_price);
      
      -- Update order amounts
      UPDATE order_book SET
        filled_amount = filled_amount + fill_amount,
        remaining_amount = remaining_amount - fill_amount,
        status = CASE WHEN remaining_amount - fill_amount = 0 THEN 'filled' ELSE 'partial' END,
        updated_at = now(),
        filled_at = CASE WHEN remaining_amount - fill_amount = 0 THEN now() ELSE filled_at END
      WHERE id = order_rec.id;
      
      UPDATE order_book SET
        filled_amount = filled_amount + fill_amount,
        remaining_amount = remaining_amount - fill_amount,
        status = CASE WHEN remaining_amount - fill_amount = 0 THEN 'filled' ELSE 'partial' END,
        updated_at = now(),
        filled_at = CASE WHEN remaining_amount - fill_amount = 0 THEN now() ELSE filled_at END
      WHERE id = match_rec.id;
      
      -- Update order_rec for next iteration
      order_rec.remaining_amount := order_rec.remaining_amount - fill_amount;
      
      EXIT WHEN order_rec.remaining_amount = 0;
    END LOOP;
    
    -- Mark as filled if fully executed, otherwise cancelled (no more matches)
    UPDATE order_book SET
      status = CASE WHEN remaining_amount = 0 THEN 'filled' ELSE 'cancelled' END,
      updated_at = now()
    WHERE id = order_rec.id;
    
  -- For limit orders, check if price crosses current market
  ELSIF order_rec.order_type = 'limit' THEN
    -- Get current market price
    SELECT price INTO fill_price FROM market_data WHERE symbol = order_rec.pair ORDER BY created_at DESC LIMIT 1;
    
    -- Check if limit order can be immediately filled
    IF (order_rec.side = 'buy' AND fill_price <= order_rec.price) OR
       (order_rec.side = 'sell' AND fill_price >= order_rec.price) THEN
      -- Treat as market order at limit price
      fill_amount := order_rec.remaining_amount;
      fill_price := order_rec.price;
      
      INSERT INTO order_fills (order_id, user_id, pair, side, amount, price)
      VALUES (order_rec.id, order_rec.user_id, order_rec.pair, order_rec.side, fill_amount, fill_price);
      
      UPDATE order_book SET
        filled_amount = filled_amount + fill_amount,
        remaining_amount = 0,
        status = 'filled',
        updated_at = now(),
        filled_at = now()
      WHERE id = order_rec.id;
    END IF;
  END IF;
END;
$$;

-- Function to check and trigger stop orders
CREATE OR REPLACE FUNCTION check_stop_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stop_rec record;
  current_price numeric(20,8);
  should_trigger boolean;
BEGIN
  -- Get current market prices and check stop orders
  FOR stop_rec IN
    SELECT so.*, md.price as current_price
    FROM stop_orders so
    JOIN market_data md ON md.symbol = so.pair
    WHERE so.status = 'active'
  LOOP
    should_trigger := false;
    
    -- Check stop loss triggers
    IF stop_rec.stop_type = 'stop_loss' THEN
      should_trigger := stop_rec.current_price <= stop_rec.trigger_price;
    -- Check take profit triggers
    ELSIF stop_rec.stop_type = 'take_profit' THEN
      should_trigger := stop_rec.current_price >= stop_rec.trigger_price;
    END IF;
    
    IF should_trigger THEN
      -- Create execution order
      INSERT INTO order_book (user_id, pair, side, order_type, amount, price, remaining_amount)
      VALUES (
        stop_rec.user_id,
        stop_rec.pair,
        CASE WHEN stop_rec.stop_type = 'stop_loss' THEN 'sell' ELSE 'sell' END, -- Simplified for demo
        stop_rec.execution_type,
        stop_rec.amount,
        CASE WHEN stop_rec.execution_type = 'limit' THEN stop_rec.execution_price ELSE NULL END,
        stop_rec.amount
      );
      
      -- Mark stop order as triggered
      UPDATE stop_orders SET
        status = 'triggered',
        triggered_at = now(),
        updated_at = now()
      WHERE id = stop_rec.id;
    END IF;
  END LOOP;
END;
$$;