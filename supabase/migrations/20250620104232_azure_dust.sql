/*
  # Process Futures Orders Function

  1. New Functions
    - `process_futures_orders` - Processes pending futures orders
    - Integration with `run_background_processes` to automatically execute futures orders

  2. Features
    - Market order execution
    - Limit order execution when price conditions are met
    - Stop order handling
    - Position creation and management
    - Balance adjustments
    - Transaction recording
*/

-- Create function to process futures orders
CREATE OR REPLACE FUNCTION process_futures_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  order_rec record;
  current_price numeric(20,8);
  position_id uuid;
  margin numeric(20,8);
  liquidation_price numeric(20,8);
  pnl numeric(20,8);
  roi numeric(10,4);
BEGIN
  -- Process all open futures orders
  FOR order_rec IN
    SELECT fo.*, md.price as market_price
    FROM futures_orders fo
    JOIN market_data md ON md.symbol = fo.symbol
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
        END IF;
      
      -- Stop orders - check if trigger price is reached
      WHEN order_rec.type = 'stop' THEN
        -- For buy stop orders, trigger when price rises above trigger price
        -- For sell stop orders, trigger when price falls below trigger price
        IF (order_rec.side = 'buy' AND current_price >= order_rec.price) OR
           (order_rec.side = 'sell' AND current_price <= order_rec.price) THEN
          
          -- If this is a stop order for closing a position
          IF order_rec.position_id IS NOT NULL THEN
            -- Get position details
            SELECT * INTO order_rec FROM futures_positions WHERE id = order_rec.position_id;
            
            IF FOUND THEN
              -- Calculate PnL
              IF order_rec.side = 'long' THEN
                pnl := (current_price - order_rec.entry_price) * order_rec.amount;
              ELSE
                pnl := (order_rec.entry_price - current_price) * order_rec.amount;
              END IF;
              
              -- Calculate ROI
              roi := (pnl / order_rec.margin) * 100;
              
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
                order_rec.user_id,
                order_rec.symbol,
                order_rec.side,
                order_rec.entry_price,
                current_price,
                order_rec.amount,
                order_rec.leverage,
                order_rec.margin,
                pnl,
                roi,
                order_rec.created_at,
                now(),
                EXTRACT(EPOCH FROM (now() - order_rec.created_at))::integer
              );
              
              -- Return margin + PnL to user's balance
              UPDATE balances
              SET usdt_balance = usdt_balance + (order_rec.margin + pnl),
                  updated_at = now()
              WHERE user_id = order_rec.user_id;
              
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
                order_rec.user_id,
                'trade',
                pnl,
                'Closed ' || order_rec.side || ' position for ' || order_rec.symbol || ' with ' || 
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

-- Update run_background_processes to include process_futures_orders
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
END;
$$;

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
    pnl := (exit_price - pos.entry_price) * pos.amount * pos.leverage;
  ELSE
    pnl := (pos.entry_price - exit_price) * pos.amount * pos.leverage;
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
  SET usdt_balance = usdt_balance + (pos.margin + pnl),
      updated_at = now()
  WHERE user_id = pos.user_id;
  
  -- Add transaction record
  INSERT INTO transactions (
    user_id,
    type,
    amount,
    description,
    status
  ) VALUES (
    pos.user_id,
    'trade',
    pnl,
    'Closed ' || pos.side || ' position for ' || pos.symbol || ' with ' || 
      CASE WHEN pnl >= 0 THEN 'profit' ELSE 'loss' END || ' of ' || ABS(pnl) || ' USDT',
    'completed'
  );
  
  -- Delete the position
  DELETE FROM futures_positions WHERE id = position_id;
  
  -- Return the history record ID
  RETURN history_id;
END;
$$;