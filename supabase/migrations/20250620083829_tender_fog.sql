/*
  # Fix ambiguous current_price column reference

  1. Database Function Updates
    - Update run_background_processes function to properly qualify current_price columns
    - Ensure all column references are unambiguous when joining tables
    - Fix any other functions that might have similar issues

  2. Changes Made
    - Qualify current_price with proper table aliases
    - Update any queries that join futures_positions and event_outcomes tables
    - Ensure consistent naming conventions across all functions
*/

-- Drop and recreate the run_background_processes function with proper column qualification
CREATE OR REPLACE FUNCTION run_background_processes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update futures positions with current market prices
  UPDATE futures_positions fp
  SET 
    current_price = pd.price,
    unrealized_pnl = CASE 
      WHEN fp.side = 'long' THEN (pd.price - fp.entry_price) * fp.amount * fp.leverage
      WHEN fp.side = 'short' THEN (fp.entry_price - pd.price) * fp.amount * fp.leverage
      ELSE 0
    END,
    roi = CASE 
      WHEN fp.margin > 0 THEN 
        CASE 
          WHEN fp.side = 'long' THEN ((pd.price - fp.entry_price) * fp.amount * fp.leverage) / fp.margin * 100
          WHEN fp.side = 'short' THEN ((fp.entry_price - pd.price) * fp.amount * fp.leverage) / fp.margin * 100
          ELSE 0
        END
      ELSE 0
    END,
    updated_at = now()
  FROM price_data pd
  WHERE fp.symbol = pd.symbol 
    AND fp.is_open = true
    AND pd.timestamp = (
      SELECT MAX(timestamp) 
      FROM price_data pd2 
      WHERE pd2.symbol = fp.symbol
    );

  -- Check for liquidations
  UPDATE futures_positions fp
  SET is_open = false, updated_at = now()
  WHERE fp.is_open = true
    AND (
      (fp.side = 'long' AND fp.current_price <= fp.liquidation_price) OR
      (fp.side = 'short' AND fp.current_price >= fp.liquidation_price)
    );

  -- Process pending orders in order book
  WITH matched_orders AS (
    SELECT 
      buy_order.id as buy_id,
      sell_order.id as sell_id,
      LEAST(buy_order.remaining_amount, sell_order.remaining_amount) as match_amount,
      CASE 
        WHEN buy_order.order_type = 'market' THEN sell_order.price
        WHEN sell_order.order_type = 'market' THEN buy_order.price
        ELSE GREATEST(buy_order.price, sell_order.price)
      END as match_price
    FROM order_book buy_order
    JOIN order_book sell_order ON buy_order.pair = sell_order.pair
    WHERE buy_order.side = 'buy' 
      AND sell_order.side = 'sell'
      AND buy_order.status = 'pending'
      AND sell_order.status = 'pending'
      AND buy_order.remaining_amount > 0
      AND sell_order.remaining_amount > 0
      AND (
        (buy_order.order_type = 'market') OR
        (sell_order.order_type = 'market') OR
        (buy_order.price >= sell_order.price)
      )
    ORDER BY 
      CASE WHEN buy_order.order_type = 'market' THEN 0 ELSE 1 END,
      CASE WHEN sell_order.order_type = 'market' THEN 0 ELSE 1 END,
      buy_order.created_at,
      sell_order.created_at
    LIMIT 100
  )
  UPDATE order_book
  SET 
    filled_amount = filled_amount + mo.match_amount,
    remaining_amount = remaining_amount - mo.match_amount,
    status = CASE 
      WHEN remaining_amount - mo.match_amount <= 0 THEN 'filled'
      ELSE 'partial'
    END,
    filled_at = CASE 
      WHEN remaining_amount - mo.match_amount <= 0 THEN now()
      ELSE filled_at
    END,
    updated_at = now()
  FROM matched_orders mo
  WHERE order_book.id IN (mo.buy_id, mo.sell_id);

  -- Check and trigger stop orders
  UPDATE stop_orders so
  SET 
    status = 'triggered',
    triggered_at = now(),
    updated_at = now()
  FROM price_data pd
  WHERE so.pair = REPLACE(pd.symbol, 'USDT', '/USDT')
    AND so.status = 'active'
    AND (
      (so.stop_type = 'stop_loss' AND pd.price <= so.trigger_price) OR
      (so.stop_type = 'take_profit' AND pd.price >= so.trigger_price)
    )
    AND pd.timestamp = (
      SELECT MAX(timestamp) 
      FROM price_data pd2 
      WHERE pd2.symbol = pd.symbol
    );

  -- Update robot trading states
  UPDATE robot_states rs
  SET 
    todays_profit = COALESCE((
      SELECT SUM(t.amount)
      FROM transactions t
      WHERE t.user_id = rs.user_id
        AND t.type = 'robot_profit'
        AND DATE(t.created_at) = CURRENT_DATE
    ), 0),
    updated_at = now()
  WHERE rs.is_active = true;

