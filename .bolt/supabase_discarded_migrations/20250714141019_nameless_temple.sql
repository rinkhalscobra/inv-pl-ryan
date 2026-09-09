/*
  # Create Prop Firm Challenge Tables

  1. New Tables
    - `prop_positions` - Stores positions for prop firm challenges
    - `prop_orders` - Stores orders for prop firm challenges
    - `prop_position_history` - Stores closed position history for prop firm challenges
    - `prop_account_balances` - Stores account balances for prop firm challenges
    - `prop_logs` - Stores logs for prop firm challenges

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
    - Add policies for service role to manage all data
*/

-- Create prop_positions table
CREATE TABLE IF NOT EXISTS prop_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  challenge_id text NOT NULL,
  symbol text NOT NULL DEFAULT 'BTCUSDT',
  entry_price numeric(20,8) NOT NULL,
  current_price numeric(20,8) NOT NULL,
  amount numeric(20,8) NOT NULL,
  leverage integer NOT NULL DEFAULT 1,
  margin_type text NOT NULL DEFAULT 'isolated',
  side text NOT NULL,
  liquidation_price numeric(20,8) NOT NULL,
  unrealized_pnl numeric(20,8) DEFAULT 0.00000000,
  margin numeric(20,8) NOT NULL,
  roi numeric(10,4) DEFAULT 0.0000,
  is_open boolean DEFAULT true,
  position_size numeric(20,8),
  tp_price numeric(20,8),
  sl_price numeric(20,8),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT prop_positions_side_check CHECK (side IN ('long', 'short')),
  CONSTRAINT prop_positions_margin_type_check CHECK (margin_type IN ('isolated', 'cross'))
);

-- Create prop_orders table
CREATE TABLE IF NOT EXISTS prop_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  challenge_id text NOT NULL,
  symbol text NOT NULL DEFAULT 'BTCUSDT',
  type text NOT NULL,
  side text NOT NULL,
  price numeric(20,8),
  amount numeric(20,8) NOT NULL,
  leverage integer NOT NULL DEFAULT 1,
  margin_type text NOT NULL DEFAULT 'isolated',
  status text NOT NULL DEFAULT 'open',
  tp_price numeric(20,8),
  sl_price numeric(20,8),
  created_at timestamptz DEFAULT now(),
  filled_at timestamptz,
  position_id uuid REFERENCES prop_positions(id) ON DELETE SET NULL,
  CONSTRAINT prop_orders_type_check CHECK (type IN ('limit', 'market', 'stop')),
  CONSTRAINT prop_orders_side_check CHECK (side IN ('buy', 'sell')),
  CONSTRAINT prop_orders_status_check CHECK (status IN ('open', 'filled', 'cancelled')),
  CONSTRAINT prop_orders_margin_type_check CHECK (margin_type IN ('isolated', 'cross'))
);

-- Create prop_position_history table
CREATE TABLE IF NOT EXISTS prop_position_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  challenge_id text NOT NULL,
  symbol text NOT NULL,
  side text NOT NULL,
  entry_price numeric(20,8) NOT NULL,
  exit_price numeric(20,8) NOT NULL,
  amount numeric(20,8) NOT NULL,
  leverage integer NOT NULL,
  margin numeric(20,8) NOT NULL,
  pnl numeric(20,8) NOT NULL,
  roi numeric(10,4) NOT NULL,
  open_time timestamptz NOT NULL,
  close_time timestamptz DEFAULT now(),
  duration_seconds integer,
  CONSTRAINT prop_position_history_side_check CHECK (side IN ('long', 'short'))
);

-- Create prop_account_balances table
CREATE TABLE IF NOT EXISTS prop_account_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  challenge_id text NOT NULL,
  starting_balance numeric(20,8) NOT NULL,
  current_balance numeric(20,8) NOT NULL,
  max_balance numeric(20,8) NOT NULL DEFAULT 0,
  max_drawdown numeric(20,8) NOT NULL,
  max_drawdown_reached numeric(20,8) DEFAULT 0,
  target_profit numeric(20,8) NOT NULL,
  daily_loss_limit numeric(20,8),
  weekly_loss_limit numeric(20,8),
  start_date timestamptz DEFAULT now(),
  end_date timestamptz,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT prop_account_balances_status_check CHECK (status IN ('active', 'completed', 'failed'))
);

