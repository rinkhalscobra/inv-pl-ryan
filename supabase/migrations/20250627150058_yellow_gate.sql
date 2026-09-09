-- Function to process prop orders
CREATE OR REPLACE FUNCTION process_prop_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  order_rec record;
  position_details_rec record;
  current_price numeric(20,8);
  v_position_id uuid;
  margin numeric(20,8);
  liquidation_price numeric(20,8);
  pnl numeric(20,8);
  roi numeric(10,4);
  user_balance numeric(20,8);
  challenge_balance numeric(20,8);
  latest_prices record;
BEGIN
  -- Process all open prop orders with the latest market prices
  FOR order_rec IN
    SELECT po.*, latest.price as market_price
    FROM prop_orders po
    JOIN (
      -- Get the latest price for each symbol using a subquery
      SELECT md.symbol, md.price
      FROM market_data md
      INNER JOIN (
        SELECT symbol, MAX(timestamp) as max_timestamp
        FROM market_data
        GROUP BY symbol
      ) latest_ts ON md.symbol = latest_ts.symbol AND md.timestamp = latest_ts.max_timestamp
    ) latest ON po.symbol = latest.symbol
    WHERE po.status = 'open'
    ORDER BY po.created_at ASC
  LOOP
    current_price := order_rec.market_price;
    
    -- Log the order details for debugging
    RAISE NOTICE 'Processing prop order: id=%, type=%, side=%, symbol=%', 
      order_rec.id, order_rec.type, order_rec.side, order_rec.symbol;
    
    -- Skip if market price is not available
    IF current_price IS NULL OR current_price <= 0 THEN
      CONTINUE;
    END IF;
    
    -- Get challenge account balance
    SELECT current_balance INTO challenge_balance
    FROM prop_account_balances
    WHERE user_id = order_rec.user_id AND challenge_id = order_rec.challenge_id;
    
    IF NOT FOUND OR challenge_balance IS NULL THEN
      -- Log error and skip
      INSERT INTO prop_logs (user_id, challenge_id, action, details)
      VALUES (
        order_rec.user_id,
        order_rec.challenge_id,
        'order_error',
        jsonb_build_object(
          'error', 'Challenge account balance not found',
          'order_id', order_rec.id
        )
      );
      CONTINUE;
    END IF;
    
    -- Process based on order type
    CASE
      -- Market orders - execute immediately
      WHEN order_rec.type = 'market' THEN
        -- Calculate required margin
        margin := (order_rec.amount * current_price) / order_rec.leverage;
        
        -- Check if enough balance
        IF margin > challenge_balance THEN
          -- Cancel order due to insufficient balance
          UPDATE prop_orders
          SET status = 'cancelled'
          WHERE id = order_rec.id;
          
          -- Log cancellation
          INSERT INTO prop_logs (user_id, challenge_id, action, details)
          VALUES (
            order_rec.user_id,
            order_rec.challenge_id,
            'order_cancelled',
            jsonb_build_object(
              'reason', 'Insufficient balance',
              'required_margin', margin,
              'available_balance', challenge_balance,
              'order_id', order_rec.id
            )
          );
          
          CONTINUE;
        END IF;
        
        -- Calculate liquidation price
        IF order_rec.side = 'buy' THEN -- Long position
          liquidation_price := current_price * (1 - (1 / order_rec.leverage) * 0.95);
        ELSE -- Short position
          liquidation_price := current_price * (1 + (1 / order_rec.leverage) * 0.95);
        END IF;
        
        -- Deduct margin from challenge balance
        UPDATE prop_account_balances
        SET 
          current_balance = current_balance - margin,
          updated_at = now()
        WHERE user_id = order_rec.user_id AND challenge_id = order_rec.challenge_id;
        
        -- Create prop position
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
          unrealized_pnl,
          margin,
          roi,
          is_open,
          position_size,
          tp_price,
          sl_price
        ) VALUES (
          order_rec.user_id,
          order_rec.challenge_id,
          order_rec.symbol,
          current_price,
          current_price,
          order_rec.amount,
          order_rec.leverage,
          order_rec.margin_type,
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
        RETURNING id INTO v_position_id;
        
        -- Update order status and link to position
        UPDATE prop_orders
        SET 
          status = 'filled',
          filled_at = now(),
          position_id = v_position_id
        WHERE id = order_rec.id;
        
        -- Log the execution
        INSERT INTO prop_logs (user_id, challenge_id, action, details)
        VALUES (
          order_rec.user_id,
          order_rec.challenge_id,
          'order_executed',
          jsonb_build_object(
            'order_id', order_rec.id,
            'position_id', v_position_id,
            'symbol', order_rec.symbol,
            'side', CASE WHEN order_rec.side = 'buy' THEN 'long' ELSE 'short' END,
            'amount', order_rec.amount,
            'price', current_price,
            'margin', margin,
            'leverage', order_rec.leverage,
            'order_type', order_rec.type
          )
        );
      
      -- Limit orders - execute if price conditions are met
      WHEN order_rec.type = 'limit' THEN
        -- Check if limit price conditions are met
        IF (order_rec.side = 'buy' AND current_price <= order_rec.price) OR
           (order_rec.side = 'sell' AND current_price >= order_rec.price) THEN
          
          -- Calculate required margin
          margin := (order_rec.amount * order_rec.price) / order_rec.leverage;
          
          -- Check if enough balance
          IF margin > challenge_balance THEN
            -- Cancel order due to insufficient balance
            UPDATE prop_orders
            SET status = 'cancelled'
            WHERE id = order_rec.id;
            
            -- Log cancellation
            INSERT INTO prop_logs (user_id, challenge_id, action, details)
            VALUES (
              order_rec.user_id,
              order_rec.challenge_id,
              'order_cancelled',
              jsonb_build_object(
                'reason', 'Insufficient balance',
                'required_margin', margin,
                'available_balance', challenge_balance,
                'order_id', order_rec.id
              )
            );
            
            CONTINUE;
          END IF;
          
          -- Calculate liquidation price
          IF order_rec.side = 'buy' THEN -- Long position
            liquidation_price := order_rec.price * (1 - (1 / order_rec.leverage) * 0.95);
          ELSE -- Short position
            liquidation_price := order_rec.price * (1 + (1 / order_rec.leverage) * 0.95);
          END IF;
          
          -- Deduct margin from challenge balance
          UPDATE prop_account_balances
          SET 
            current_balance = current_balance - margin,
            updated_at = now()
          WHERE user_id = order_rec.user_id AND challenge_id = order_rec.challenge_id;
          
          -- Create prop position
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
            unrealized_pnl,
            margin,
            roi,
            is_open,
            position_size,
            tp_price,
            sl_price
          ) VALUES (
            order_rec.user_id,
            order_rec.challenge_id,
            order_rec.symbol,
            order_rec.price, -- Use limit price as entry price
            current_price,
            order_rec.amount,
            order_rec.leverage,
            order_rec.margin_type,
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
          RETURNING id INTO v_position_id;
          
          -- Update order status and link to position
          UPDATE prop_orders
          SET 
            status = 'filled',
            filled_at = now(),
            position_id = v_position_id
          WHERE id = order_rec.id;
          
          -- Log the execution
          INSERT INTO prop_logs (user_id, challenge_id, action, details)
          VALUES (
            order_rec.user_id,
            order_rec.challenge_id,
            'limit_order_executed',
            jsonb_build_object(
              'order_id', order_rec.id,
              'position_id', v_position_id,
              'symbol', order_rec.symbol,
              'side', CASE WHEN order_rec.side = 'buy' THEN 'long' ELSE 'short' END,
              'amount', order_rec.amount,
              'price', order_rec.price,
              'margin', margin,
              'leverage', order_rec.leverage,
              'order_type', order_rec.type
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
            -- Get position details
            SELECT * INTO position_details_rec 
            FROM prop_positions 
            WHERE id = order_rec.position_id;
            
            IF FOUND THEN
              -- Calculate PnL
              IF position_details_rec.side = 'long' THEN
                pnl := (current_price - position_details_rec.entry_price) * position_details_rec.amount * position_details_rec.leverage;
              ELSE
                pnl := (position_details_rec.entry_price - current_price) * position_details_rec.amount * position_details_rec.leverage;
              END IF;
              
              -- Calculate ROI
              roi := (pnl / position_details_rec.margin) * 100;
              
              -- Insert into position history
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
                position_details_rec.user_id,
                position_details_rec.challenge_id,
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
              
              -- Return margin + PnL to challenge balance
              UPDATE prop_account_balances
              SET 
                current_balance = current_balance + (position_details_rec.margin + pnl),
                -- Update max_balance if current balance is higher
                max_balance = GREATEST(max_balance, current_balance + (position_details_rec.margin + pnl)),
                updated_at = now()
              WHERE 
                user_id = position_details_rec.user_id AND 
                challenge_id = position_details_rec.challenge_id;
              
              -- Delete the position
              DELETE FROM prop_positions WHERE id = order_rec.position_id;
              
              -- Log the position close
              INSERT INTO prop_logs (user_id, challenge_id, action, details)
              VALUES (
                position_details_rec.user_id,
                position_details_rec.challenge_id,
                'position_closed',
                jsonb_build_object(
                  'position_id', position_details_rec.id,
                  'symbol', position_details_rec.symbol,
                  'side', position_details_rec.side,
                  'entry_price', position_details_rec.entry_price,
                  'exit_price', current_price,
                  'pnl', pnl,
                  'roi', roi
                )
              );
            END IF;
          ELSE
            -- This is a stop order for opening a new position
            -- Calculate required margin
            margin := (order_rec.amount * current_price) / order_rec.leverage;
            
            -- Check if enough balance
            IF margin > challenge_balance THEN
              -- Cancel order due to insufficient balance
              UPDATE prop_orders
              SET status = 'cancelled'
              WHERE id = order_rec.id;
              
              -- Log cancellation
              INSERT INTO prop_logs (user_id, challenge_id, action, details)
              VALUES (
                order_rec.user_id,
                order_rec.challenge_id,
                'order_cancelled',
                jsonb_build_object(
                  'reason', 'Insufficient balance',
                  'required_margin', margin,
                  'available_balance', challenge_balance,
                  'order_id', order_rec.id
                )
              );
              
              CONTINUE;
            END IF;
            
            -- Calculate liquidation price
            IF order_rec.side = 'buy' THEN -- Long position
              liquidation_price := current_price * (1 - (1 / order_rec.leverage) * 0.95);
            ELSE -- Short position
              liquidation_price := current_price * (1 + (1 / order_rec.leverage) * 0.95);
            END IF;
            
            -- Deduct margin from challenge balance
            UPDATE prop_account_balances
            SET 
              current_balance = current_balance - margin,
              updated_at = now()
            WHERE user_id = order_rec.user_id AND challenge_id = order_rec.challenge_id;
            
            -- Create prop position
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
              unrealized_pnl,
              margin,
              roi,
              is_open,
              position_size,
              tp_price,
              sl_price
            ) VALUES (
              order_rec.user_id,
              order_rec.challenge_id,
              order_rec.symbol,
              current_price,
              current_price,
              order_rec.amount,
              order_rec.leverage,
              order_rec.margin_type,
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
            RETURNING id INTO v_position_id;
            
            -- Log the execution
            INSERT INTO prop_logs (user_id, challenge_id, action, details)
            VALUES (
              order_rec.user_id,
              order_rec.challenge_id,
              'stop_order_executed',
              jsonb_build_object(
                'order_id', order_rec.id,
                'position_id', v_position_id,
                'symbol', order_rec.symbol,
                'side', CASE WHEN order_rec.side = 'buy' THEN 'long' ELSE 'short' END,
                'amount', order_rec.amount,
                'price', current_price,
                'margin', margin,
                'leverage', order_rec.leverage,
                'order_type', order_rec.type
              )
            );
          END IF;
          
          -- Update order status
          UPDATE prop_orders
          SET 
            status = 'filled',
            filled_at = now(),
            position_id = v_position_id
          WHERE id = order_rec.id;
        END IF;
    END CASE;
  END LOOP;
END;
$$;