END;
$$;

-- Also fix any other functions that might have similar issues
CREATE OR REPLACE FUNCTION match_order(order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_order RECORD;
  matching_order RECORD;
  match_amount numeric(20,8);
  match_price numeric(20,8);
BEGIN
  -- Get the target order
  SELECT * INTO target_order
  FROM order_book
  WHERE id = order_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Find matching orders
  FOR matching_order IN
    SELECT *
    FROM order_book
    WHERE pair = target_order.pair
      AND side != target_order.side
      AND status = 'pending'
      AND remaining_amount > 0
      AND (
        (target_order.order_type = 'market') OR
        (order_type = 'market') OR
        (target_order.side = 'buy' AND target_order.price >= price) OR
        (target_order.side = 'sell' AND target_order.price <= price)
      )
    ORDER BY 
      CASE WHEN order_type = 'market' THEN 0 ELSE 1 END,
      CASE WHEN target_order.side = 'buy' THEN price ELSE -price END,
      created_at
  LOOP
    -- Calculate match amount and price
    match_amount := LEAST(target_order.remaining_amount, matching_order.remaining_amount);
    
    match_price := CASE 
      WHEN target_order.order_type = 'market' THEN matching_order.price
      WHEN matching_order.order_type = 'market' THEN target_order.price
      ELSE matching_order.price
    END;

    -- Update both orders
    UPDATE order_book
    SET 
      filled_amount = filled_amount + match_amount,
      remaining_amount = remaining_amount - match_amount,
      status = CASE 
        WHEN remaining_amount - match_amount <= 0 THEN 'filled'
        ELSE 'partial'
      END,
      filled_at = CASE 
        WHEN remaining_amount - match_amount <= 0 THEN now()
        ELSE filled_at
      END,
      updated_at = now()
    WHERE id IN (target_order.id, matching_order.id);

    -- Create order fills
    INSERT INTO order_fills (order_id, user_id, pair, side, amount, price, fee)
    VALUES 
      (target_order.id, target_order.user_id, target_order.pair, target_order.side, match_amount, match_price, 0),
      (matching_order.id, matching_order.user_id, matching_order.pair, matching_order.side, match_amount, match_price, 0);

    -- Update target order remaining amount
    target_order.remaining_amount := target_order.remaining_amount - match_amount;
    
    -- Exit if target order is fully filled
    IF target_order.remaining_amount <= 0 THEN
      EXIT;
    END IF;
  END LOOP;
END;
$$;

-- Fix check_stop_orders function if it exists
CREATE OR REPLACE FUNCTION check_stop_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update stop orders based on current prices
  UPDATE stop_orders so
  SET 
    status = 'triggered',
    triggered_at = now(),
    updated_at = now()
  FROM price_data pd
  WHERE so.pair = REPLACE(pd.symbol, 'USDT', '/USDT')
    AND so.status = 'active'
    AND (
      (so.stop_type = 'stop_loss' AND pd.price <= so.trigger_price) OR
      (so.stop_type = 'take_profit' AND pd.price >= so.trigger_price)
    )
    AND pd.timestamp = (
      SELECT MAX(timestamp) 
      FROM price_data pd2 
      WHERE pd2.symbol = pd.symbol
    );
END;
$$;