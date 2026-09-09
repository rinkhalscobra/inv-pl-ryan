/*
  # Enhanced Futures Trading System

  1. Schema Updates
    - Update futures_positions table with additional fields for better tracking
    - Add constraints and indexes for improved performance
    - Add support for stop loss and take profit functionality
    - Add support for position history tracking

  2. Functions
    - Add functions for position management
    - Add functions for PnL calculation
    - Add functions for liquidation handling
*/

-- Enhance futures_positions table with additional fields
DO $$
BEGIN
  -- Add tp_price column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'futures_positions' AND column_name = 'tp_price'
  ) THEN
    ALTER TABLE futures_positions ADD COLUMN tp_price numeric(20,8);
  END IF;

  -- Add sl_price column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'futures_positions' AND column_name = 'sl_price'
  ) THEN
    ALTER TABLE futures_positions ADD COLUMN sl_price numeric(20,8);
  END IF;

  -- Add is_open column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'futures_positions' AND column_name = 'is_open'
  ) THEN
    ALTER TABLE futures_positions ADD COLUMN is_open boolean DEFAULT true;
  END IF;

  -- Add position_size column if it doesn't exist (notional value)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'futures_positions' AND column_name = 'position_size'
  ) THEN
    ALTER TABLE futures_positions ADD COLUMN position_size numeric(20,8);
  END IF;
END $$;

-- Create futures_orders table if it doesn't exist
CREATE TABLE IF NOT EXISTS futures_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  symbol text NOT NULL DEFAULT 'BTCUSDT',
  type text NOT NULL CHECK (type IN ('limit', 'market', 'stop')),
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  price numeric(20,8),
  amount numeric(20,8) NOT NULL,
  leverage integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'cancelled')),
  tp_price numeric(20,8),
  sl_price numeric(20,8),
  created_at timestamptz DEFAULT now(),
  filled_at timestamptz,
  position_id uuid REFERENCES futures_positions(id) ON DELETE SET NULL
);

-- Create futures_position_history table for closed positions
CREATE TABLE IF NOT EXISTS futures_position_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_futures_orders_user_id ON futures_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_futures_orders_status ON futures_orders(status);
CREATE INDEX IF NOT EXISTS idx_futures_position_history_user_id ON futures_position_history(user_id);
CREATE INDEX IF NOT EXISTS idx_futures_position_history_close_time ON futures_position_history(close_time DESC);

-- Enable RLS on new tables
ALTER TABLE futures_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE futures_position_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for futures_orders
CREATE POLICY "Users can manage own futures orders"
  ON futures_orders
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create RLS policies for futures_position_history
CREATE POLICY "Users can view own position history"
  ON futures_position_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create function to close a futures position
