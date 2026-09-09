/*
  # Fix Prop Firm Balance Calculation

  1. Changes
     - Fixes the prop firm balance calculation to properly handle margin allocation
     - Updates functions to not count margin as a loss in PnL or drawdown
     - Ensures only actual trading losses/gains affect challenge account's PnL
     - Improves error handling and logging throughout

  2. Functions Modified
     - process_prop_orders: Updated to handle margin allocation correctly
     - update_prop_positions: Improved PnL calculation
     - check_prop_liquidations: Enhanced liquidation handling
     - close_prop_position: Fixed to correctly update account balance
*/

-- First drop existing functions to avoid return type errors
DROP FUNCTION IF EXISTS close_prop_position(uuid, numeric);
DROP FUNCTION IF EXISTS process_prop_orders();
DROP FUNCTION IF EXISTS update_prop_positions();
DROP FUNCTION IF EXISTS check_prop_liquidations();

-- Function to process prop orders with improved balance calculation
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
  error_details text;
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
    -- Log the order being processed
    INSERT INTO prop_logs (user_id, challenge_id, action, details)
    VALUES (
      order_rec.user_id,
      order_rec.challenge_id,
      'processing_order',
      jsonb_build_object(
        'order_id', order_rec.id,
        'type', order_rec.type,
        'side', order_rec.side,
        'symbol', order_rec.symbol,
        'amount', order_rec.amount,
        'price', order_rec.price,
        'market_price', order_rec.market_price
      )
    );
    
    current_price := order_rec.market_price;
    
    -- Skip if market price is not available
    IF current_price IS NULL OR current_price <= 0 THEN
      INSERT INTO prop_logs (user_id, challenge_id, action, details)
      VALUES (
        order_rec.user_id,
        order_rec.challenge_id,
        'order_error',
        jsonb_build_object(
          'error', 'Invalid market price',
          'order_id', order_rec.id,
          'market_price', current_price
        )
      );
      CONTINUE;
    END IF;
    
    -- Get challenge account balance
    BEGIN
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
    EXCEPTION WHEN OTHERS THEN
      error_details := SQLERRM;
      INSERT INTO prop_logs (user_id, challenge_id, action, details)
      VALUES (
        order_rec.user_id,
        order_rec.challenge_id,
        'order_execution_failed',
        jsonb_build_object(
          'error', 'Error fetching challenge balance: ' || error_details,
          'order_id', order_rec.id,
          'sqlstate', SQLSTATE
        )
      );
      CONTINUE;
    END;
    
    -- Process based on order type
    CASE
      -- Market orders - execute immediately
      WHEN order_rec.type = 'market' THEN
        BEGIN
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
                'order_id', order_rec.id,
                'order_type', 'market'
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
              'order_type', 'market'
            )
          );
        EXCEPTION WHEN OTHERS THEN
          error_details := SQLERRM;
          INSERT INTO prop_logs (user_id, challenge_id, action, details)
          VALUES (
            order_rec.user_id,
            order_rec.challenge_id,
            'order_execution_failed',
            jsonb_build_object(
              'error', error_details,
              'order_id', order_rec.id,
              'order_type', 'market',
              'sqlstate', SQLSTATE,
              'symbol', order_rec.symbol,
              'side', order_rec.side,
              'amount', order_rec.amount,
              'price', current_price
            )
          );
        END;
      
      -- Limit orders - execute if price conditions are met
      WHEN order_rec.type = 'limit' THEN
        BEGIN
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
                  'order_id', order_rec.id,
                  'order_type', 'limit'
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
                'order_type', 'limit'
              )
            );
          END IF;
        EXCEPTION WHEN OTHERS THEN
          error_details := SQLERRM;
          INSERT INTO prop_logs (user_id, challenge_id, action, details)
          VALUES (
            order_rec.user_id,
            order_rec.challenge_id,
            'order_execution_failed',
            jsonb_build_object(
              'error', error_details,
              'order_id', order_rec.id,
              'order_type', 'limit',
              'sqlstate', SQLSTATE,
              'symbol', order_rec.symbol,
              'side', order_rec.side,
              'amount', order_rec.amount,
              'price', order_rec.price
            )
          );
        END;
      
      -- Stop orders - check if trigger price is reached
      WHEN order_rec.type = 'stop' THEN
        BEGIN
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
                  current_balance = current_balance + pnl,
                  -- Update max_balance if current balance is higher
                  max_balance = GREATEST(max_balance, current_balance + pnl),
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
                    'roi', roi,
                    'order_type', 'stop'
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
                    'order_id', order_rec.id,
                    'order_type', 'stop'
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
                  'order_type', 'stop'
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
        EXCEPTION WHEN OTHERS THEN
          error_details := SQLERRM;
          INSERT INTO prop_logs (user_id, challenge_id, action, details)
          VALUES (
            order_rec.user_id,
            order_rec.challenge_id,
            'order_execution_failed',
            jsonb_build_object(
              'error', error_details,
              'order_id', order_rec.id,
              'order_type', 'stop',
              'sqlstate', SQLSTATE,
              'symbol', order_rec.symbol,
              'side', order_rec.side,
              'amount', order_rec.amount,
              'price', order_rec.price
            )
          );
        END;
      
      -- Unknown order type
      ELSE
        INSERT INTO prop_logs (user_id, challenge_id, action, details)
        VALUES (
          order_rec.user_id,
          order_rec.challenge_id,
          'order_error',
          jsonb_build_object(
            'error', 'Unknown order type',
            'order_id', order_rec.id,
            'order_type', order_rec.type
          )
        );
    END CASE;
  END LOOP;
  
  -- Log completion of processing
  INSERT INTO prop_logs (
    user_id,
    challenge_id,
    action,
    details
  ) VALUES (
    NULL, -- System user
    'system',
    'prop_orders_processed',
    jsonb_build_object(
      'timestamp', now()::text
    )
  );