-- Create prop_logs table
CREATE TABLE IF NOT EXISTS prop_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  challenge_id text NOT NULL,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE prop_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prop_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE prop_position_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE prop_account_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE prop_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for prop_positions
CREATE POLICY "Admins can manage all prop positions" 
  ON prop_positions
  FOR ALL
  TO authenticated
  USING (check_admin_role(uid()))
  WITH CHECK (check_admin_role(uid()));

CREATE POLICY "Service role can manage all prop positions" 
  ON prop_positions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can manage own prop positions" 
  ON prop_positions
  FOR ALL
  TO authenticated
  USING (uid() = user_id)
  WITH CHECK (uid() = user_id);

-- Create policies for prop_orders
CREATE POLICY "Admins can manage all prop orders" 
  ON prop_orders
  FOR ALL
  TO authenticated
  USING (check_admin_role(uid()))
  WITH CHECK (check_admin_role(uid()));

CREATE POLICY "Service role can manage all prop orders" 
  ON prop_orders
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can manage own prop orders" 
  ON prop_orders
  FOR ALL
  TO authenticated
  USING (uid() = user_id)
  WITH CHECK (uid() = user_id);

-- Create policies for prop_position_history
CREATE POLICY "Admins can view all prop position history" 
  ON prop_position_history
  FOR SELECT
  TO authenticated
  USING (check_admin_role(uid()));

CREATE POLICY "Service role can manage all prop position history" 
  ON prop_position_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can view own prop position history" 
  ON prop_position_history
  FOR SELECT
  TO authenticated
  USING (uid() = user_id);

-- Create policies for prop_account_balances
CREATE POLICY "Admins can manage all prop account balances" 
  ON prop_account_balances
  FOR ALL
  TO authenticated
  USING (check_admin_role(uid()))
  WITH CHECK (check_admin_role(uid()));

CREATE POLICY "Service role can manage all prop account balances" 
  ON prop_account_balances
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can manage own prop account balances" 
  ON prop_account_balances
  FOR ALL
  TO authenticated
  USING (uid() = user_id)
  WITH CHECK (uid() = user_id);

-- Create policies for prop_logs
CREATE POLICY "Admins can view all prop logs" 
  ON prop_logs
  FOR SELECT
  TO authenticated
  USING (check_admin_role(uid()));

CREATE POLICY "Service role can manage all prop logs" 
  ON prop_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can view own prop logs" 
  ON prop_logs
  FOR SELECT
  TO authenticated
  USING (uid() = user_id);

-- Create triggers to check if user exists
CREATE OR REPLACE FUNCTION check_user_exists()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id) THEN
    RAISE EXCEPTION 'User with ID % does not exist', NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_user_exists_prop_positions
BEFORE INSERT OR UPDATE ON prop_positions
FOR EACH ROW
EXECUTE FUNCTION check_user_exists();

CREATE TRIGGER check_user_exists_prop_orders
BEFORE INSERT OR UPDATE ON prop_orders
FOR EACH ROW
EXECUTE FUNCTION check_user_exists();

CREATE TRIGGER check_user_exists_prop_account_balances
BEFORE INSERT OR UPDATE ON prop_account_balances
FOR EACH ROW
EXECUTE FUNCTION check_user_exists();

CREATE TRIGGER check_user_exists_prop_logs
BEFORE INSERT OR UPDATE ON prop_logs
FOR EACH ROW
EXECUTE FUNCTION check_user_exists();

-- Create function to initialize a prop challenge
CREATE OR REPLACE FUNCTION initialize_prop_challenge(
  p_user_id uuid,
  p_challenge_id text,
  p_starting_balance numeric,
  p_target_profit numeric,
  p_max_drawdown numeric,
  p_duration_days integer
)
RETURNS boolean AS $$
DECLARE
  v_end_date timestamptz;
