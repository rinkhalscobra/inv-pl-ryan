-- Fix check_futures_liquidations function to use ROI instead of price comparison
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
BEGIN
  -- Check all open positions
  FOR position_rec IN
    SELECT fp.*, md.price as market_price
    FROM futures_positions fp
    JOIN market_data md ON md.symbol = fp.symbol
    WHERE fp.is_open = true
  LOOP
    should_liquidate := false;
    current_price := position_rec.market_price;
    
    -- Calculate current PnL
    IF position_rec.side = 'long' THEN
      pnl := (current_price - position_rec.entry_price) * position_rec.amount;
      -- Use ROI instead of price comparison for liquidation
      should_liquidate := position_rec.roi <= -100;
    ELSE
      pnl := (position_rec.entry_price - current_price) * position_rec.amount;
      -- Use ROI instead of price comparison for liquidation
      should_liquidate := position_rec.roi <= -100;
    END IF;
    
    -- Calculate ROI
    roi := (pnl / position_rec.margin) * 100;
    
    -- Update position with current values
    UPDATE futures_positions
    SET 
      current_price = current_price,
      unrealized_pnl = pnl,
      roi = roi,
      updated_at = now()
    WHERE id = position_rec.id;
    
    -- Check for liquidation
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
        current_price,
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
      DELETE FROM futures_positions WHERE id = position_rec.id;
      
      -- No balance returned on liquidation
    END IF;
    
    -- Check for stop loss / take profit
    IF position_rec.is_open AND position_rec.sl_price IS NOT NULL THEN
      IF (position_rec.side = 'long' AND current_price <= position_rec.sl_price) OR
         (position_rec.side = 'short' AND current_price >= position_rec.sl_price) THEN
        -- Close position at stop loss
        PERFORM close_futures_position(position_rec.id, current_price);
      END IF;
    END IF;
    
    IF position_rec.is_open AND position_rec.tp_price IS NOT NULL THEN
      IF (position_rec.side = 'long' AND current_price >= position_rec.tp_price) OR
         (position_rec.side = 'short' AND current_price <= position_rec.tp_price) THEN
        -- Close position at take profit
        PERFORM close_futures_position(position_rec.id, current_price);
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- Update the check_futures_liquidations function in run_background_processes
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
  
  -- Check for liquidations using the updated function
  PERFORM check_futures_liquidations();
  
  -- Check stop orders
  PERFORM check_stop_orders();
  
  -- Log that the background process ran
  INSERT INTO system_logs (action, details)
  VALUES ('run_background_processes', 'Background processes executed at ' || now()::text);
END;
$$;