EXCEPTION WHEN OTHERS THEN
  -- Log any unexpected errors at the function level
  INSERT INTO prop_logs (
    user_id,
    challenge_id,
    action,
    details
  ) VALUES (
    NULL, -- System user
    'system',
    'prop_orders_process_error',
    jsonb_build_object(
      'error', SQLERRM,
      'sqlstate', SQLSTATE,
      'timestamp', now()::text
    )
  );
END;
$$;

-- Function to update prop positions with current market prices and calculate PnL
CREATE OR REPLACE FUNCTION update_prop_positions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  position_rec record;
  current_price numeric(20,8);
  unrealized_pnl numeric(20,8);
  roi numeric(10,4);
  error_details text;
BEGIN
  -- Get all open positions
  FOR position_rec IN
    SELECT pp.*, md.price as market_price
    FROM prop_positions pp
    JOIN (
      -- Get the latest price for each symbol
      SELECT md.symbol, md.price
      FROM market_data md
      INNER JOIN (
        SELECT symbol, MAX(timestamp) as max_timestamp
        FROM market_data
        GROUP BY symbol
      ) latest ON md.symbol = latest.symbol AND md.timestamp = latest.max_timestamp
    ) md ON pp.symbol = md.symbol
    WHERE pp.is_open = true
  LOOP
    BEGIN
      current_price := position_rec.market_price;
      
      -- Skip if market price is not available
      IF current_price IS NULL OR current_price <= 0 THEN
        CONTINUE;
      END IF;
      
      -- Calculate unrealized PnL
      IF position_rec.side = 'long' THEN
        unrealized_pnl := (current_price - position_rec.entry_price) * position_rec.amount * position_rec.leverage;
      ELSE
        unrealized_pnl := (position_rec.entry_price - current_price) * position_rec.amount * position_rec.leverage;
      END IF;
      
      -- Calculate ROI
      roi := (unrealized_pnl / position_rec.margin) * 100;
      
      -- Update position
      UPDATE prop_positions
      SET 
        current_price = current_price,
        unrealized_pnl = unrealized_pnl,
        roi = roi,
        updated_at = now()
      WHERE id = position_rec.id;
      
    EXCEPTION WHEN OTHERS THEN
      error_details := SQLERRM;
      INSERT INTO prop_logs (
        user_id,
        challenge_id,
        action,
        details
      ) VALUES (
        position_rec.user_id,
        position_rec.challenge_id,
        'position_update_error',
        jsonb_build_object(
          'error', error_details,
          'position_id', position_rec.id,
          'sqlstate', SQLSTATE
        )
      );
    END;
  END LOOP;
  
  -- Log completion
  INSERT INTO prop_logs (
    user_id,
    challenge_id,
    action,
    details
  ) VALUES (
    NULL, -- System user
    'system',
    'positions_updated',
    jsonb_build_object(
      'timestamp', now()::text
    )
  );
EXCEPTION WHEN OTHERS THEN
  -- Log any unexpected errors at the function level
  INSERT INTO prop_logs (
    user_id,
    challenge_id,
    action,
    details
  ) VALUES (
    NULL, -- System user
    'system',
    'position_update_process_error',
    jsonb_build_object(
      'error', SQLERRM,
      'sqlstate', SQLSTATE,
      'timestamp', now()::text
    )
  );
END;
$$;

-- Function to check for liquidations
CREATE OR REPLACE FUNCTION check_prop_liquidations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  position_rec record;
  current_price numeric(20,8);
  pnl numeric(20,8);
  roi numeric(10,4);
  error_details text;
