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
  CHECK (type IN ('deposit', 'withdrawal', 'trade', 'robot_profit', 'binary_trade', 'stake', 'staking_profit', 'staking_return', 'challenge_fee', 'challenge_reward'));
END $$;