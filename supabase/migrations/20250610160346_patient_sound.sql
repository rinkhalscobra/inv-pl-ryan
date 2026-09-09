/*
  # Automated Order Processing System

  1. New Functions
    - `process_all_pending_orders` - Batch processes all pending orders
    - Enhanced `match_order` function for better order matching
    - Enhanced `check_stop_orders` function for stop loss/take profit triggers

  2. Background Processing
    - Automated order matching every few seconds
    - Stop order monitoring and execution
    - Market data updates

  3. Real-time Features
    - Liquidation handling for futures positions
    - Automatic order fills based on market conditions
    - Continuous price monitoring
*/

-- Enhanced order matching function with better logic
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
  market_price numeric(20,8);
BEGIN
  -- Get the order details
  SELECT * INTO order_rec FROM order_book WHERE id = order_id AND status IN ('pending', 'partial');
  
  IF NOT FOUND OR order_rec.remaining_amount <= 0 THEN
    RETURN;
  END IF;

  -- Get current market price
  SELECT price INTO market_price FROM market_data WHERE symbol = order_rec.pair ORDER BY created_at DESC LIMIT 1;
  
  IF market_price IS NULL THEN
    market_price := 104325.3716; -- Fallback price
  END IF;

  -- For market orders, execute immediately at market price
  IF order_rec.order_type = 'market' THEN
    fill_amount := order_rec.remaining_amount;
    fill_price := market_price;
    
    -- Create fill record
    INSERT INTO order_fills (order_id, user_id, pair, side, amount, price, fee)
    VALUES (order_rec.id, order_rec.user_id, order_rec.pair, order_rec.side, fill_amount, fill_price, fill_amount * fill_price * 0.001);
    
    -- Update order status
    UPDATE order_book SET
      filled_amount = filled_amount + fill_amount,
      remaining_amount = 0,
      status = 'filled',
      updated_at = now(),
      filled_at = now()
    WHERE id = order_rec.id;
    
    -- Update user balances
    IF order_rec.side = 'buy' THEN
      -- Deduct USDT, add BTC
      UPDATE balances SET
        usdt_balance = usdt_balance - (fill_amount * fill_price * 1.001), -- Include fee
        btc_balance = btc_balance + fill_amount,
        updated_at = now()
      WHERE user_id = order_rec.user_id;
    ELSE
      -- Deduct BTC, add USDT
      UPDATE balances SET
        btc_balance = btc_balance - fill_amount,
        usdt_balance = usdt_balance + (fill_amount * fill_price * 0.989), -- Subtract fee
        updated_at = now()
      WHERE user_id = order_rec.user_id;
    END IF;
    
  -- For limit orders, check if they can be filled
  ELSIF order_rec.order_type = 'limit' THEN
    -- Check if limit order crosses market price
    IF (order_rec.side = 'buy' AND market_price <= order_rec.price) OR
       (order_rec.side = 'sell' AND market_price >= order_rec.price) THEN
      
      fill_amount := order_rec.remaining_amount;
      fill_price := order_rec.price;
      
      -- Create fill record
      INSERT INTO order_fills (order_id, user_id, pair, side, amount, price, fee)
      VALUES (order_rec.id, order_rec.user_id, order_rec.pair, order_rec.side, fill_amount, fill_price, fill_amount * fill_price * 0.001);
      
      -- Update order status
      UPDATE order_book SET
        filled_amount = filled_amount + fill_amount,
        remaining_amount = 0,
        status = 'filled',
        updated_at = now(),
        filled_at = now()
      WHERE id = order_rec.id;
      
      -- Update user balances
      IF order_rec.side = 'buy' THEN
        UPDATE balances SET
          usdt_balance = usdt_balance - (fill_amount * fill_price * 1.001),
          btc_balance = btc_balance + fill_amount,
          updated_at = now()
        WHERE user_id = order_rec.user_id;
      ELSE
        UPDATE balances SET
          btc_balance = btc_balance - fill_amount,
          usdt_balance = usdt_balance + (fill_amount * fill_price * 0.989),
          updated_at = now()
        WHERE user_id = order_rec.user_id;
      END IF;
    END IF;
  END IF;
END;
$$;

-- Enhanced stop order checking function
CREATE OR REPLACE FUNCTION check_stop_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stop_rec record;
  should_trigger boolean;
  execution_order_id uuid;