BEGIN
  -- Get all open positions
  FOR position_rec IN
    SELECT pp.*, md.price as market_price
    FROM prop_positions pp
    JOIN (
      -- Get the latest price for each symbol
      SELECT md.symbol, md.price
      FROM market_data md
      INNER JOIN (
        SELECT symbol, MAX(timestamp) as max_timestamp
        FROM market_data
        GROUP BY symbol
      ) latest ON md.symbol = latest.symbol AND md.timestamp = latest.max_timestamp
    ) md ON pp.symbol = md.symbol
    WHERE pp.is_open = true
  LOOP
    BEGIN
      current_price := position_rec.market_price;
      
      -- Skip if market price is not available
      IF current_price IS NULL OR current_price <= 0 THEN
        CONTINUE;
      END IF;
      
      -- Check if position should be liquidated
      IF (position_rec.side = 'long' AND current_price <= position_rec.liquidation_price) OR
         (position_rec.side = 'short' AND current_price >= position_rec.liquidation_price) THEN
        
        -- Calculate PnL (will be negative at liquidation)
        IF position_rec.side = 'long' THEN
          pnl := (position_rec.liquidation_price - position_rec.entry_price) * position_rec.amount * position_rec.leverage;
        ELSE
          pnl := (position_rec.entry_price - position_rec.liquidation_price) * position_rec.amount * position_rec.leverage;
        END IF;
        
        -- Calculate ROI
        roi := (pnl / position_rec.margin) * 100;
        
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
          position_rec.user_id,
          position_rec.challenge_id,
          position_rec.symbol,
          position_rec.side,
          position_rec.entry_price,
          position_rec.liquidation_price,
          position_rec.amount,
          position_rec.leverage,
          position_rec.margin,
          pnl,
          roi,
          position_rec.created_at,
          now(),
          EXTRACT(EPOCH FROM (now() - position_rec.created_at))::integer
        );
        
        -- Update challenge balance with PnL (loss)
        UPDATE prop_account_balances
        SET 
          current_balance = current_balance + pnl,
          updated_at = now()
        WHERE 
          user_id = position_rec.user_id AND 
          challenge_id = position_rec.challenge_id;
        
        -- Delete the position
        DELETE FROM prop_positions WHERE id = position_rec.id;
        
        -- Log the liquidation
        INSERT INTO prop_logs (user_id, challenge_id, action, details)
        VALUES (
          position_rec.user_id,
          position_rec.challenge_id,
          'position_liquidated',
          jsonb_build_object(
            'position_id', position_rec.id,
            'symbol', position_rec.symbol,
            'side', position_rec.side,
            'entry_price', position_rec.entry_price,
            'liquidation_price', position_rec.liquidation_price,
            'current_price', current_price,
            'pnl', pnl,
            'roi', roi
          )
        );
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      error_details := SQLERRM;
      INSERT INTO prop_logs (
        user_id,
        challenge_id,
        action,
        details
      ) VALUES (
        position_rec.user_id,
        position_rec.challenge_id,
        'liquidation_check_error',
        jsonb_build_object(
          'error', error_details,
          'position_id', position_rec.id,
          'sqlstate', SQLSTATE
        )
      );
    END;
  END LOOP;
  
  -- Log completion
  INSERT INTO prop_logs (
    user_id,
    challenge_id,
    action,
    details
  ) VALUES (
    NULL, -- System user
    'system',
    'liquidations_checked',
    jsonb_build_object(
      'timestamp', now()::text
    )
  );
EXCEPTION WHEN OTHERS THEN
  -- Log any unexpected errors at the function level
  INSERT INTO prop_logs (
    user_id,
    challenge_id,
    action,
    details
  ) VALUES (
    NULL, -- System user
    'system',
    'liquidation_check_process_error',
    jsonb_build_object(
      'error', SQLERRM,
      'sqlstate', SQLSTATE,
      'timestamp', now()::text
    )
  );
END;
$$;

