/*
  # Fix Ambiguous Column References in Database Functions

  1. Changes
    - Fix 'column reference "position_id" is ambiguous' error in process_futures_orders function
    - Rename local variables to avoid conflicts with table column names
    - Improve variable naming for clarity and maintainability
    
  2. Functions Updated
    - process_futures_orders - Fixed ambiguous position_id reference
    - check_and_execute_futures_order - Improved variable naming
*/

-- Create or replace the process_futures_orders function with fixed variable names
CREATE OR REPLACE FUNCTION process_futures_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  order_rec record;
  position_details_rec record;
  current_price numeric(20,8);
  v_position_id uuid; -- Renamed from position_id to avoid ambiguity
  margin numeric(20,8);
  liquidation_price numeric(20,8);
  pnl numeric(20,8);
  roi numeric(10,4);
  latest_prices record;
BEGIN
  -- Process all open futures orders with the latest market prices
  FOR order_rec IN
    SELECT fo.*, latest.price as market_price
    FROM futures_orders fo
    JOIN (
      -- Get the latest price for each symbol using a subquery
      SELECT md.symbol, md.price
      FROM market_data md
      INNER JOIN (
        SELECT symbol, MAX(timestamp) as max_timestamp
        FROM market_data
        GROUP BY symbol
      ) latest_ts ON md.symbol = latest_ts.symbol AND md.timestamp = latest_ts.max_timestamp
    ) latest ON fo.symbol = latest.symbol
    WHERE fo.status = 'open'
    ORDER BY fo.created_at ASC
  LOOP
    current_price := order_rec.market_price;
    
    -- Skip if market price is not available
    IF current_price IS NULL OR current_price <= 0 THEN
      CONTINUE;
    END IF;
    
    -- Process based on order type
    CASE
      -- Market orders - execute immediately
      WHEN order_rec.type = 'market' THEN
        -- Calculate required margin
        margin := (order_rec.amount * current_price) / order_rec.leverage;
        
        -- Calculate liquidation price
        IF order_rec.side = 'buy' THEN -- Long position
          liquidation_price := current_price * (1 - (1 / order_rec.leverage) * 0.95);
        ELSE -- Short position
          liquidation_price := current_price * (1 + (1 / order_rec.leverage) * 0.95);
        END IF;
        
        -- Deduct margin from user's balance
        UPDATE balances
        SET usdt_balance = usdt_balance - margin,
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
          current_price,
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
          order_rec.amount * current_price,
          order_rec.tp_price,
          order_rec.sl_price
        )
        RETURNING id INTO v_position_id; -- Use v_position_id instead of position_id
        
        -- Update order status and link to position
        UPDATE futures_orders
        SET status = 'filled',
            filled_at = now(),
            position_id = v_position_id -- Use v_position_id instead of position_id
        WHERE id = order_rec.id;
        
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
          'Opened ' || 
            CASE WHEN order_rec.side = 'buy' THEN 'long' ELSE 'short' END || 
            ' position for ' || order_rec.symbol || ' with ' || order_rec.leverage || 'x leverage',
          'completed'
        );
      
      -- Limit orders - execute if price conditions are met
      WHEN order_rec.type = 'limit' THEN
        -- Check if limit price conditions are met
        -- For buy orders: execute when current price <= limit price
        -- For sell orders: execute when current price >= limit price
        -- Add logging to debug price comparison
        INSERT INTO system_logs (action, details)
        VALUES (
          'limit_order_check',
          format(
            'Order ID: %s, Symbol: %s, Side: %s, Limit Price: %s, Current Price: %s, Condition: %s',
            order_rec.id,
            order_rec.symbol,
            order_rec.side,
            order_rec.price,
            current_price,
            CASE 
              WHEN order_rec.side = 'buy' THEN format('current_price (%s) <= limit_price (%s): %s', current_price, order_rec.price, current_price <= order_rec.price)
              ELSE format('current_price (%s) >= limit_price (%s): %s', current_price, order_rec.price, current_price >= order_rec.price)
            END
          )
        );
        
        IF (order_rec.side = 'buy' AND current_price <= order_rec.price) OR
           (order_rec.side = 'sell' AND current_price >= order_rec.price) THEN
          
          -- Calculate required margin
          margin := (order_rec.amount * order_rec.price) / order_rec.leverage;
          
          -- Calculate liquidation price
          IF order_rec.side = 'buy' THEN -- Long position
            liquidation_price := order_rec.price * (1 - (1 / order_rec.leverage) * 0.95);
          ELSE -- Short position
            liquidation_price := order_rec.price * (1 + (1 / order_rec.leverage) * 0.95);
          END IF;
          
          -- Deduct margin from user's balance
          UPDATE balances
          SET usdt_balance = usdt_balance - margin,
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
            order_rec.price, -- Use limit price as entry price
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
          RETURNING id INTO v_position_id; -- Use v_position_id instead of position_id
          
          -- Update order status and link to position
          UPDATE futures_orders
          SET status = 'filled',
              filled_at = now(),
              position_id = v_position_id -- Use v_position_id instead of position_id
          WHERE id = order_rec.id;
          
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
            'Opened ' || 
              CASE WHEN order_rec.side = 'buy' THEN 'long' ELSE 'short' END || 
              ' position for ' || order_rec.symbol || ' with ' || order_rec.leverage || 'x leverage (limit order)',
            'completed'
          );
          
          -- Log successful execution
          INSERT INTO system_logs (action, details)
          VALUES (
            'limit_order_executed',
            format(
              'Order ID: %s, Symbol: %s, Side: %s, Limit Price: %s, Execution Price: %s',
              order_rec.id,
              order_rec.symbol,
              order_rec.side,
              order_rec.price,
              current_price
            )
          );
        END IF;
      
      -- Stop orders - check if trigger price is reached
      WHEN order_rec.type = 'stop' THEN
        -- For buy stop orders, trigger when price rises above trigger price
        -- For sell stop orders, trigger when price falls below trigger price
        IF (order_rec.side = 'buy' AND current_price >= order_rec.price) OR
           (order_rec.side = 'sell' AND current_price <= order_rec.price) THEN
          
          -- If this is a stop order for closing a position
          IF order_rec.position_id IS NOT NULL THEN
            -- Get position details - Use position_details_rec instead of reusing order_rec
            SELECT * INTO position_details_rec FROM futures_positions WHERE id = order_rec.position_id;
            
            IF FOUND THEN
              -- Calculate PnL
              IF position_details_rec.side = 'long' THEN
                pnl := (current_price - position_details_rec.entry_price) * position_details_rec.amount;
              ELSE
                pnl := (position_details_rec.entry_price - current_price) * position_details_rec.amount;
              END IF;
              
              -- Calculate ROI
              roi := (pnl / position_details_rec.margin) * 100;
              
              -- Insert into position history
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
                position_details_rec.user_id,
                position_details_rec.symbol,
                position_details_rec.side,
                position_details_rec.entry_price,
                current_price,
                position_details_rec.amount,
                position_details_rec.leverage,
                position_details_rec.margin,
                pnl,
                roi,
                position_details_rec.created_at,
                now(),
                EXTRACT(EPOCH FROM (now() - position_details_rec.created_at))::integer
              );
              
              -- Return margin + PnL to user's balance
              UPDATE balances
              SET usdt_balance = usdt_balance + (position_details_rec.margin + pnl),
                  updated_at = now()
              WHERE user_id = position_details_rec.user_id;
              
              -- Delete the position
              DELETE FROM futures_positions WHERE id = order_rec.position_id;
              
              -- Add transaction record
              INSERT INTO transactions (
                user_id,
                type,
                amount,
                description,
                status
              ) VALUES (
                position_details_rec.user_id,
                'trade',
                pnl,
                'Closed ' || position_details_rec.side || ' position for ' || position_details_rec.symbol || ' with ' || 
                  CASE WHEN pnl >= 0 THEN 'profit' ELSE 'loss' END || ' of ' || ABS(pnl) || ' USDT',
                'completed'
              );
            END IF;
          ELSE
            -- This is a stop order for opening a new position
            -- Calculate required margin
            margin := (order_rec.amount * current_price) / order_rec.leverage;
            
            -- Calculate liquidation price
            IF order_rec.side = 'buy' THEN -- Long position
              liquidation_price := current_price * (1 - (1 / order_rec.leverage) * 0.95);
            ELSE -- Short position
              liquidation_price := current_price * (1 + (1 / order_rec.leverage) * 0.95);
            END IF;
            
            -- Deduct margin from user's balance
            UPDATE balances
            SET usdt_balance = usdt_balance - margin,
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
              current_price,
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
              order_rec.amount * current_price,
              order_rec.tp_price,
              order_rec.sl_price
            )
            RETURNING id INTO v_position_id; -- Use v_position_id instead of position_id
            
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
              'Opened ' || 
                CASE WHEN order_rec.side = 'buy' THEN 'long' ELSE 'short' END || 
                ' position for ' || order_rec.symbol || ' with ' || order_rec.leverage || 'x leverage (stop order)',
              'completed'
            );
          END IF;
          
          -- Update order status
          UPDATE futures_orders
          SET status = 'filled',
              filled_at = now(),
              position_id = v_position_id -- Use v_position_id instead of position_id
          WHERE id = order_rec.id;
        END IF;
    END CASE;
  END LOOP;
