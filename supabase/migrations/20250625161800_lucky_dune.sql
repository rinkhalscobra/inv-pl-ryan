-- Create or replace the process_futures_orders function with improved market data retrieval
CREATE OR REPLACE FUNCTION process_futures_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  order_rec record;
  position_details_rec record; -- New variable for position details
  current_price numeric(20,8);
  position_id uuid;
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
        RETURNING id INTO position_id;
        
        -- Update order status and link to position
        UPDATE futures_orders
        SET status = 'filled',
            filled_at = now(),
            position_id = position_id
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
          RETURNING id INTO position_id;
          
          -- Update order status and link to position
          UPDATE futures_orders
          SET status = 'filled',
              filled_at = now(),
              position_id = position_id
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
            -- Get position details - FIXED: Use position_details_rec instead of reusing order_rec
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
            RETURNING id INTO position_id;
            
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
              position_id = position_id
          WHERE id = order_rec.id;
        END IF;
    END CASE;
  END LOOP;
END;
$$;

-- Also update the run_background_processes function to ensure it calls process_futures_orders
CREATE OR REPLACE FUNCTION run_background_processes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Process all pending orders
  PERFORM process_all_pending_orders();
  
  -- Process futures orders
  PERFORM process_futures_orders();
  
  -- Update futures positions
  PERFORM update_futures_positions();
  
  -- Check for liquidations
  PERFORM check_futures_liquidations();
  
  -- Check stop orders
  PERFORM check_stop_orders();
  
  -- Log that the background process ran
  INSERT INTO system_logs (action, details)
  VALUES ('run_background_processes', 'Background processes executed at ' || now()::text);
END;
$$;

-- Create a function to manually check and execute a specific futures order
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