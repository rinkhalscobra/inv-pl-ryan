-- Improved Liquidation Logic for Isolated and Cross Margin
/*
  # Improved Futures Liquidation System

  1. Changes
    - Update check_futures_liquidations to handle isolated and cross margin differently
    - For isolated margin, liquidate when position ROI reaches -100%
    - For cross margin, check total account equity before liquidation
    - Add proper liquidation price calculation based on margin type
    
  2. Benefits
    - More accurate representation of real-world margin trading
    - Cross margin positions can go beyond -100% ROI as long as account has funds
    - Isolated margin positions are limited to their allocated margin
*/

-- Update check_futures_liquidations function to handle cross margin properly
CREATE OR REPLACE FUNCTION check_futures_liquidations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  position_rec record;
  current_price numeric(20,8);
  should_liquidate boolean;
  pnl numeric(20,8);
  roi numeric(10,4);
  user_balance numeric(20,8);
  total_cross_pnl numeric(20,8);
  total_equity numeric(20,8);
  cross_margin_liquidation_threshold numeric(20,8) := 0; -- Liquidate when total equity reaches zero
BEGIN
  -- First, update all positions with current prices and calculate PnL
  UPDATE futures_positions fp
  SET 
    current_price = latest.price,
    unrealized_pnl = CASE 
      WHEN fp.side = 'long' THEN (latest.price - fp.entry_price) * fp.amount * fp.leverage
      WHEN fp.side = 'short' THEN (fp.entry_price - latest.price) * fp.amount * fp.leverage
      ELSE 0
    END,
    roi = CASE 
      WHEN fp.margin > 0 THEN 
        CASE 
          WHEN fp.side = 'long' THEN ((latest.price - fp.entry_price) * fp.amount * fp.leverage) / fp.margin * 100
          WHEN fp.side = 'short' THEN ((fp.entry_price - latest.price) * fp.amount * fp.leverage) / fp.margin * 100
          ELSE 0
        END
      ELSE 0
    END,
    updated_at = now()
  FROM (
    -- Get the latest price for each symbol
    SELECT md.symbol, md.price
    FROM market_data md
    INNER JOIN (
      SELECT symbol, MAX(timestamp) as max_timestamp
      FROM market_data
      GROUP BY symbol
    ) latest_ts ON md.symbol = latest_ts.symbol AND md.timestamp = latest_ts.max_timestamp
  ) latest
  WHERE fp.symbol = latest.symbol AND fp.is_open = true;

  -- Process isolated margin positions first
  FOR position_rec IN
    SELECT *
    FROM futures_positions
    WHERE is_open = true AND margin_type = 'isolated'
  LOOP
    -- For isolated margin, liquidate when ROI reaches -100%
    should_liquidate := position_rec.roi <= -100;
    
    IF should_liquidate THEN
      -- Record the liquidation in history
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
        position_rec.user_id,
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
      
      -- Add transaction record for liquidation
      INSERT INTO transactions (
        user_id,
        type,
        amount,
        description,
        status
      ) VALUES (
        position_rec.user_id,
        'trade',
        -position_rec.margin,
        'Liquidated ' || position_rec.side || ' position for ' || position_rec.symbol || ' (isolated margin)',
        'completed'
      );
      
      -- Delete the liquidated position
      DELETE FROM futures_positions WHERE id = position_rec.id;
      
      -- Log the liquidation
      INSERT INTO system_logs (action, details)
      VALUES (
        'position_liquidated',
        format(
          'Isolated margin position %s liquidated. User: %s, Symbol: %s, Side: %s, Entry: %s, Exit: %s, Margin: %s',
          position_rec.id,
          position_rec.user_id,
          position_rec.symbol,
          position_rec.side,
          position_rec.entry_price,
          position_rec.current_price,
          position_rec.margin
        )
      );
    END IF;
  END LOOP;

  -- Now process cross margin positions by user
  -- We need to check the total equity for each user's cross margin account
  FOR position_rec IN
    SELECT DISTINCT user_id
    FROM futures_positions
    WHERE is_open = true AND margin_type = 'cross'
  LOOP
    -- Get user's USDT balance
    SELECT usdt_balance INTO user_balance
    FROM balances
    WHERE user_id = position_rec.user_id;
    
    -- Calculate total unrealized PnL for all cross margin positions
    SELECT COALESCE(SUM(unrealized_pnl), 0) INTO total_cross_pnl
    FROM futures_positions
    WHERE user_id = position_rec.user_id AND is_open = true AND margin_type = 'cross';
    
    -- Calculate total equity
    total_equity := user_balance + total_cross_pnl;
    
    -- Check if total equity is below liquidation threshold
    IF total_equity <= cross_margin_liquidation_threshold THEN
      -- Liquidate all cross margin positions for this user
      FOR position_rec IN
        SELECT *
        FROM futures_positions
        WHERE user_id = position_rec.user_id AND is_open = true AND margin_type = 'cross'
      LOOP
        -- Record the liquidation in history
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
          position_rec.user_id,
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
        
        -- Add transaction record for liquidation
        INSERT INTO transactions (
          user_id,
          type,
          amount,
          description,
          status
        ) VALUES (
          position_rec.user_id,
          'trade',
          position_rec.unrealized_pnl,
          'Liquidated ' || position_rec.side || ' position for ' || position_rec.symbol || ' (cross margin)',
          'completed'
        );
        
        -- Log the liquidation
        INSERT INTO system_logs (action, details)
        VALUES (
          'position_liquidated',
          format(
            'Cross margin position %s liquidated. User: %s, Symbol: %s, Side: %s, Entry: %s, Exit: %s, PnL: %s, ROI: %s%%',
            position_rec.id,
            position_rec.user_id,
            position_rec.symbol,
            position_rec.side,
            position_rec.entry_price,
            position_rec.current_price,
            position_rec.unrealized_pnl,
            position_rec.roi
          )
        );
      END LOOP;
      
      -- Delete all cross margin positions for this user
      DELETE FROM futures_positions 
      WHERE user_id = position_rec.user_id AND is_open = true AND margin_type = 'cross';
      
      -- Set user's balance to zero (or minimum allowed)
      UPDATE balances
      SET usdt_balance = 0,
          updated_at = now()
      WHERE user_id = position_rec.user_id;
    END IF;
  END LOOP;

  -- Check for stop loss / take profit for remaining positions
  FOR position_rec IN
    SELECT *
    FROM futures_positions
    WHERE is_open = true
  LOOP
    IF position_rec.sl_price IS NOT NULL THEN
      IF (position_rec.side = 'long' AND position_rec.current_price <= position_rec.sl_price) OR
         (position_rec.side = 'short' AND position_rec.current_price >= position_rec.sl_price) THEN
        -- Close position at stop loss
        PERFORM close_futures_position(position_rec.id, position_rec.current_price);
      END IF;
    END IF;
    
    IF position_rec.tp_price IS NOT NULL THEN
      IF (position_rec.side = 'long' AND position_rec.current_price >= position_rec.tp_price) OR
         (position_rec.side = 'short' AND position_rec.current_price <= position_rec.tp_price) THEN
        -- Close position at take profit
        PERFORM close_futures_position(position_rec.id, position_rec.current_price);
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- Update process_futures_orders to set correct liquidation price based on margin type
CREATE OR REPLACE FUNCTION process_futures_orders()
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
        
        -- Get user's balance for cross margin calculation
        SELECT usdt_balance INTO user_balance
        FROM balances
        WHERE user_id = order_rec.user_id;
        
        -- Calculate liquidation price based on margin type
        IF order_rec.margin_type = 'isolated' THEN
          -- For isolated margin, liquidation is based on position margin
          IF order_rec.side = 'buy' THEN -- Long position
            liquidation_price := current_price * (1 - (1 / order_rec.leverage) * 0.95);
          ELSE -- Short position
            liquidation_price := current_price * (1 + (1 / order_rec.leverage) * 0.95);
          END IF;
        ELSE -- Cross margin
          -- For cross margin, liquidation is based on total account equity
          -- This is a simplified calculation that assumes this is the only position
          IF order_rec.side = 'buy' THEN -- Long position
            -- For cross margin long, liquidation happens when price drops enough to wipe out entire balance
            liquidation_price := current_price - ((user_balance * order_rec.leverage) / order_rec.amount);
            -- Ensure liquidation price is not negative
            liquidation_price := GREATEST(liquidation_price, 0);
          ELSE -- Short position
            -- For cross margin short, liquidation happens when price rises enough to wipe out entire balance
            liquidation_price := current_price + ((user_balance * order_rec.leverage) / order_rec.amount);
          END IF;
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
          order_rec.margin_type, -- Use the specified margin type
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
        UPDATE futures_orders
        SET status = 'filled',
            filled_at = now(),
            position_id = v_position_id
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
            ' position for ' || order_rec.symbol || ' with ' || order_rec.leverage || 'x leverage (' || order_rec.margin_type || ' margin)',
          'completed'
        );
      
      -- Limit orders - execute if price conditions are met
      WHEN order_rec.type = 'limit' THEN
        -- Check if limit price conditions are met
        IF (order_rec.side = 'buy' AND current_price <= order_rec.price) OR
           (order_rec.side = 'sell' AND current_price >= order_rec.price) THEN
          
          -- Calculate required margin
          margin := (order_rec.amount * order_rec.price) / order_rec.leverage;
          
          -- Get user's balance for cross margin calculation
          SELECT usdt_balance INTO user_balance
          FROM balances
          WHERE user_id = order_rec.user_id;
          
          -- Calculate liquidation price based on margin type
          IF order_rec.margin_type = 'isolated' THEN
            -- For isolated margin, liquidation is based on position margin
            IF order_rec.side = 'buy' THEN -- Long position
              liquidation_price := order_rec.price * (1 - (1 / order_rec.leverage) * 0.95);
            ELSE -- Short position
              liquidation_price := order_rec.price * (1 + (1 / order_rec.leverage) * 0.95);
            END IF;
          ELSE -- Cross margin
            -- For cross margin, liquidation is based on total account equity
            -- This is a simplified calculation that assumes this is the only position
            IF order_rec.side = 'buy' THEN -- Long position
              -- For cross margin long, liquidation happens when price drops enough to wipe out entire balance
              liquidation_price := order_rec.price - ((user_balance * order_rec.leverage) / order_rec.amount);
              -- Ensure liquidation price is not negative
              liquidation_price := GREATEST(liquidation_price, 0);
            ELSE -- Short position
              -- For cross margin short, liquidation happens when price rises enough to wipe out entire balance
              liquidation_price := order_rec.price + ((user_balance * order_rec.leverage) / order_rec.amount);
            END IF;
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
            order_rec.margin_type, -- Use the specified margin type
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
          UPDATE futures_orders
          SET status = 'filled',
              filled_at = now(),
              position_id = v_position_id
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
              ' position for ' || order_rec.symbol || ' with ' || order_rec.leverage || 'x leverage (' || order_rec.margin_type || ' margin, limit order)',
            'completed'
          );
          
          -- Log successful execution
          INSERT INTO system_logs (action, details)
          VALUES (
            'limit_order_executed',
            format(
              'Order ID: %s, Symbol: %s, Side: %s, Limit Price: %s, Execution Price: %s, Margin Type: %s',
              order_rec.id,
              order_rec.symbol,
              order_rec.side,
              order_rec.price,
              current_price,
              order_rec.margin_type
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
            
            -- Get user's balance for cross margin calculation
            SELECT usdt_balance INTO user_balance
            FROM balances
            WHERE user_id = order_rec.user_id;
            
            -- Calculate liquidation price based on margin type
            IF order_rec.margin_type = 'isolated' THEN
              -- For isolated margin, liquidation is based on position margin
              IF order_rec.side = 'buy' THEN -- Long position
                liquidation_price := current_price * (1 - (1 / order_rec.leverage) * 0.95);
              ELSE -- Short position
                liquidation_price := current_price * (1 + (1 / order_rec.leverage) * 0.95);
              END IF;
            ELSE -- Cross margin
              -- For cross margin, liquidation is based on total account equity
              -- This is a simplified calculation that assumes this is the only position
              IF order_rec.side = 'buy' THEN -- Long position
                -- For cross margin long, liquidation happens when price drops enough to wipe out entire balance
                liquidation_price := current_price - ((user_balance * order_rec.leverage) / order_rec.amount);
                -- Ensure liquidation price is not negative
                liquidation_price := GREATEST(liquidation_price, 0);
              ELSE -- Short position
                -- For cross margin short, liquidation happens when price rises enough to wipe out entire balance
                liquidation_price := current_price + ((user_balance * order_rec.leverage) / order_rec.amount);
              END IF;
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
              order_rec.margin_type, -- Use the specified margin type
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
                ' position for ' || order_rec.symbol || ' with ' || order_rec.leverage || 'x leverage (' || order_rec.margin_type || ' margin, stop order)',
              'completed'
            );
          END IF;
          
          -- Update order status
          UPDATE futures_orders
          SET status = 'filled',
              filled_at = now(),
              position_id = v_position_id
          WHERE id = order_rec.id;
        END IF;
    END CASE;
  END LOOP;
END;
$$;

-- Update the update_futures_positions function to handle cross margin
CREATE OR REPLACE FUNCTION update_futures_positions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update all futures positions with current market prices
  UPDATE futures_positions fp
  SET 
    current_price = latest_prices.price,
    unrealized_pnl = CASE 
      WHEN fp.side = 'long' THEN (latest_prices.price - fp.entry_price) * fp.amount * fp.leverage
      WHEN fp.side = 'short' THEN (fp.entry_price - latest_prices.price) * fp.amount * fp.leverage
      ELSE 0
    END,
    roi = CASE 
      WHEN fp.margin > 0 THEN 
        CASE 
          WHEN fp.side = 'long' THEN ((latest_prices.price - fp.entry_price) * fp.amount * fp.leverage) / fp.margin * 100
          WHEN fp.side = 'short' THEN ((fp.entry_price - latest_prices.price) * fp.amount * fp.leverage) / fp.margin * 100
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
  WHERE fp.symbol = latest_prices.symbol 
    AND fp.is_open = true;
END;
$$;

-- Add margin_type parameter to openPosition function
CREATE OR REPLACE FUNCTION open_futures_position(
  p_user_id uuid,
  p_symbol text,
  p_side text,
  p_amount numeric,
  p_leverage integer,
  p_margin_type text DEFAULT 'isolated',
  p_price numeric DEFAULT NULL,
  p_tp_price numeric DEFAULT NULL,
  p_sl_price numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_price numeric(20,8);
  v_margin numeric(20,8);
  v_liquidation_price numeric(20,8);
  v_position_id uuid;
  v_user_balance numeric(20,8);
BEGIN
  -- Get current price if not provided
  IF p_price IS NULL THEN
    SELECT price INTO v_current_price
    FROM market_data
    WHERE symbol = p_symbol
    ORDER BY timestamp DESC
    LIMIT 1;
    
    IF NOT FOUND OR v_current_price IS NULL THEN
      RAISE EXCEPTION 'No price data available for %', p_symbol;
    END IF;
  ELSE
    v_current_price := p_price;
  END IF;
  
  -- Calculate required margin
  v_margin := (p_amount * v_current_price) / p_leverage;
  
  -- Get user's balance for cross margin calculation
  SELECT usdt_balance INTO v_user_balance
  FROM balances
  WHERE user_id = p_user_id;
  
  IF NOT FOUND OR v_user_balance < v_margin THEN
    RAISE EXCEPTION 'Insufficient balance. Required: %, Available: %', v_margin, COALESCE(v_user_balance, 0);
  END IF;
  
  -- Calculate liquidation price based on margin type
  IF p_margin_type = 'isolated' THEN
    -- For isolated margin, liquidation is based on position margin
    IF p_side = 'long' THEN -- Long position
      v_liquidation_price := v_current_price * (1 - (1 / p_leverage) * 0.95);
    ELSE -- Short position
      v_liquidation_price := v_current_price * (1 + (1 / p_leverage) * 0.95);
    END IF;
  ELSE -- Cross margin
    -- For cross margin, liquidation is based on total account equity
    IF p_side = 'long' THEN -- Long position
      -- For cross margin long, liquidation happens when price drops enough to wipe out entire balance
      v_liquidation_price := v_current_price - ((v_user_balance * p_leverage) / p_amount);
      -- Ensure liquidation price is not negative
      v_liquidation_price := GREATEST(v_liquidation_price, 0);
    ELSE -- Short position
      -- For cross margin short, liquidation happens when price rises enough to wipe out entire balance
      v_liquidation_price := v_current_price + ((v_user_balance * p_leverage) / p_amount);
    END IF;
  END IF;
  
  -- Deduct margin from user's balance
  UPDATE balances
  SET usdt_balance = usdt_balance - v_margin,
      updated_at = now()
  WHERE user_id = p_user_id;
  
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
    p_user_id,
    p_symbol,
    v_current_price,
    v_current_price,
    p_amount,
    p_leverage,
    p_margin_type,
    p_side,
    v_liquidation_price,
    0, -- Initial PnL is 0
    v_margin,
    0, -- Initial ROI is 0
    true,
    p_amount * v_current_price,
    p_tp_price,
    p_sl_price
  )
  RETURNING id INTO v_position_id;
  
  -- Add transaction record
  INSERT INTO transactions (
    user_id,
    type,
    amount,
    description,
    status
  ) VALUES (
    p_user_id,
    'trade',
    -v_margin,
    'Opened ' || 
      p_side || 
      ' position for ' || p_symbol || ' with ' || p_leverage || 'x leverage (' || p_margin_type || ' margin)',
    'completed'
  );
  
  RETURN v_position_id;
END;
$$;