BEGIN
  -- Calculate end date
  v_end_date := now() + (p_duration_days || ' days')::interval;
  
  -- Create account balance record
  INSERT INTO prop_account_balances (
    user_id,
    challenge_id,
    starting_balance,
    current_balance,
    max_balance,
    max_drawdown,
    target_profit,
    start_date,
    end_date,
    status
  ) VALUES (
    p_user_id,
    p_challenge_id,
    p_starting_balance,
    p_starting_balance,
    p_starting_balance,
    p_max_drawdown,
    p_target_profit,
    now(),
    v_end_date,
    'active'
  );
  
  -- Log the initialization
  INSERT INTO prop_logs (
    user_id,
    challenge_id,
    action,
    details
  ) VALUES (
    p_user_id,
    p_challenge_id,
    'challenge_initialized',
    jsonb_build_object(
      'starting_balance', p_starting_balance,
      'target_profit', p_target_profit,
      'max_drawdown', p_max_drawdown,
      'duration_days', p_duration_days,
      'end_date', v_end_date
    )
  );
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Create function to cancel a prop challenge
CREATE OR REPLACE FUNCTION cancel_prop_challenge(
  p_user_id uuid,
  p_challenge_id text
)
RETURNS boolean AS $$
DECLARE
  v_account_id uuid;
  v_current_balance numeric;
BEGIN
  -- Get the account ID and current balance
  SELECT id, current_balance INTO v_account_id, v_current_balance
  FROM prop_account_balances
  WHERE user_id = p_user_id
    AND challenge_id = p_challenge_id
    AND status = 'active';
    
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active challenge found for user % with challenge ID %', p_user_id, p_challenge_id;
  END IF;
  
  -- Close all open positions
  UPDATE prop_positions
  SET is_open = false,
      updated_at = now()
  WHERE user_id = p_user_id
    AND challenge_id = p_challenge_id
    AND is_open = true;
    
  -- Cancel all open orders
  UPDATE prop_orders
  SET status = 'cancelled'
  WHERE user_id = p_user_id
    AND challenge_id = p_challenge_id
    AND status = 'open';
    
  -- Update account status
  UPDATE prop_account_balances
  SET status = 'failed',
      updated_at = now()
  WHERE id = v_account_id;
  
  -- Log the cancellation
  INSERT INTO prop_logs (
    user_id,
    challenge_id,
    action,
    details
  ) VALUES (
    p_user_id,
    p_challenge_id,
    'challenge_cancelled',
    jsonb_build_object(
      'account_id', v_account_id,
      'final_balance', v_current_balance
    )
  );
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Create function to run prop background processes
CREATE OR REPLACE FUNCTION run_prop_background_processes()
RETURNS boolean AS $$
BEGIN
  -- Update prop position prices
  PERFORM update_prop_position_prices();
  
  -- Process prop orders
  PERFORM process_prop_orders();
  
  -- Check stop orders
  PERFORM check_prop_stop_orders();
  
  -- Update account balances
  PERFORM update_prop_account_balances();
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Create function to update prop position prices
CREATE OR REPLACE FUNCTION update_prop_position_prices()
RETURNS boolean AS $$
DECLARE
  v_position record;
  v_current_price numeric;
  v_unrealized_pnl numeric;
  v_roi numeric;
BEGIN
  -- Loop through all open positions
  FOR v_position IN
    SELECT p.id, p.symbol, p.side, p.entry_price, p.amount, p.leverage, p.margin
    FROM prop_positions p
    WHERE p.is_open = true
  LOOP
    -- Get current price from market_data
    SELECT price INTO v_current_price
    FROM market_data
    WHERE symbol = v_position.symbol
    ORDER BY timestamp DESC
    LIMIT 1;
    
    IF NOT FOUND THEN
      -- Skip if no price data available
      CONTINUE;
    END IF;
    
    -- Calculate unrealized PnL
    IF v_position.side = 'long' THEN
      v_unrealized_pnl := (v_current_price - v_position.entry_price) * v_position.amount * v_position.leverage;
    ELSE
      v_unrealized_pnl := (v_position.entry_price - v_current_price) * v_position.amount * v_position.leverage;
    END IF;
    
    -- Calculate ROI
    IF v_position.margin > 0 THEN
      v_roi := (v_unrealized_pnl / v_position.margin) * 100;
    ELSE
      v_roi := 0;
    END IF;
    
    -- Update position
    UPDATE prop_positions
    SET current_price = v_current_price,
        unrealized_pnl = v_unrealized_pnl,
        roi = v_roi,
        updated_at = now()
    WHERE id = v_position.id;
  END LOOP;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Create function to process prop orders
