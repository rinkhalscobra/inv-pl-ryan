/*
  # Add stake claim functionality

  1. New Functions
    - process_stake_claim function to handle claiming completed stakes
    - Calculates final earnings and updates user balance
    - Creates transaction records for staking return and profit

  2. Security
    - Validates stake ownership and completion status
    - Includes proper error handling and logging
*/

-- Create function to process stake claims
CREATE OR REPLACE FUNCTION process_stake_claim(p_stake_id uuid)
RETURNS boolean AS $$
DECLARE
  stake_rec record;
  final_earned_amount numeric(20,8);
  duration_days numeric;
  daily_rate numeric;
BEGIN
  -- Get stake details
  SELECT * INTO stake_rec 
  FROM user_stakes 
  WHERE id = p_stake_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stake not found';
  END IF;
  
  -- Verify stake is active and has ended
  IF stake_rec.status != 'active' THEN
    RAISE EXCEPTION 'Stake is not active (status: %)', stake_rec.status;
  END IF;
  
  IF stake_rec.end_date > now() THEN
    RAISE EXCEPTION 'Stake has not yet matured (ends: %)', stake_rec.end_date;
  END IF;
  
  -- Calculate final earned amount
  duration_days := EXTRACT(EPOCH FROM (stake_rec.end_date::timestamp - stake_rec.start_date::timestamp)) / 86400;
  daily_rate := stake_rec.apy_rate / 365.0 / 100.0;
  final_earned_amount := stake_rec.staked_amount * daily_rate * duration_days;
  
  -- Update stake status and earned amount
  UPDATE user_stakes
  SET 
    status = 'completed',
    earned_amount = final_earned_amount,
    updated_at = now()
  WHERE id = p_stake_id;
  
  -- Return staked amount to user balance
  IF stake_rec.asset_symbol = 'USDT' THEN
    UPDATE balances
    SET usdt_balance = usdt_balance + stake_rec.staked_amount + final_earned_amount,
        updated_at = now()
    WHERE user_id = stake_rec.user_id;
  ELSIF stake_rec.asset_symbol = 'BTC' THEN
    UPDATE balances
    SET btc_balance = btc_balance + stake_rec.staked_amount + final_earned_amount,
        updated_at = now()
    WHERE user_id = stake_rec.user_id;
  ELSE
    -- For other assets, update user_assets table
    INSERT INTO user_assets (user_id, asset_symbol, balance)
    VALUES (stake_rec.user_id, stake_rec.asset_symbol, stake_rec.staked_amount + final_earned_amount)
    ON CONFLICT (user_id, asset_symbol)
    DO UPDATE SET 
      balance = user_assets.balance + stake_rec.staked_amount + final_earned_amount,
      updated_at = now();
  END IF;
  
  -- Create transaction record for staking return (original amount)
  INSERT INTO transactions (
    user_id,
    type,
    amount,
    description,
    status
  ) VALUES (
    stake_rec.user_id,
    'staking_return',
    stake_rec.staked_amount,
    'Claimed staked ' || stake_rec.asset_symbol || ' (matured)',
    'completed'
  );
  
  -- Create transaction record for staking profit (earnings)
  IF final_earned_amount > 0 THEN
    INSERT INTO transactions (
      user_id,
      type,
      amount,
      description,
      status
    ) VALUES (
      stake_rec.user_id,
      'staking_profit',
      final_earned_amount,
      'Staking rewards for ' || stake_rec.asset_symbol || ' (' || stake_rec.apy_rate || '% APY)',
      'completed'
    );
  END IF;
  
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  -- Log error details
  INSERT INTO system_logs (action, details)
  VALUES (
    'stake_claim_error',
    'Error claiming stake ' || p_stake_id || ': ' || SQLERRM
  );
  
  RETURN false;
END;
$$ LANGUAGE plpgsql;