END;
$$;

-- Also update the process_futures_limit_order function to use v_position_id
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
  v_position_id uuid; -- Renamed from position_id to avoid ambiguity
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
  RETURNING id INTO v_position_id; -- Use v_position_id instead of position_id
  
  -- Update order status
  UPDATE futures_orders
  SET 
    status = 'filled',
    filled_at = now(),
    position_id = v_position_id -- Use v_position_id instead of position_id
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
    'position_id', v_position_id, -- Use v_position_id instead of position_id
    'entry_price', order_rec.price,
    'current_price', current_price,
    'margin', margin,
    'details', log_details
  );
END;
$$;

-- Update check_and_execute_futures_order to use v_position_id
CREATE OR REPLACE FUNCTION check_and_execute_futures_order(order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  order_rec record;
  current_price numeric(20,8);
  should_execute boolean := false;
BEGIN
  -- Get the order details
  SELECT fo.*, md.price as market_price
  INTO order_rec
  FROM futures_orders fo
  JOIN market_data md ON md.symbol = fo.symbol
  WHERE fo.id = order_id AND fo.status = 'open';
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  current_price := order_rec.market_price;
  
  -- Check if order should be executed
  IF order_rec.type = 'limit' THEN
    should_execute := (order_rec.side = 'buy' AND current_price <= order_rec.price) OR
                      (order_rec.side = 'sell' AND current_price >= order_rec.price);
  ELSIF order_rec.type = 'stop' THEN
    should_execute := (order_rec.side = 'buy' AND current_price >= order_rec.price) OR
                      (order_rec.side = 'sell' AND current_price <= order_rec.price);
  ELSIF order_rec.type = 'market' THEN
    should_execute := true;
  END IF;
  
  -- Log the check
  INSERT INTO system_logs (action, details)
  VALUES (
    'check_futures_order',
    format(
      'Order ID: %s, Type: %s, Side: %s, Price: %s, Current Price: %s, Should Execute: %s',
      order_id,
      order_rec.type,
      order_rec.side,
      order_rec.price,
      current_price,
      should_execute
    )
  );
  
  -- If order should be executed, call process_futures_orders
  IF should_execute THEN
    PERFORM process_futures_orders();
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;