CREATE OR REPLACE FUNCTION process_prop_orders()
RETURNS boolean AS $$
DECLARE
  v_order record;
  v_current_price numeric;
  v_position_id uuid;
  v_notional_value numeric;
  v_margin numeric;
  v_liquidation_price numeric;
  v_account_balance record;
  v_maintenance_margin_rate numeric := 0.05; -- 5% maintenance margin
BEGIN
  -- Process market orders first
  FOR v_order IN
    SELECT o.id, o.user_id, o.challenge_id, o.symbol, o.side, o.price, o.amount, o.leverage, o.margin_type, o.tp_price, o.sl_price
    FROM prop_orders o
    WHERE o.status = 'open'
      AND o.type = 'market'
  LOOP
    -- Get current price from market_data
    SELECT price INTO v_current_price
    FROM market_data
    WHERE symbol = v_order.symbol
    ORDER BY timestamp DESC
    LIMIT 1;
    
    IF NOT FOUND THEN
      -- Skip if no price data available
      CONTINUE;
    END IF;
    
    -- Get account balance
    SELECT current_balance INTO v_account_balance
    FROM prop_account_balances
    WHERE user_id = v_order.user_id
      AND challenge_id = v_order.challenge_id
      AND status = 'active';
      
    IF NOT FOUND THEN
      -- Skip if no active challenge
      CONTINUE;
    END IF;
    
    -- Calculate position details
    v_notional_value := v_order.amount * v_current_price;
    v_margin := v_notional_value / v_order.leverage;
    
    -- Calculate liquidation price
    IF v_order.side = 'buy' THEN
      -- Long position
      v_liquidation_price := v_current_price * (1 - (1 / v_order.leverage) + v_maintenance_margin_rate);
    ELSE
      -- Short position
      v_liquidation_price := v_current_price * (1 + (1 / v_order.leverage) - v_maintenance_margin_rate);
    END IF;
    
    -- Create position
    INSERT INTO prop_positions (
      user_id,
      challenge_id,
      symbol,
      entry_price,
      current_price,
      amount,
      leverage,
      margin_type,
      side,
      liquidation_price,
      margin,
      position_size,
      tp_price,
      sl_price
    ) VALUES (
      v_order.user_id,
      v_order.challenge_id,
      v_order.symbol,
      v_current_price,
      v_current_price,
      v_order.amount,
      v_order.leverage,
      v_order.margin_type,
      CASE WHEN v_order.side = 'buy' THEN 'long' ELSE 'short' END,
      v_liquidation_price,
      v_margin,
      v_notional_value,
      v_order.tp_price,
      v_order.sl_price
    )
    RETURNING id INTO v_position_id;
    
    -- Update order status
    UPDATE prop_orders
    SET status = 'filled',
        filled_at = now(),
        position_id = v_position_id
    WHERE id = v_order.id;
    
    -- Log the execution
    INSERT INTO prop_logs (
      user_id,
      challenge_id,
      action,
      details
    ) VALUES (
      v_order.user_id,
      v_order.challenge_id,
      'order_executed',
      jsonb_build_object(
        'order_id', v_order.id,
        'position_id', v_position_id,
        'symbol', v_order.symbol,
        'side', v_order.side,
        'amount', v_order.amount,
        'price', v_current_price,
        'leverage', v_order.leverage
      )
    );
  END LOOP;
  
  -- Process limit orders
  FOR v_order IN
    SELECT o.id, o.user_id, o.challenge_id, o.symbol, o.side, o.price, o.amount, o.leverage, o.margin_type, o.tp_price, o.sl_price
    FROM prop_orders o
    WHERE o.status = 'open'
      AND o.type = 'limit'
      AND o.price IS NOT NULL
  LOOP
    -- Get current price from market_data
    SELECT price INTO v_current_price
    FROM market_data
    WHERE symbol = v_order.symbol
    ORDER BY timestamp DESC
    LIMIT 1;
    
    IF NOT FOUND THEN
      -- Skip if no price data available
      CONTINUE;
    END IF;
    
    -- Check if limit order should be executed
    IF (v_order.side = 'buy' AND v_current_price <= v_order.price) OR
       (v_order.side = 'sell' AND v_current_price >= v_order.price) THEN
      
      -- Get account balance
      SELECT current_balance INTO v_account_balance
      FROM prop_account_balances
      WHERE user_id = v_order.user_id
        AND challenge_id = v_order.challenge_id
        AND status = 'active';
        
      IF NOT FOUND THEN
        -- Skip if no active challenge
        CONTINUE;
      END IF;
      
      -- Calculate position details
      v_notional_value := v_order.amount * v_order.price;
      v_margin := v_notional_value / v_order.leverage;
      
      -- Calculate liquidation price
      IF v_order.side = 'buy' THEN
        -- Long position
        v_liquidation_price := v_order.price * (1 - (1 / v_order.leverage) + v_maintenance_margin_rate);
      ELSE
        -- Short position
        v_liquidation_price := v_order.price * (1 + (1 / v_order.leverage) - v_maintenance_margin_rate);
      END IF;
      
      -- Create position
      INSERT INTO prop_positions (
        user_id,
        challenge_id,
        symbol,
        entry_price,
        current_price,
        amount,
        leverage,
        margin_type,
        side,
        liquidation_price,
        margin,
        position_size,
        tp_price,
        sl_price
      ) VALUES (
        v_order.user_id,
        v_order.challenge_id,
        v_order.symbol,
        v_order.price,
        v_current_price,
        v_order.amount,
        v_order.leverage,
        v_order.margin_type,
        CASE WHEN v_order.side = 'buy' THEN 'long' ELSE 'short' END,
        v_liquidation_price,
        v_margin,
        v_notional_value,
        v_order.tp_price,
        v_order.sl_price
      )
      RETURNING id INTO v_position_id;
      
      -- Update order status
      UPDATE prop_orders
      SET status = 'filled',
          filled_at = now(),
          position_id = v_position_id
      WHERE id = v_order.id;
      
      -- Log the execution
      INSERT INTO prop_logs (
        user_id,
        challenge_id,
        action,
        details
      ) VALUES (
        v_order.user_id,
        v_order.challenge_id,
        'limit_order_executed',
        jsonb_build_object(
          'order_id', v_order.id,
          'position_id', v_position_id,
          'symbol', v_order.symbol,
          'side', v_order.side,
          'amount', v_order.amount,
          'price', v_order.price,
          'current_price', v_current_price,
          'leverage', v_order.leverage
        )
      );
    END IF;
  END LOOP;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Create function to check prop stop orders
