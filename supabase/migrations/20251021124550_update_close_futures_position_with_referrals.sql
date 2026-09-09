/*
  # Update close_futures_position to Include Referral Commission

  1. Function Updates
    - Add referral commission processing to close_futures_position
    - Only process for winning positions (positive PnL)
    - Call process_referral_commission after position is closed
    
  2. Changes
    - Add PERFORM process_referral_commission() call at the end
    - Only triggers on positive PnL
*/

DROP FUNCTION IF EXISTS close_futures_position(uuid, numeric);

CREATE OR REPLACE FUNCTION close_futures_position(position_id uuid, exit_price numeric)
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
    pnl := (exit_price - pos.entry_price) * pos.amount;
  ELSE
    pnl := (pos.entry_price - exit_price) * pos.amount;
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
  
  -- Return PnL to user's balance
  UPDATE balances
  SET usdt_balance = usdt_balance + pnl,
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
  
  -- Process referral commission if this was a winning position
  IF pnl > 0 THEN
    PERFORM process_referral_commission(
      pos.user_id,
      position_id,
      pnl,
      pos.symbol,
      pos.side
    );
  END IF;
  
  -- Return the history record ID
  RETURN history_id;
END;
$$;