CREATE OR REPLACE FUNCTION close_futures_position(
  position_id uuid,
  exit_price numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pos record;
  pnl numeric(20,8);
  roi numeric(10,4);
  duration interval;
  history_id uuid;
BEGIN
  -- Get position details
  SELECT * INTO pos FROM futures_positions WHERE id = position_id AND is_open = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Position not found or already closed';
  END IF;
  
  -- Calculate PnL
  IF pos.side = 'long' THEN
    pnl := (exit_price - pos.entry_price) * pos.amount;
  ELSE
    pnl := (pos.entry_price - exit_price) * pos.amount;
  END IF;
  
  -- Calculate ROI
  roi := (pnl / pos.margin) * 100;
  
  -- Calculate duration
  duration := now() - pos.created_at;
  
  -- Insert into history
  INSERT INTO futures_position_history (
    user_id,
    symbol,
    side,
    entry_price,
    exit_price,
    amount,
    leverage,
    margin,
    pnl,
    roi,
    open_time,
    close_time,
    duration_seconds
  ) VALUES (
    pos.user_id,
    pos.symbol,
    pos.side,
    pos.entry_price,
    exit_price,
    pos.amount,
    pos.leverage,
    pos.margin,
    pnl,
    roi,
    pos.created_at,
    now(),
    EXTRACT(EPOCH FROM duration)::integer
  ) RETURNING id INTO history_id;
  
  -- Return margin + PnL to user's balance
  UPDATE balances
  SET usdt_balance = usdt_balance + (pos.margin + pnl)
  WHERE user_id = pos.user_id;
  
  -- Delete the position
  DELETE FROM futures_positions WHERE id = position_id;
  
  -- Return the history record ID
  RETURN history_id;
END;
$$;

-- Create function to update a position's entry price (for manual adjustments)
CREATE OR REPLACE FUNCTION update_position_entry_price(
  position_id uuid,
  new_entry_price numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE futures_positions
  SET 
    entry_price = new_entry_price,
    updated_at = now()
  WHERE id = position_id;
END;
$$;

-- Create function to check for liquidations
CREATE OR REPLACE FUNCTION check_futures_liquidations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pos record;
  current_price numeric(20,8);
  should_liquidate boolean;
  pnl numeric(20,8);
  roi numeric(10,4);
BEGIN
  -- Check all open positions
  FOR pos IN
    SELECT fp.*, md.price as market_price
    FROM futures_positions fp
    JOIN market_data md ON md.symbol = fp.symbol
    WHERE fp.is_open = true
  LOOP
    should_liquidate := false;
    current_price := pos.market_price;
    
    -- Calculate current PnL
    IF pos.side = 'long' THEN
      pnl := (current_price - pos.entry_price) * pos.amount;
      should_liquidate := current_price <= pos.liquidation_price;
    ELSE
      pnl := (pos.entry_price - current_price) * pos.amount;
      should_liquidate := current_price >= pos.liquidation_price;
    END IF;
    
    -- Calculate ROI
    roi := (pnl / pos.margin) * 100;
    
    -- Update position with current values
    UPDATE futures_positions
    SET 
      current_price = current_price,
      unrealized_pnl = pnl,
      roi = roi,
      updated_at = now()
    WHERE id = pos.id;
    
    -- Check for liquidation
    IF should_liquidate THEN
      -- Record the liquidation in history
      INSERT INTO futures_position_history (
        user_id,
        symbol,
        side,
        entry_price,
        exit_price,
        amount,
        leverage,
        margin,
        pnl,
        roi,
        open_time,
        close_time,
        duration_seconds
      ) VALUES (
        pos.user_id,
        pos.symbol,
        pos.side,
        pos.entry_price,
        current_price,
        pos.amount,
        pos.leverage,
        pos.margin,
        -pos.margin, -- Full loss on liquidation
        -100, -- -100% ROI
        pos.created_at,
        now(),
        EXTRACT(EPOCH FROM (now() - pos.created_at))::integer
      );
      
      -- Delete the liquidated position
      DELETE FROM futures_positions WHERE id = pos.id;
      
      -- No balance returned on liquidation
    END IF;
    
    -- Check for stop loss / take profit
    IF pos.is_open AND pos.sl_price IS NOT NULL THEN
      IF (pos.side = 'long' AND current_price <= pos.sl_price) OR
         (pos.side = 'short' AND current_price >= pos.sl_price) THEN
        -- Close position at stop loss
        PERFORM close_futures_position(pos.id, current_price);
      END IF;
    END IF;
    
    IF pos.is_open AND pos.tp_price IS NOT NULL THEN
      IF (pos.side = 'long' AND current_price >= pos.tp_price) OR
         (pos.side = 'short' AND current_price <= pos.tp_price) THEN
        -- Close position at take profit
        PERFORM close_futures_position(pos.id, current_price);
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- Add this function to the background processing
CREATE OR REPLACE FUNCTION run_background_processes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Process all pending orders
  PERFORM process_all_pending_orders();
  
  -- Update futures positions
  PERFORM update_futures_positions();
  
  -- Check for liquidations
  PERFORM check_futures_liquidations();
  
  -- Check for liquidations in futures
  PERFORM check_futures_liquidations();
  
  -- Check stop orders
  PERFORM check_stop_orders();
END;
$$;