CREATE OR REPLACE FUNCTION check_prop_stop_orders()
RETURNS boolean AS $$
DECLARE
  v_position record;
  v_current_price numeric;
BEGIN
  -- Loop through all open positions with stop loss or take profit
  FOR v_position IN
    SELECT p.id, p.user_id, p.challenge_id, p.symbol, p.side, p.current_price, p.tp_price, p.sl_price
    FROM prop_positions p
    WHERE p.is_open = true
      AND (p.tp_price IS NOT NULL OR p.sl_price IS NOT NULL)
  LOOP
    -- Get current price from market_data
    SELECT price INTO v_current_price
    FROM market_data
    WHERE symbol = v_position.symbol
    ORDER BY timestamp DESC
    LIMIT 1;
    
    IF NOT FOUND THEN
      -- Skip if no price data available
      CONTINUE;
    END IF;
    
    -- Check if stop loss triggered
    IF v_position.sl_price IS NOT NULL AND (
       (v_position.side = 'long' AND v_current_price <= v_position.sl_price) OR
       (v_position.side = 'short' AND v_current_price >= v_position.sl_price)
    ) THEN
      -- Close position at stop loss price
      PERFORM close_prop_position(v_position.id, v_position.sl_price);
      
      -- Log the stop loss
      INSERT INTO prop_logs (
        user_id,
        challenge_id,
        action,
        details
      ) VALUES (
        v_position.user_id,
        v_position.challenge_id,
        'stop_loss_triggered',
        jsonb_build_object(
          'position_id', v_position.id,
          'symbol', v_position.symbol,
          'side', v_position.side,
          'stop_price', v_position.sl_price,
          'current_price', v_current_price
        )
      );
      
      CONTINUE; -- Skip take profit check
    END IF;
    
    -- Check if take profit triggered
    IF v_position.tp_price IS NOT NULL AND (
       (v_position.side = 'long' AND v_current_price >= v_position.tp_price) OR
       (v_position.side = 'short' AND v_current_price <= v_position.tp_price)
    ) THEN
      -- Close position at take profit price
      PERFORM close_prop_position(v_position.id, v_position.tp_price);
      
      -- Log the take profit
      INSERT INTO prop_logs (
        user_id,
        challenge_id,
        action,
        details
      ) VALUES (
        v_position.user_id,
        v_position.challenge_id,
        'take_profit_triggered',
        jsonb_build_object(
          'position_id', v_position.id,
          'symbol', v_position.symbol,
          'side', v_position.side,
          'take_profit_price', v_position.tp_price,
          'current_price', v_current_price
        )
      );
    END IF;
  END LOOP;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Create function to close a prop position
