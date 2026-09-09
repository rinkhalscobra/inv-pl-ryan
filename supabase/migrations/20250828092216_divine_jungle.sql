/*
  # Fix transaction balance update trigger

  1. Updates
    - Fix handle_transaction_balance_update function to properly handle all transaction types
    - Ensure withdrawals subtract from balance and deposits add to balance
    - Add proper error handling for unknown transaction types

  2. Security
    - Maintains existing RLS policies
    - Adds validation for transaction types
*/

-- Drop and recreate the handle_transaction_balance_update function with proper logic
CREATE OR REPLACE FUNCTION handle_transaction_balance_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process completed transactions
  IF NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;

  -- Handle different transaction types
  CASE NEW.type
    -- Types that ADD to balance
    WHEN 'deposit', 'robot_profit', 'binary_trade', 'staking_profit', 'staking_return', 'challenge_reward', 'nowpayments_deposit' THEN
      UPDATE balances 
      SET usdt_balance = usdt_balance + NEW.amount,
          updated_at = now()
      WHERE user_id = NEW.user_id;
      
    -- Types that SUBTRACT from balance  
    WHEN 'withdrawal', 'challenge_fee', 'stake' THEN
      UPDATE balances 
      SET usdt_balance = usdt_balance - NEW.amount,
          updated_at = now()
      WHERE user_id = NEW.user_id;
      
    -- Trade type doesn't affect balance (handled separately)
    WHEN 'trade' THEN
      -- No balance update needed for trades
      NULL;
      
    ELSE
      -- Raise exception for unknown transaction types
      RAISE EXCEPTION 'Unknown transaction type: %', NEW.type;
  END CASE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;