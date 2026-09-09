/*
  # Update Liquidation Price Calculation Logic

  1. Changes
    - Update the check_futures_liquidations function to properly handle both isolated and cross margin
    - Fix the calculation of liquidation prices for cross margin positions
    - Ensure proper handling of multiple positions per user in cross margin
    
  2. Security
    - No changes to existing RLS policies
*/

-- Update check_futures_liquidations function to handle cross margin properly
CREATE OR REPLACE FUNCTION check_futures_liquidations()
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
  user_balance numeric(20,8);
  total_cross_pnl numeric(20,8);
  total_cross_margin numeric(20,8);
  total_equity numeric(20,8);
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
  FOR user_rec IN
    SELECT DISTINCT user_id
    FROM futures_positions
    WHERE is_open = true AND margin_type = 'cross'
  LOOP
    -- Get user's USDT balance
    SELECT usdt_balance INTO user_balance
    FROM balances
    WHERE user_id = user_rec.user_id;
    
    -- Calculate total unrealized PnL for all cross margin positions
    SELECT COALESCE(SUM(unrealized_pnl), 0), COALESCE(SUM(margin), 0)
    INTO total_cross_pnl, total_cross_margin
    FROM futures_positions
    WHERE user_id = user_rec.user_id AND is_open = true AND margin_type = 'cross';
    
    -- Calculate total equity (balance + total PnL)
    total_equity := user_balance + total_cross_pnl;
    
    -- Check if total equity is negative or zero (account is liquidated)
    IF total_equity <= 0 THEN
      -- Liquidate all cross margin positions for this user
      FOR position_rec IN
        SELECT *
        FROM futures_positions
        WHERE user_id = user_rec.user_id AND is_open = true AND margin_type = 'cross'
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
      WHERE user_id = user_rec.user_id AND is_open = true AND margin_type = 'cross';
      
      -- Set user's balance to zero (or minimum allowed)
      UPDATE balances
      SET usdt_balance = 0,
          updated_at = now()
      WHERE user_id = user_rec.user_id;
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

-- Create a function to recalculate liquidation prices for all positions
CREATE OR REPLACE FUNCTION recalculate_liquidation_prices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  position_rec record;
  user_balance numeric(20,8);
  new_liquidation_price numeric(20,8);
BEGIN
  -- Process all open positions
  FOR position_rec IN
    SELECT fp.*, b.usdt_balance
    FROM futures_positions fp
    JOIN balances b ON fp.user_id = b.user_id
    WHERE fp.is_open = true
  LOOP
    -- Calculate new liquidation price based on margin type
    IF position_rec.margin_type = 'isolated' THEN
      -- For isolated margin, liquidation happens when ROI reaches -100%
      IF position_rec.side = 'long' THEN
        -- Long position: liquidation when price drops by (1/leverage) of entry price
        new_liquidation_price := position_rec.entry_price * (1 - 1 / position_rec.leverage);
      ELSE
        -- Short position: liquidation when price rises by (1/leverage) of entry price
        new_liquidation_price := position_rec.entry_price * (1 + 1 / position_rec.leverage);
      END IF;
    ELSE
      -- For cross margin, liquidation happens when total account equity reaches zero
      user_balance := position_rec.usdt_balance;
      
      IF position_rec.side = 'long' THEN
        -- Long position: liquidation when price drops enough to wipe out entire balance
        new_liquidation_price := position_rec.entry_price - ((position_rec.entry_price * position_rec.margin * position_rec.leverage) / (position_rec.margin * position_rec.leverage + user_balance));
        -- Ensure liquidation price is not negative
        new_liquidation_price := GREATEST(new_liquidation_price, 0);
      ELSE
        -- Short position: liquidation when price rises enough to wipe out entire balance
        new_liquidation_price := position_rec.entry_price + ((position_rec.entry_price * position_rec.margin * position_rec.leverage) / (position_rec.margin * position_rec.leverage + user_balance));
      END IF;
    END IF;
    
    -- Update the position with the new liquidation price
    UPDATE futures_positions
    SET liquidation_price = new_liquidation_price,
        updated_at = now()
    WHERE id = position_rec.id;
    
    -- Log the update
    INSERT INTO system_logs (action, details)
    VALUES (
      'liquidation_price_recalculated',
      format(
        'Position %s liquidation price updated. Old: %s, New: %s, Margin Type: %s',
        position_rec.id,
        position_rec.liquidation_price,
        new_liquidation_price,
        position_rec.margin_type
      )
    );
  END LOOP;
END;
$$;