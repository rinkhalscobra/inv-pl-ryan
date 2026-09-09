/*
  # Add Transaction Management Functions

  1. New Functions
    - Functions to help with transaction management in Edge Functions
    - Advisory lock function for concurrency control
    
  2. Purpose
    - Enable atomic operations in Edge Functions
    - Prevent race conditions during order execution
    - Improve reliability of limit order processing
*/

-- Function to execute a transaction with advisory lock
CREATE OR REPLACE FUNCTION execute_with_lock(
  lock_key text,
  sql_command text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  -- Acquire advisory lock
  PERFORM pg_advisory_lock(hashtext(lock_key));
  
  BEGIN
    -- Execute the SQL command
    EXECUTE sql_command INTO result;
    
    -- Return success
    RETURN json_build_object('success', true, 'result', result);
  EXCEPTION
    WHEN OTHERS THEN
      -- Return error
      RETURN json_build_object('success', false, 'error', SQLERRM);
  END;
  
  -- Release advisory lock
  PERFORM pg_advisory_unlock(hashtext(lock_key));
END;
$$;

-- Function to process a futures limit order
CREATE OR REPLACE FUNCTION process_futures_limit_order(
  order_id uuid,
  current_price numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  order_rec record;
  user_balance numeric;
  margin numeric;
  liquidation_price numeric;
  position_id uuid;
  log_details text;
BEGIN
  -- Get the order details
  SELECT * INTO order_rec 
  FROM futures_orders 
  WHERE id = order_id 
    AND status = 'open' 
    AND type = 'limit';
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Order not found or not a pending limit order'
    );
  END IF;
  
  -- Check if price conditions are met
  IF (order_rec.side = 'buy' AND current_price > order_rec.price) OR
     (order_rec.side = 'sell' AND current_price < order_rec.price) THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Price conditions not met',
      'current_price', current_price,
      'order_price', order_rec.price,
      'side', order_rec.side
    );
  END IF;
  
  -- Get user balance
  SELECT usdt_balance INTO user_balance
  FROM balances
  WHERE user_id = order_rec.user_id;
  
  -- Calculate required margin
  margin := (order_rec.amount * order_rec.price) / order_rec.leverage;
  
  -- Check if user has enough balance
  IF user_balance < margin THEN
    -- Update order status to cancelled
    UPDATE futures_orders
    SET status = 'cancelled'
    WHERE id = order_id;
    
    -- Log the cancellation
    INSERT INTO system_logs (action, details)
    VALUES (
      'limit_order_cancelled',
      format(
        'Order %s cancelled due to insufficient balance. Required: %s, Available: %s',
        order_id,
        margin,
        user_balance
      )
    );
    
    RETURN json_build_object(
      'success', false, 
      'error', 'Insufficient balance',
      'required_margin', margin,
      'available_balance', user_balance
    );
  END IF;
  
  -- Calculate liquidation price
  IF order_rec.side = 'buy' THEN -- Long position
    liquidation_price := order_rec.price * (1 - (1 / order_rec.leverage) * 0.95);
  ELSE -- Short position
    liquidation_price := order_rec.price * (1 + (1 / order_rec.leverage) * 0.95);
  END IF;
  
  -- Deduct margin from user's balance
  UPDATE balances
  SET 
    usdt_balance = usdt_balance - margin,
    updated_at = now()
  WHERE user_id = order_rec.user_id;
  
  -- Create futures position
  INSERT INTO futures_positions (
    user_id,
    symbol,
    entry_price,
    current_price,
    amount,
    leverage,
    margin_type,
    side,
    liquidation_price,
    unrealized_pnl,
    margin,
    roi,
    is_open,
    position_size,
    tp_price,
    sl_price
  ) VALUES (
    order_rec.user_id,
    order_rec.symbol,
    order_rec.price,
    current_price,
    order_rec.amount,
    order_rec.leverage,
    'isolated', -- Default to isolated margin
    CASE WHEN order_rec.side = 'buy' THEN 'long' ELSE 'short' END,
    liquidation_price,
    0, -- Initial PnL is 0
    margin,
    0, -- Initial ROI is 0
    true,
    order_rec.amount * order_rec.price,
    order_rec.tp_price,
    order_rec.sl_price
  )
  RETURNING id INTO position_id;
  
  -- Update order status
  UPDATE futures_orders
  SET 
    status = 'filled',
    filled_at = now(),
    position_id = position_id
  WHERE id = order_id;
  
  -- Add transaction record
  INSERT INTO transactions (
    user_id,
    type,
    amount,
    description,
    status
  ) VALUES (
    order_rec.user_id,
    'trade',
    -margin,
    format(
      'Opened %s position for %s with %sx leverage at price %s',
      CASE WHEN order_rec.side = 'buy' THEN 'long' ELSE 'short' END,
      order_rec.symbol,
      order_rec.leverage,
      order_rec.price
    ),
    'completed'
  );
  
  -- Log the execution
  log_details := format(
    'Executed limit order %s for %s %s at price %s (current price: %s)',
    order_id,
    order_rec.symbol,
    CASE WHEN order_rec.side = 'buy' THEN 'long' ELSE 'short' END,
    order_rec.price,
    current_price
  );
  
  INSERT INTO system_logs (action, details)
  VALUES ('limit_order_executed', log_details);
  
  RETURN json_build_object(
    'success', true,
    'position_id', position_id,
    'entry_price', order_rec.price,
    'current_price', current_price,
    'margin', margin,
    'details', log_details
  );
END;
$$;

-- Function to check and execute all pending limit orders
CREATE OR REPLACE FUNCTION execute_pending_limit_orders()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  order_rec record;
  market_price numeric;
  result json;
  orders_checked integer := 0;
  orders_executed integer := 0;
  execution_results json[] := '{}';
BEGIN
  -- Get all pending limit orders
  FOR order_rec IN
    SELECT fo.id, fo.symbol, fo.side, fo.price
    FROM futures_orders fo
    WHERE fo.status = 'open'
      AND fo.type = 'limit'
    ORDER BY fo.created_at ASC
  LOOP
    orders_checked := orders_checked + 1;
    
    -- Get latest market price for this symbol
    SELECT md.price INTO market_price
    FROM market_data md
    WHERE md.symbol = order_rec.symbol
      AND md.timestamp > (now() - interval '15 seconds')
    ORDER BY md.timestamp DESC
    LIMIT 1;
    
    -- Skip if no recent price data
    IF market_price IS NULL THEN
      -- Log the skip
      INSERT INTO system_logs (action, details)
      VALUES (
        'limit_order_skipped',
        format(
          'Order %s skipped due to missing recent price data for %s',
          order_rec.id,
          order_rec.symbol
        )
      );
      CONTINUE;
    END IF;
    
    -- Check if price conditions are met
    IF (order_rec.side = 'buy' AND market_price <= order_rec.price) OR
       (order_rec.side = 'sell' AND market_price >= order_rec.price) THEN
      
      -- Process the order
      SELECT process_futures_limit_order(order_rec.id, market_price) INTO result;
      
      -- Track execution
      IF (result->>'success')::boolean THEN
        orders_executed := orders_executed + 1;
        execution_results := execution_results || result;
      END IF;
    END IF;
  END LOOP;
  
  -- Return summary
  RETURN json_build_object(
    'success', true,
    'orders_checked', orders_checked,
    'orders_executed', orders_executed,
    'executions', execution_results
  );
END;
$$;