/*
  # Fix Demo Account Balance Reset

  1. Changes
    - Modifies the handle_demo_user_deposit function to properly reset the balance
    - Ensures the balance is set to the deposit amount, not added to existing balance
    - Adds more detailed logging for troubleshooting
  
  2. Security
    - No changes to security policies
*/

-- Log the migration execution
INSERT INTO system_logs (action, details) 
VALUES ('migration_executed', 'Executing fix_demo_account_balance_reset migration');

-- Drop the existing trigger first
DROP TRIGGER IF EXISTS reset_demo_account_on_deposit_trigger ON transactions;

-- Drop the existing function
DROP FUNCTION IF EXISTS handle_demo_user_deposit();

-- Create an improved function that properly resets the balance
CREATE OR REPLACE FUNCTION handle_demo_user_deposit()
RETURNS TRIGGER AS $$
DECLARE
  is_demo_user BOOLEAN;
  user_id_var UUID;
BEGIN
  -- Get the user ID from the transaction
  user_id_var := NEW.user_id;
  
  -- Check if this is a demo user
  SELECT is_demo INTO is_demo_user FROM users WHERE id = user_id_var;
  
  -- Log the check
  INSERT INTO system_logs (action, details) 
  VALUES ('demo_deposit_check', json_build_object(
    'user_id', user_id_var,
    'is_demo', is_demo_user,
    'transaction_id', NEW.id,
    'amount', NEW.amount,
    'type', NEW.type,
    'status', NEW.status
  ));
  
  -- Only proceed if this is a demo user
  IF is_demo_user = TRUE THEN
    -- Log the start of the demo account reset
    INSERT INTO system_logs (action, details) 
    VALUES ('demo_account_reset_started', json_build_object(
      'user_id', user_id_var,
      'transaction_id', NEW.id,
      'amount', NEW.amount
    ));
    
    -- Update user to non-demo
    UPDATE users SET is_demo = FALSE WHERE id = user_id_var;
    
    -- Reset balances - SET the balance to the deposit amount, not add to it
    UPDATE balances 
    SET 
      usdt_balance = NEW.amount,
      btc_balance = 0
    WHERE user_id = user_id_var;
    
    -- Delete all user's futures positions
    DELETE FROM futures_positions WHERE user_id = user_id_var;
    
    -- Delete all user's futures orders
    DELETE FROM futures_orders WHERE user_id = user_id_var;
    
    -- Delete all user's spot orders
    DELETE FROM spot_orders WHERE user_id = user_id_var;
    
    -- Delete all user's order book entries
    DELETE FROM order_book WHERE user_id = user_id_var;
    
    -- Delete all user's stop orders
    DELETE FROM stop_orders WHERE user_id = user_id_var;
    
    -- Delete all user's order fills
    DELETE FROM order_fills WHERE user_id = user_id_var;
    
    -- Delete all user's binary trades
    DELETE FROM binary_trades WHERE user_id = user_id_var;
    
    -- Delete all user's event bets
    DELETE FROM event_bets WHERE user_id = user_id_var;
    
    -- Delete all user's transactions except the current deposit
    DELETE FROM transactions 
    WHERE user_id = user_id_var 
    AND id != NEW.id;
    
    -- Reset robot state if it exists
    UPDATE robot_states 
    SET 
      is_active = FALSE,
      allocated_balance = 0,
      todays_profit = 0,
      total_trades = 0,
      successful_trades = 0
    WHERE user_id = user_id_var;
    
    -- Delete all user's prop positions
    DELETE FROM prop_positions WHERE user_id = user_id_var;
    
    -- Delete all user's prop orders
    DELETE FROM prop_orders WHERE user_id = user_id_var;
    
    -- Delete all user's stakes
    DELETE FROM user_stakes WHERE user_id = user_id_var;
    
    -- Delete all user's assets except USDT and BTC
    DELETE FROM user_assets 
    WHERE user_id = user_id_var 
    AND asset_symbol NOT IN ('USDT', 'BTC');
    
    -- Log the completion of the demo account reset
    INSERT INTO system_logs (action, details) 
    VALUES ('demo_account_reset_completed', json_build_object(
      'user_id', user_id_var,
      'transaction_id', NEW.id,
      'new_balance', NEW.amount
    ));
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger with the WHEN condition for successful deposits only
CREATE TRIGGER reset_demo_account_on_deposit_trigger
AFTER INSERT ON transactions
FOR EACH ROW
WHEN (NEW.type = 'deposit' AND NEW.status = 'completed')
EXECUTE FUNCTION handle_demo_user_deposit();

-- Log the completion of the migration
INSERT INTO system_logs (action, details) 
VALUES ('migration_completed', 'Successfully completed fix_demo_account_balance_reset migration');