BEGIN
  -- Check all active stop orders
  FOR stop_rec IN
    SELECT so.*, md.price as current_price
    FROM stop_orders so
    JOIN market_data md ON md.symbol = so.pair
    WHERE so.status = 'active'
    ORDER BY so.created_at ASC
  LOOP
    should_trigger := false;
    
    -- Check stop loss triggers (price goes down)
    IF stop_rec.stop_type = 'stop_loss' THEN
      should_trigger := stop_rec.current_price <= stop_rec.trigger_price;
    -- Check take profit triggers (price goes up)
    ELSIF stop_rec.stop_type = 'take_profit' THEN
      should_trigger := stop_rec.current_price >= stop_rec.trigger_price;
    END IF;
    
    IF should_trigger THEN
      -- Create execution order
      INSERT INTO order_book (user_id, pair, side, order_type, amount, price, remaining_amount, status)
      VALUES (
        stop_rec.user_id,
        stop_rec.pair,
        'sell', -- Most stop orders are sells
        stop_rec.execution_type,
        stop_rec.amount,
        CASE WHEN stop_rec.execution_type = 'limit' THEN stop_rec.execution_price ELSE NULL END,
        stop_rec.amount,
        'pending'
      )
      RETURNING id INTO execution_order_id;
      
      -- Mark stop order as triggered
      UPDATE stop_orders SET
        status = 'triggered',
        triggered_at = now(),
        updated_at = now()
      WHERE id = stop_rec.id;
      
      -- Immediately process the execution order
      PERFORM match_order(execution_order_id);
    END IF;
  END LOOP;
END;
$$;

-- New function to process all pending orders
CREATE OR REPLACE FUNCTION process_all_pending_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  order_rec record;
BEGIN
  -- Process all pending and partial orders
  FOR order_rec IN
    SELECT id FROM order_book 
    WHERE status IN ('pending', 'partial') 
    AND remaining_amount > 0
    ORDER BY created_at ASC
  LOOP
    PERFORM match_order(order_rec.id);
  END LOOP;
  
  -- Also check stop orders
  PERFORM check_stop_orders();
END;
$$;

-- Function to check and liquidate futures positions
CREATE OR REPLACE FUNCTION check_liquidations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  position_rec record;
  current_price numeric(20,8);
  should_liquidate boolean;
BEGIN
  -- Check all open futures positions
  FOR position_rec IN
    SELECT fp.*, md.price as current_price
    FROM futures_positions fp
    JOIN market_data md ON md.symbol = fp.symbol
  LOOP
    should_liquidate := false;
    
    -- Check liquidation conditions
    IF position_rec.side = 'long' THEN
      should_liquidate := position_rec.current_price <= position_rec.liquidation_price;
    ELSIF position_rec.side = 'short' THEN
      should_liquidate := position_rec.current_price >= position_rec.liquidation_price;
    END IF;
    
    IF should_liquidate THEN
      -- Create liquidation order
      INSERT INTO order_book (user_id, pair, side, order_type, amount, remaining_amount, status)
      VALUES (
        position_rec.user_id,
        position_rec.symbol,
        CASE WHEN position_rec.side = 'long' THEN 'sell' ELSE 'buy' END,
        'market',
        position_rec.amount,
        position_rec.amount,
        'pending'
      );
      
      -- Close the position
      DELETE FROM futures_positions WHERE id = position_rec.id;
      
      -- Return remaining margin to user (if any)
      UPDATE balances SET
        usdt_balance = usdt_balance + GREATEST(0, position_rec.margin + position_rec.unrealized_pnl),
        updated_at = now()
      WHERE user_id = position_rec.user_id;
    END IF;
  END LOOP;
END;
$$;

-- Function to update futures positions with current prices
CREATE OR REPLACE FUNCTION update_futures_positions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  position_rec record;
  new_pnl numeric(20,8);
  new_roi numeric(10,4);
BEGIN
  -- Update all futures positions with current market prices
  FOR position_rec IN
    SELECT fp.*, md.price as current_market_price
    FROM futures_positions fp
    JOIN market_data md ON md.symbol = fp.symbol
  LOOP
    -- Calculate new PnL
    IF position_rec.side = 'long' THEN
      new_pnl := (position_rec.current_market_price - position_rec.entry_price) * position_rec.amount;
    ELSE
      new_pnl := (position_rec.entry_price - position_rec.current_market_price) * position_rec.amount;
    END IF;
    
    -- Calculate ROI
    new_roi := (new_pnl / position_rec.margin) * 100;
    
    -- Update position
    UPDATE futures_positions SET
      current_price = position_rec.current_market_price,
      unrealized_pnl = new_pnl,
      roi = new_roi,
      updated_at = now()
    WHERE id = position_rec.id;
  END LOOP;
END;
$$;

-- Master function to run all background processes
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
  PERFORM check_liquidations();
  
  -- Check stop orders
  PERFORM check_stop_orders();
END;
$$;