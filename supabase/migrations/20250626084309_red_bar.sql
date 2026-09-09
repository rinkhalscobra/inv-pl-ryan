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
            'leverage', order_rec.leverage
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
              'leverage', order_rec.leverage
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
                'leverage', order_rec.leverage
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

-- Function to update prop positions with current prices
CREATE OR REPLACE FUNCTION update_prop_positions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update all prop positions with current market prices
  UPDATE prop_positions pp
  SET 
    current_price = latest_prices.price,
    unrealized_pnl = CASE 
      WHEN pp.side = 'long' THEN (latest_prices.price - pp.entry_price) * pp.amount * pp.leverage
      WHEN pp.side = 'short' THEN (pp.entry_price - latest_prices.price) * pp.amount * pp.leverage
      ELSE 0
    END,
    roi = CASE 
      WHEN pp.margin > 0 THEN 
        CASE 
          WHEN pp.side = 'long' THEN ((latest_prices.price - pp.entry_price) * pp.amount * pp.leverage) / pp.margin * 100
          WHEN pp.side = 'short' THEN ((pp.entry_price - latest_prices.price) * pp.amount * pp.leverage) / pp.margin * 100
          ELSE 0
        END
      ELSE 0
    END,
    updated_at = now()
  FROM (
    -- Subquery to get the latest price for each symbol
    SELECT md.symbol, md.price
    FROM market_data md
    INNER JOIN (
      SELECT symbol, MAX(timestamp) as max_timestamp
      FROM market_data
      GROUP BY symbol
    ) latest ON md.symbol = latest.symbol AND md.timestamp = latest.max_timestamp
  ) latest_prices
  WHERE pp.symbol = latest_prices.symbol 
    AND pp.is_open = true;
END;
$$;

-- Function to check for prop position liquidations
CREATE OR REPLACE FUNCTION check_prop_liquidations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  position_rec record;
  user_rec record;
  current_price numeric(20,8);
  should_liquidate boolean;
  pnl numeric(20,8);
  roi numeric(10,4);
  challenge_balance numeric(20,8);
  total_cross_pnl numeric(20,8);
  total_cross_margin numeric(20,8);
  total_equity numeric(20,8);
