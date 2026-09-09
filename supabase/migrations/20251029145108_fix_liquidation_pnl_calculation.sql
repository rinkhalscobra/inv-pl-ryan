/*
  # Fix Liquidation PnL Calculation Bug

  1. Issue
    - The `check_futures_liquidations` function multiplies PnL by leverage incorrectly
    - This causes massive transaction amounts during liquidation (e.g., -111 million instead of actual loss)
    - PnL should be: (price_difference) * amount
    - NOT: (price_difference) * amount * leverage

  2. Changes
    - Remove leverage multiplication from unrealized_pnl calculation in check_futures_liquidations
    - Remove leverage multiplication from ROI calculation
    - This aligns with the fix already applied to close_futures_position function

  3. Security
    - Maintains existing RLS policies
    - No changes to permissions
*/

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
  cross_margin_liquidation_threshold numeric(20,8) := 0;
BEGIN
  -- First, update all positions with current prices and calculate PnL
  -- FIXED: Removed leverage multiplication from PnL calculation
  UPDATE futures_positions fp
  SET
    current_price = latest.price,
    unrealized_pnl = CASE
      WHEN fp.side = 'long' THEN (latest.price - fp.entry_price) * fp.amount
      WHEN fp.side = 'short' THEN (fp.entry_price - latest.price) * fp.amount
      ELSE 0
    END,
    roi = CASE
      WHEN fp.margin > 0 THEN
        CASE
          WHEN fp.side = 'long' THEN ((latest.price - fp.entry_price) * fp.amount) / fp.margin * 100
          WHEN fp.side = 'short' THEN ((fp.entry_price - latest.price) * fp.amount) / fp.margin * 100
          ELSE 0
        END
      ELSE 0
    END,
    updated_at = now()
  FROM (
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
        -position_rec.margin,
        -100,
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
          position_rec.unrealized_pnl,
          position_rec.roi,
          position_rec.created_at,
          now(),
          EXTRACT(EPOCH FROM (now() - position_rec.created_at))::integer
        );

        -- Add transaction record for liquidation with correct PnL
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

      -- Set user's balance to zero
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
        PERFORM close_futures_position(position_rec.id, position_rec.current_price);
      END IF;
    END IF;

    IF position_rec.tp_price IS NOT NULL THEN
      IF (position_rec.side = 'long' AND position_rec.current_price >= position_rec.tp_price) OR
         (position_rec.side = 'short' AND position_rec.current_price <= position_rec.tp_price) THEN
        PERFORM close_futures_position(position_rec.id, position_rec.current_price);
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- Also fix the update_futures_positions function
CREATE OR REPLACE FUNCTION update_futures_positions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update all futures positions with current market prices
  -- FIXED: Removed leverage multiplication from PnL calculation
  UPDATE futures_positions fp
  SET
    current_price = latest_prices.price,
    unrealized_pnl = CASE
      WHEN fp.side = 'long' THEN (latest_prices.price - fp.entry_price) * fp.amount
      WHEN fp.side = 'short' THEN (fp.entry_price - latest_prices.price) * fp.amount
      ELSE 0
    END,
    roi = CASE
      WHEN fp.margin > 0 THEN
        CASE
          WHEN fp.side = 'long' THEN ((latest_prices.price - fp.entry_price) * fp.amount) / fp.margin * 100
          WHEN fp.side = 'short' THEN ((fp.entry_price - latest_prices.price) * fp.amount) / fp.margin * 100
          ELSE 0
        END
      ELSE 0
    END,
    updated_at = now()
  FROM (
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