CREATE OR REPLACE FUNCTION close_prop_position(
  position_id uuid,
  exit_price numeric DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
  v_position record;
  v_current_price numeric;
  v_pnl numeric;
  v_roi numeric;
  v_duration_seconds integer;
BEGIN
  -- Get position details
  SELECT p.*, a.current_balance
  INTO v_position
  FROM prop_positions p
  JOIN prop_account_balances a ON p.user_id = a.user_id AND p.challenge_id = a.challenge_id
  WHERE p.id = position_id
    AND p.is_open = true
    AND a.status = 'active';
    
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Position not found or already closed';
  END IF;
  
  -- Get current price if not provided
  IF exit_price IS NULL THEN
    SELECT price INTO v_current_price
    FROM market_data
    WHERE symbol = v_position.symbol
    ORDER BY timestamp DESC
    LIMIT 1;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No price data available for %', v_position.symbol;
    END IF;
  ELSE
    v_current_price := exit_price;
  END IF;
  
  -- Calculate PnL
  IF v_position.side = 'long' THEN
    v_pnl := (v_current_price - v_position.entry_price) * v_position.amount * v_position.leverage;
  ELSE
    v_pnl := (v_position.entry_price - v_current_price) * v_position.amount * v_position.leverage;
  END IF;
  
  -- Calculate ROI
  IF v_position.margin > 0 THEN
    v_roi := (v_pnl / v_position.margin) * 100;
  ELSE
    v_roi := 0;
  END IF;
  
  -- Calculate duration in seconds
  v_duration_seconds := EXTRACT(EPOCH FROM (now() - v_position.created_at));
  
  -- Add to position history
  INSERT INTO prop_position_history (
    user_id,
    challenge_id,
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
    v_position.user_id,
    v_position.challenge_id,
    v_position.symbol,
    v_position.side,
    v_position.entry_price,
    v_current_price,
    v_position.amount,
    v_position.leverage,
    v_position.margin,
    v_pnl,
    v_roi,
    v_position.created_at,
    now(),
    v_duration_seconds
  );
  
  -- Update account balance
  UPDATE prop_account_balances
  SET current_balance = current_balance + v_pnl,
      updated_at = now()
  WHERE user_id = v_position.user_id
    AND challenge_id = v_position.challenge_id
    AND status = 'active';
    
  -- Close position
  UPDATE prop_positions
  SET is_open = false,
      current_price = v_current_price,
      unrealized_pnl = v_pnl,
      roi = v_roi,
      updated_at = now()
  WHERE id = position_id;
  
  -- Log the position close
  INSERT INTO prop_logs (
    user_id,
    challenge_id,
    action,
    details
  ) VALUES (
    v_position.user_id,
    v_position.challenge_id,
    'position_closed',
    jsonb_build_object(
      'position_id', position_id,
      'symbol', v_position.symbol,
      'side', v_position.side,
      'entry_price', v_position.entry_price,
      'exit_price', v_current_price,
      'pnl', v_pnl,
      'roi', v_roi
    )
  );
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Create function to update prop account balances
CREATE OR REPLACE FUNCTION update_prop_account_balances()
RETURNS boolean AS $$
DECLARE
  v_account record;
  v_total_pnl numeric;
  v_new_balance numeric;
BEGIN
  -- Loop through all active accounts
  FOR v_account IN
    SELECT a.id, a.user_id, a.challenge_id, a.current_balance, a.starting_balance, a.max_balance, a.max_drawdown, a.max_drawdown_reached
    FROM prop_account_balances a
    WHERE a.status = 'active'
  LOOP
    -- Calculate total unrealized PnL
    SELECT COALESCE(SUM(unrealized_pnl), 0) INTO v_total_pnl
    FROM prop_positions
    WHERE user_id = v_account.user_id
      AND challenge_id = v_account.challenge_id
      AND is_open = true;
      
    -- Calculate new balance
    v_new_balance := v_account.current_balance;
    
    -- Update max balance if needed
    IF v_new_balance > v_account.max_balance THEN
      UPDATE prop_account_balances
      SET max_balance = v_new_balance,
          updated_at = now()
      WHERE id = v_account.id;
    END IF;
    
    -- Calculate current drawdown
    IF v_new_balance < v_account.starting_balance THEN
      -- Update max drawdown reached if needed
      IF (v_account.starting_balance - v_new_balance) > v_account.max_drawdown_reached THEN
        UPDATE prop_account_balances
        SET max_drawdown_reached = v_account.starting_balance - v_new_balance,
            updated_at = now()
        WHERE id = v_account.id;
      END IF;
    END IF;
  END LOOP;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Create function to check and execute a specific prop order
CREATE OR REPLACE FUNCTION check_and_execute_prop_order(order_id uuid)
RETURNS boolean AS $$
DECLARE
  v_order record;
  v_current_price numeric;
  v_should_execute boolean := false;
BEGIN
  -- Get order details
  SELECT o.* INTO v_order
  FROM prop_orders o
  WHERE o.id = order_id
    AND o.status = 'open';
    
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or already executed';
  END IF;
  
  -- Get current price
  SELECT price INTO v_current_price
  FROM market_data
  WHERE symbol = v_order.symbol
  ORDER BY timestamp DESC
  LIMIT 1;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No price data available for %', v_order.symbol;
  END IF;
  
  -- Check if order should be executed
  IF v_order.type = 'limit' THEN
    -- For buy orders: execute when current price <= limit price
    -- For sell orders: execute when current price >= limit price
    v_should_execute := (v_order.side = 'buy' AND v_current_price <= v_order.price) OR
                        (v_order.side = 'sell' AND v_current_price >= v_order.price);
  ELSIF v_order.type = 'stop' THEN
    -- For buy stop orders: execute when current price >= stop price
    -- For sell stop orders: execute when current price <= stop price
    v_should_execute := (v_order.side = 'buy' AND v_current_price >= v_order.price) OR
                        (v_order.side = 'sell' AND v_current_price <= v_order.price);
  ELSIF v_order.type = 'market' THEN
    -- Market orders should always execute
    v_should_execute := true;
  END IF;
  
  -- Execute order if conditions are met
  IF v_should_execute THEN
    -- Call process_prop_orders to execute all eligible orders
    PERFORM process_prop_orders();
    
    -- Check if our specific order was executed
    RETURN NOT EXISTS (
      SELECT 1
      FROM prop_orders
      WHERE id = order_id
        AND status = 'open'
    );
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_prop_positions_user_id ON prop_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_prop_positions_challenge_id ON prop_positions(challenge_id);
CREATE INDEX IF NOT EXISTS idx_prop_positions_is_open ON prop_positions(is_open);
CREATE INDEX IF NOT EXISTS idx_prop_positions_symbol ON prop_positions(symbol);

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
CREATE INDEX IF NOT EXISTS idx_prop_logs_created_at ON prop_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prop_logs_action ON prop_logs(action);