BEGIN
  -- Process isolated margin positions first
  FOR position_rec IN
    SELECT *
    FROM prop_positions
    WHERE is_open = true AND margin_type = 'isolated'
  LOOP
    -- For isolated margin, liquidate when ROI reaches -100%
    should_liquidate := position_rec.roi <= -100;
    
    IF should_liquidate THEN
      -- Record the liquidation in history
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
        position_rec.current_price,
        position_rec.amount,
        position_rec.leverage,
        position_rec.margin,
        -position_rec.margin, -- Full loss on liquidation
        -100, -- -100% ROI
        position_rec.created_at,
        now(),
        EXTRACT(EPOCH FROM (now() - position_rec.created_at))::integer
      );
      
      -- Delete the liquidated position
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
          'exit_price', position_rec.current_price,
          'margin', position_rec.margin,
          'pnl', -position_rec.margin
        )
      );
      
      -- Check if challenge failed due to max drawdown
      UPDATE prop_account_balances pab
      SET 
        max_drawdown_reached = GREATEST(
          max_drawdown_reached,
          (1 - (current_balance / starting_balance)) * 100
        ),
        status = CASE 
          WHEN (1 - (current_balance / starting_balance)) * 100 > max_drawdown THEN 'failed'
          ELSE status
        END,
        updated_at = now()
      WHERE 
        user_id = position_rec.user_id AND 
        challenge_id = position_rec.challenge_id;
      
      -- Log challenge failure if applicable
      IF EXISTS (
        SELECT 1 FROM prop_account_balances 
        WHERE user_id = position_rec.user_id 
          AND challenge_id = position_rec.challenge_id
          AND status = 'failed'
      ) THEN
        INSERT INTO prop_logs (user_id, challenge_id, action, details)
        VALUES (
          position_rec.user_id,
          position_rec.challenge_id,
          'challenge_failed',
          jsonb_build_object(
            'reason', 'Max drawdown exceeded',
            'position_id', position_rec.id
          )
        );
      END IF;
    END IF;
  END LOOP;

  -- Now process cross margin positions by user and challenge
  FOR user_rec IN
    SELECT DISTINCT user_id, challenge_id
    FROM prop_positions
    WHERE is_open = true AND margin_type = 'cross'
  LOOP
    -- Get challenge balance
    SELECT current_balance INTO challenge_balance
    FROM prop_account_balances
    WHERE user_id = user_rec.user_id AND challenge_id = user_rec.challenge_id;
    
    -- Calculate total unrealized PnL for all cross margin positions
    SELECT COALESCE(SUM(unrealized_pnl), 0), COALESCE(SUM(margin), 0)
    INTO total_cross_pnl, total_cross_margin
    FROM prop_positions
    WHERE user_id = user_rec.user_id 
      AND challenge_id = user_rec.challenge_id 
      AND is_open = true 
      AND margin_type = 'cross';
    
    -- Calculate total equity (balance + total PnL)
    total_equity := challenge_balance + total_cross_pnl;
    
    -- Check if total equity is negative or zero (account is liquidated)
    IF total_equity <= 0 THEN
      -- Liquidate all cross margin positions for this user and challenge
      FOR position_rec IN
        SELECT *
        FROM prop_positions
        WHERE user_id = user_rec.user_id 
          AND challenge_id = user_rec.challenge_id 
          AND is_open = true 
          AND margin_type = 'cross'
      LOOP
        -- Record the liquidation in history
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
          position_rec.current_price,
          position_rec.amount,
          position_rec.leverage,
          position_rec.margin,
          position_rec.unrealized_pnl, -- Actual PnL at liquidation
          position_rec.roi, -- Actual ROI at liquidation
          position_rec.created_at,
          now(),
          EXTRACT(EPOCH FROM (now() - position_rec.created_at))::integer
        );
        
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
            'exit_price', position_rec.current_price,
            'pnl', position_rec.unrealized_pnl,
            'roi', position_rec.roi,
            'liquidation_type', 'cross_margin'
          )
        );
      END LOOP;
      
      -- Delete all cross margin positions for this user and challenge
      DELETE FROM prop_positions 
      WHERE user_id = user_rec.user_id 
        AND challenge_id = user_rec.challenge_id 
        AND is_open = true 
        AND margin_type = 'cross';
      
      -- Set challenge balance to zero
      UPDATE prop_account_balances
      SET 
        current_balance = 0,
        max_drawdown_reached = 100, -- 100% drawdown
        status = 'failed',
        updated_at = now()
      WHERE user_id = user_rec.user_id AND challenge_id = user_rec.challenge_id;
      
      -- Log challenge failure
      INSERT INTO prop_logs (user_id, challenge_id, action, details)
      VALUES (
        user_rec.user_id,
        user_rec.challenge_id,
        'challenge_failed',
        jsonb_build_object(
          'reason', 'Account liquidated (cross margin)',
          'total_equity', total_equity,
          'challenge_balance', challenge_balance,
          'total_pnl', total_cross_pnl
        )
      );
    END IF;
  END LOOP;

  -- Check for stop loss / take profit for remaining positions
  FOR position_rec IN
    SELECT *
    FROM prop_positions
    WHERE is_open = true
  LOOP
    IF position_rec.sl_price IS NOT NULL THEN
      IF (position_rec.side = 'long' AND position_rec.current_price <= position_rec.sl_price) OR
         (position_rec.side = 'short' AND position_rec.current_price >= position_rec.sl_price) THEN
        -- Close position at stop loss
        PERFORM close_prop_position(position_rec.id, position_rec.current_price);
      END IF;
    END IF;
    
    IF position_rec.tp_price IS NOT NULL THEN
      IF (position_rec.side = 'long' AND position_rec.current_price >= position_rec.tp_price) OR
         (position_rec.side = 'short' AND position_rec.current_price <= position_rec.tp_price) THEN
        -- Close position at take profit
        PERFORM close_prop_position(position_rec.id, position_rec.current_price);
      END IF;
    END IF;
  END LOOP;
  
  -- Check if any challenges have reached their profit target
  UPDATE prop_account_balances
  SET 
    status = 'completed',
    updated_at = now()
  WHERE 
    status = 'active' AND
    current_balance >= (starting_balance + target_profit);
  
  -- Log challenge completions
  INSERT INTO prop_logs (user_id, challenge_id, action, details)
  SELECT 
    user_id,
    challenge_id,
    'challenge_completed',
    jsonb_build_object(
      'starting_balance', starting_balance,
      'final_balance', current_balance,
      'profit', current_balance - starting_balance,
      'profit_percentage', ((current_balance - starting_balance) / starting_balance) * 100,
      'max_drawdown_reached', max_drawdown_reached
    )
  FROM prop_account_balances
  WHERE status = 'completed'
    AND id NOT IN (
      SELECT (details->>'account_balance_id')::uuid
      FROM prop_logs
      WHERE action = 'challenge_completed'
        AND details->>'account_balance_id' IS NOT NULL
    );
END;
$$;