-- Function to close a prop position
CREATE OR REPLACE FUNCTION close_prop_position(position_id uuid, exit_price numeric(20,8) DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  position_rec record;
  current_price numeric(20,8);
  pnl numeric(20,8);
  roi numeric(10,4);
  error_details text;
BEGIN
  -- Get position details
  SELECT * INTO position_rec 
  FROM prop_positions 
  WHERE id = position_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Position not found';
  END IF;
  
  -- If exit_price is not provided, get current market price
  IF exit_price IS NULL OR exit_price <= 0 THEN
    SELECT price INTO current_price
    FROM market_data
    WHERE symbol = position_rec.symbol
    ORDER BY timestamp DESC
    LIMIT 1;
    
    IF NOT FOUND OR current_price IS NULL OR current_price <= 0 THEN
      RAISE EXCEPTION 'Could not determine current price for %', position_rec.symbol;
    END IF;
  ELSE
    current_price := exit_price;
  END IF;
  
  -- Calculate PnL
  IF position_rec.side = 'long' THEN
    pnl := (current_price - position_rec.entry_price) * position_rec.amount * position_rec.leverage;
  ELSE
    pnl := (position_rec.entry_price - current_price) * position_rec.amount * position_rec.leverage;
  END IF;
  
  -- Calculate ROI
  roi := (pnl / position_rec.margin) * 100;
  
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
    position_rec.user_id,
    position_rec.challenge_id,
    position_rec.symbol,
    position_rec.side,
    position_rec.entry_price,
    current_price,
    position_rec.amount,
    position_rec.leverage,
    position_rec.margin,
    pnl,
    roi,
    position_rec.created_at,
    now(),
    EXTRACT(EPOCH FROM (now() - position_rec.created_at))::integer
  );
  
  -- Update challenge balance with PnL
  UPDATE prop_account_balances
  SET 
    current_balance = current_balance + pnl,
    -- Update max_balance if current balance is higher
    max_balance = GREATEST(max_balance, current_balance + pnl),
    updated_at = now()
  WHERE 
    user_id = position_rec.user_id AND 
    challenge_id = position_rec.challenge_id;
  
  -- Delete the position
  DELETE FROM prop_positions WHERE id = position_id;
  
  -- Log the position close
  INSERT INTO prop_logs (user_id, challenge_id, action, details)
  VALUES (
    position_rec.user_id,
    position_rec.challenge_id,
    'position_closed',
    jsonb_build_object(
      'position_id', position_rec.id,
      'symbol', position_rec.symbol,
      'side', position_rec.side,
      'entry_price', position_rec.entry_price,
      'exit_price', current_price,
      'pnl', pnl,
      'roi', roi
    )
  );
  
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  error_details := SQLERRM;
  INSERT INTO prop_logs (
    user_id,
    challenge_id,
    action,
    details
  ) VALUES (
    COALESCE(position_rec.user_id, NULL),
    COALESCE(position_rec.challenge_id, 'unknown'),
    'position_close_error',
    jsonb_build_object(
      'error', error_details,
      'position_id', position_id,
      'sqlstate', SQLSTATE
    )
  );
  RETURN false;
END;
$$;

-- Function to run all prop background processes
CREATE OR REPLACE FUNCTION run_prop_background_processes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Process open orders
  PERFORM process_prop_orders();
  
  -- Update positions with current prices
  PERFORM update_prop_positions();
  
  -- Check for liquidations
  PERFORM check_prop_liquidations();
EXCEPTION WHEN OTHERS THEN
  -- Log any unexpected errors
  INSERT INTO prop_logs (
    user_id,
    challenge_id,
    action,
    details
  ) VALUES (
    NULL, -- System user
    'system',
    'background_process_error',
    jsonb_build_object(
      'error', SQLERRM,
      'sqlstate', SQLSTATE,
      'timestamp', now()::text
    )
  );
END;
$$;

-- Function to check and execute a specific prop order
CREATE OR REPLACE FUNCTION check_and_execute_prop_order(order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  order_rec record;
  current_price numeric(20,8);
  error_details text;
BEGIN
  -- Get the order details
  SELECT po.*, md.price as market_price
  INTO order_rec
  FROM prop_orders po
  JOIN (
    -- Get the latest price for the symbol
    SELECT md.symbol, md.price
    FROM market_data md
    INNER JOIN (
      SELECT symbol, MAX(timestamp) as max_timestamp
      FROM market_data
      GROUP BY symbol
    ) latest ON md.symbol = latest.symbol AND md.timestamp = latest.max_timestamp
  ) md ON po.symbol = md.symbol
  WHERE po.id = order_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  
  IF order_rec.status != 'open' THEN
    RETURN false; -- Order is not open, nothing to do
  END IF;
  
  -- Process the order
  PERFORM process_prop_orders();
  
  -- Check if the order was executed
  SELECT status INTO order_rec
  FROM prop_orders
  WHERE id = order_id;
  
  RETURN order_rec.status = 'filled';
EXCEPTION WHEN OTHERS THEN
  error_details := SQLERRM;
  INSERT INTO prop_logs (
    user_id,
    challenge_id,
    action,
    details
  ) VALUES (
    COALESCE(order_rec.user_id, NULL),
    COALESCE(order_rec.challenge_id, 'unknown'),
    'check_specific_order_error',
    jsonb_build_object(
      'error', error_details,
      'order_id', order_id,
      'sqlstate', SQLSTATE
    )
  );
  RETURN false;
END;
$$;