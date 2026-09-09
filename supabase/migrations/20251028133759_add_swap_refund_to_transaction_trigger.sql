/*
  # Add Swap Refund to Transaction Trigger

  1. Changes
    - Update handle_transaction_balance_update function to recognize 'swap_refund' type
    - Swap refund transactions ADD to user balance
    
  2. Notes
    - Swap refunds return overcharged fees to users
*/

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
    WHEN 'deposit', 'robot_profit', 'binary_trade', 'staking_profit', 'staking_return', 'challenge_reward', 'nowpayments_deposit', 'swap_refund' THEN
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
      NULL;
      
    -- Wheel bonus doesn't affect balance here (already handled by update_user_balance RPC)
    WHEN 'wheel_bonus' THEN
      NULL;
      
    ELSE
      -- Raise exception for unknown transaction types
      RAISE EXCEPTION 'Unknown transaction type: %', NEW.type;
  END CASE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;