-- Function to close a prop position
CREATE OR REPLACE FUNCTION close_prop_position(
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
  SELECT * INTO pos FROM prop_positions WHERE id = position_id AND is_open = true;
  
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
    pos.user_id,
    pos.challenge_id,
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
  
  -- Return margin + PnL to challenge balance
  UPDATE prop_account_balances
  SET 
    current_balance = current_balance + (pos.margin + pnl),
    -- Update max_balance if current balance is higher
    max_balance = GREATEST(max_balance, current_balance + (pos.margin + pnl)),
    -- Update max_drawdown_reached if applicable
    max_drawdown_reached = GREATEST(
      max_drawdown_reached,
      CASE 
        WHEN current_balance + (pos.margin + pnl) < starting_balance THEN
          (1 - ((current_balance + (pos.margin + pnl)) / starting_balance)) * 100
        ELSE
          max_drawdown_reached
      END
    ),
    updated_at = now()
  WHERE user_id = pos.user_id AND challenge_id = pos.challenge_id;
  
  -- Delete the position
  DELETE FROM prop_positions WHERE id = position_id;
  
  -- Log the position close
  INSERT INTO prop_logs (user_id, challenge_id, action, details)
  VALUES (
    pos.user_id,
    pos.challenge_id,
    'position_closed',
    jsonb_build_object(
      'position_id', pos.id,
      'symbol', pos.symbol,
      'side', pos.side,
      'entry_price', pos.entry_price,
      'exit_price', exit_price,
      'pnl', pnl,
      'roi', roi
    )
  );
  
  -- Return the history record ID
  RETURN history_id;
END;
$$;

-- Function to run all prop background processes
CREATE OR REPLACE FUNCTION run_prop_background_processes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Process prop orders
  PERFORM process_prop_orders();
  
  -- Update prop positions
  PERFORM update_prop_positions();
  
  -- Check for liquidations
  PERFORM check_prop_liquidations();
  
  -- Log that the background process ran
  INSERT INTO prop_logs (
    user_id,
    challenge_id,
    action,
    details
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', -- System user
    'system',
    'background_process_run',
    jsonb_build_object(
      'timestamp', now()::text
    )
  );
END;
$$;

-- Function to initialize a prop challenge
CREATE OR REPLACE FUNCTION initialize_prop_challenge(
  p_user_id uuid,
  p_challenge_id text,
  p_starting_balance numeric,
  p_target_profit numeric,
  p_max_drawdown numeric,
  p_duration_days integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account_id uuid;
BEGIN
  -- Check if user already has an active challenge of this type
  IF EXISTS (
    SELECT 1 FROM prop_account_balances
    WHERE user_id = p_user_id
      AND challenge_id = p_challenge_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'User already has an active % challenge', p_challenge_id;
  END IF;
  
  -- Create prop account balance
  INSERT INTO prop_account_balances (
    user_id,
    challenge_id,
    starting_balance,
    current_balance,
    max_balance,
    max_drawdown,
    max_drawdown_reached,
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
    0,
    p_target_profit,
    now(),
    now() + (p_duration_days || ' days')::interval,
    'active'
  )
  RETURNING id INTO v_account_id;
  
  -- Log challenge initialization
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
      'account_id', v_account_id,
      'starting_balance', p_starting_balance,
      'target_profit', p_target_profit,
      'max_drawdown', p_max_drawdown,
      'duration_days', p_duration_days
    )
  );
  
  RETURN v_account_id;
END;
$$;

-- Function to cancel a prop challenge
CREATE OR REPLACE FUNCTION cancel_prop_challenge(
  p_user_id uuid,
  p_challenge_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account_balance record;
  position_record record;
BEGIN
  -- Get the challenge account
  SELECT * INTO v_account_balance
  FROM prop_account_balances
  WHERE user_id = p_user_id
    AND challenge_id = p_challenge_id
    AND status = 'active';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active % challenge found for this user', p_challenge_id;
  END IF;
  
  -- Close all open positions
  FOR position_record IN
    SELECT id, current_price
    FROM prop_positions
    WHERE user_id = p_user_id
      AND challenge_id = p_challenge_id
      AND is_open = true
  LOOP
    PERFORM close_prop_position(position_record.id, position_record.current_price);
  END LOOP;
  
  -- Cancel all open orders
  UPDATE prop_orders
  SET status = 'cancelled'
  WHERE user_id = p_user_id
    AND challenge_id = p_challenge_id
    AND status = 'open';
  
  -- Mark challenge as completed
  UPDATE prop_account_balances
  SET 
    status = 'completed',
    updated_at = now()
  WHERE user_id = p_user_id
    AND challenge_id = p_challenge_id;
  
  -- Log challenge cancellation
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
      'account_id', v_account_balance.id,
      'starting_balance', v_account_balance.starting_balance,
      'final_balance', v_account_balance.current_balance,
      'profit_loss', v_account_balance.current_balance - v_account_balance.starting_balance,
      'max_drawdown_reached', v_account_balance.max_drawdown_reached
    )
  );
  
  RETURN true;
END;
$$;