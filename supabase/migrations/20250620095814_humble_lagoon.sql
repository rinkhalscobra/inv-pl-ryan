/*
  # Add Staking Functions

  1. New Functions
    - `process_stake_completion` - Process completed stakes and update user balances
    
  2. Features
    - Transaction support to ensure atomicity
    - Proper error handling
    - Automatic transaction recording
*/

-- Create function to process stake completion in a transaction
CREATE OR REPLACE FUNCTION process_stake_completion(stake_id uuid, earned_amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stake_record record;
  user_balance record;
BEGIN
  -- Get stake details
  SELECT * INTO stake_record
  FROM user_stakes
  WHERE id = stake_id AND status = 'active';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stake not found or not active';
  END IF;
  
  -- Get user balance
  SELECT * INTO user_balance
  FROM balances
  WHERE user_id = stake_record.user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User balance not found';
  END IF;
  
  -- Update stake status and earned amount
  UPDATE user_stakes
  SET 
    status = 'completed',
    earned_amount = earned_amount,
    updated_at = now()
  WHERE id = stake_id;
  
  -- Update user balance based on asset
  IF stake_record.asset_symbol = 'USDT' THEN
    UPDATE balances
    SET 
      usdt_balance = usdt_balance + stake_record.staked_amount + earned_amount,
      updated_at = now()
    WHERE user_id = stake_record.user_id;
  ELSIF stake_record.asset_symbol = 'BTC' THEN
    UPDATE balances
    SET 
      btc_balance = btc_balance + stake_record.staked_amount + earned_amount,
      updated_at = now()
    WHERE user_id = stake_record.user_id;
  ELSE
    RAISE EXCEPTION 'Unsupported asset symbol: %', stake_record.asset_symbol;
  END IF;
  
  -- Add transaction record for staking profit
  INSERT INTO transactions (
    user_id,
    type,
    amount,
    description,
    status
  ) VALUES (
    stake_record.user_id,
    'staking_profit',
    earned_amount,
    'Staking profit for ' || stake_record.asset_symbol || ' (' || stake_record.apy_rate || '% APY)',
    'completed'
  );
  
  -- Add transaction record for returning staked amount
  INSERT INTO transactions (
    user_id,
    type,
    amount,
    description,
    status
  ) VALUES (
    stake_record.user_id,
    'staking_return',
    stake_record.staked_amount,
    'Returned staked ' || stake_record.asset_symbol,
    'completed'
  );
END;
$$;

-- Update transactions table to allow new transaction types
DO $$
BEGIN
  -- Check if the constraint exists
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'transactions_type_check'
  ) THEN
    -- Drop the existing constraint
    ALTER TABLE transactions DROP CONSTRAINT transactions_type_check;
  END IF;
  
  -- Add the new constraint with additional types
  ALTER TABLE transactions 
  ADD CONSTRAINT transactions_type_check 
  CHECK (type IN ('deposit', 'withdrawal', 'trade', 'robot_profit', 'binary_trade', 'stake', 'staking_profit', 'staking_return'));
END $$;