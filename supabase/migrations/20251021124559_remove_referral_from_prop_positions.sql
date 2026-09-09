/*
  # Remove Referral Commission from Prop Positions

  1. Function Updates
    - Remove referral commission processing from close_prop_position
    - Prop challenges should not trigger referral commissions
    
  2. Changes
    - Restore close_prop_position to original version without referral calls
*/

CREATE OR REPLACE FUNCTION close_prop_position(
  position_id uuid,
  exit_price numeric(20,8) DEFAULT NULL
) RETURNS boolean
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
  
  -- Calculate PnL WITHOUT leverage multiplication
  IF position_rec.side = 'long' THEN
    pnl := (current_price - position_rec.entry_price) * position_rec.amount;
  ELSE
    pnl := (position_rec.entry_price - current_price) * position_rec.amount;
  END IF;
  
  -- Calculate ROI (leverage affects ROI through margin, but not PnL directly)
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
    max_balance = GREATEST(max_balance, current_balance + pnl),
    updated_at = now()
  WHERE 
    user_id = position_rec.user_id AND 
    challenge_id = position_rec.challenge_id;
  
  -- Also update robot_states challenge_account_balance for consistency
  UPDATE robot_states
  SET 
    challenge_account_balance = challenge_account_balance + pnl,
    updated_at = now()
  WHERE 
    user_id = position_rec.user_id AND 
    active_challenge_id = position_rec.challenge_id;
  
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
  
  -- NOTE: Prop positions do NOT trigger referral commissions
  
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
