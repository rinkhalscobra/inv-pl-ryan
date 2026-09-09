/*
  # Fix PnL Calculation - Remove Leverage Multiplication

  1. Changes
    - Remove leverage multiplication from PnL calculation in `close_futures_position`
    - PnL should be: (price_difference) * amount
    - NOT: (price_difference) * amount * leverage
    - Leverage is already factored into the position's profit/loss

  2. Description
    - When trading with leverage, the amount already represents the leveraged position
    - Multiplying by leverage again causes incorrect (inflated) PnL calculations
    - Example: $1 price move on 1 BTC with 10x leverage = $1 * 1 = $1 PnL (not $10)
*/

-- Drop and recreate close_futures_position function with correct PnL calculation
DROP FUNCTION IF EXISTS close_futures_position(uuid, numeric);

CREATE OR REPLACE FUNCTION close_futures_position(
  position_id uuid,
  exit_price numeric
)
RETURNS numeric AS $$
DECLARE
  v_position RECORD;
  v_pnl numeric;
  v_roi numeric;
  v_entry_spread_cost numeric;
  v_exit_spread_cost numeric;
  v_total_spread_cost numeric;
  v_accumulated_swap_cost numeric;
  v_net_pnl numeric;
  v_duration_seconds integer;
  v_total_swap_days integer;
  v_referrer_id uuid;
  v_commission_rate numeric;
  v_commission_amount numeric;
BEGIN
  -- Get position details
  SELECT * INTO v_position
  FROM futures_positions
  WHERE id = position_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Position not found';
  END IF;
  
  -- Get entry spread cost (stored when position was opened)
  v_entry_spread_cost := COALESCE(v_position.spread_cost, 0);
  
  -- Calculate exit spread cost
  v_exit_spread_cost := calculate_spread_cost(
    v_position.symbol,
    exit_price,
    v_position.amount
  );
  
  -- Total spread cost = entry + exit
  v_total_spread_cost := v_entry_spread_cost + v_exit_spread_cost;
  
  -- Get accumulated swap cost
  v_accumulated_swap_cost := COALESCE(v_position.accumulated_swap_cost, 0);
  
  -- Calculate total swap days
  v_total_swap_days := EXTRACT(DAY FROM (now() - v_position.created_at))::integer;
  
  -- Calculate base PnL WITHOUT leverage multiplication
  -- The amount already represents the leveraged position size
  IF v_position.side = 'long' THEN
    v_pnl := (exit_price - v_position.entry_price) * v_position.amount;
  ELSE
    v_pnl := (v_position.entry_price - exit_price) * v_position.amount;
  END IF;
  
  -- Deduct spread costs AND swap costs from PnL
  v_net_pnl := v_pnl - v_total_spread_cost - v_accumulated_swap_cost;
  
  -- Calculate ROI based on margin
  IF v_position.margin > 0 THEN
    v_roi := (v_net_pnl / v_position.margin) * 100;
  ELSE
    v_roi := 0;
  END IF;
  
  -- Calculate position duration
  v_duration_seconds := EXTRACT(EPOCH FROM (now() - v_position.created_at))::integer;
  
  -- Get referrer information for commission calculation
  SELECT referred_by INTO v_referrer_id
  FROM users
  WHERE id = v_position.user_id;
  
  -- Calculate referral commission if there's a referrer and position is profitable
  IF v_referrer_id IS NOT NULL AND v_net_pnl > 0 THEN
    -- Get commission rate based on referrer's tier
    SELECT 
      CASE 
        WHEN total_referred_users >= 100 THEN 0.25
        WHEN total_referred_users >= 50 THEN 0.20
        WHEN total_referred_users >= 20 THEN 0.15
        WHEN total_referred_users >= 10 THEN 0.10
        ELSE 0.05
      END INTO v_commission_rate
    FROM users
    WHERE id = v_referrer_id;
    
    -- Calculate commission amount (percentage of net profit)
    v_commission_amount := v_net_pnl * v_commission_rate;
    
    -- Record referral earning
    INSERT INTO referral_earnings (
      referrer_id,
      referred_user_id,
      earning_type,
      amount,
      commission_rate,
      source_transaction_id,
      created_at
    ) VALUES (
      v_referrer_id,
      v_position.user_id,
      'futures_trading',
      v_commission_amount,
      v_commission_rate,
      position_id,
      now()
    );
    
    -- Add commission to referrer's balance
    UPDATE balances
    SET usdt_balance = usdt_balance + v_commission_amount,
        updated_at = now()
    WHERE user_id = v_referrer_id;
  END IF;
  
  -- ONLY return net PnL to user's balance (not margin, since it was never deducted)
  UPDATE balances
  SET usdt_balance = usdt_balance + v_net_pnl,
      updated_at = now()
  WHERE user_id = v_position.user_id;
  
  -- Insert into position history with spread and swap information
  INSERT INTO futures_position_history (
    id,
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
    duration_seconds,
    spread_cost,
    spread_percentage,
    accumulated_swap_cost,
    total_swap_days
  ) VALUES (
    v_position.id,
    v_position.user_id,
    v_position.symbol,
    v_position.side,
    v_position.entry_price,
    exit_price,
    v_position.amount,
    v_position.leverage,
    v_position.margin,
    v_net_pnl,
    v_roi,
    v_position.created_at,
    now(),
    v_duration_seconds,
    v_total_spread_cost,
    v_position.spread_percentage,
    v_accumulated_swap_cost,
    v_total_swap_days
  );
  
  -- Mark position as closed
  UPDATE futures_positions
  SET is_open = false,
      current_price = exit_price,
      unrealized_pnl = v_net_pnl,
      roi = v_roi,
      updated_at = now()
  WHERE id = position_id;
  
  -- Return the net PnL for reference
  RETURN v_net_pnl;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION close_futures_position(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION close_futures_position(uuid, numeric) TO service_role;
