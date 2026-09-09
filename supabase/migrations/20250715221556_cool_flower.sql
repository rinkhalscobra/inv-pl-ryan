/*
  # Update Demo Deposit Trigger Function

  1. Changes
     - Modify handle_demo_user_deposit function to set balance to exactly the deposit amount
     - Add detailed logging for debugging
     - Ensure proper error handling
     - Fix transaction handling to prevent stack depth issues
*/

-- Drop the existing trigger first
DROP TRIGGER IF EXISTS reset_demo_account_on_deposit_trigger ON public.transactions;

-- Drop the existing function
DROP FUNCTION IF EXISTS public.handle_demo_user_deposit();

-- Create the improved function
CREATE OR REPLACE FUNCTION public.handle_demo_user_deposit()
RETURNS TRIGGER AS $$
DECLARE
  is_user_demo BOOLEAN;
  user_id_val UUID;
  current_balance NUMERIC;
  deposit_amount NUMERIC;
BEGIN
  -- Get the user ID from the transaction
  user_id_val := NEW.user_id;
  deposit_amount := NEW.amount;
  
  -- Log the start of function execution
  RAISE LOG 'handle_demo_user_deposit: Processing deposit of % for user %', deposit_amount, user_id_val;

  -- Check if the user is a demo user
  SELECT is_demo INTO is_user_demo FROM public.users WHERE id = user_id_val;
  
  -- Log the demo status
  RAISE LOG 'handle_demo_user_deposit: User % is_demo status: %', user_id_val, is_user_demo;

  -- Only proceed if this is a demo user
  IF is_user_demo = TRUE THEN
    -- Log that we're converting the demo account
    RAISE LOG 'handle_demo_user_deposit: Converting demo account to live for user %', user_id_val;
    
    -- Get current balance for logging
    SELECT usdt_balance INTO current_balance FROM public.balances WHERE user_id = user_id_val;
    RAISE LOG 'handle_demo_user_deposit: Current balance: %, Setting to deposit amount: %', current_balance, deposit_amount;

    -- Update user to no longer be a demo user
    UPDATE public.users
    SET is_demo = FALSE
    WHERE id = user_id_val;
    
    -- Reset the user's balance to EXACTLY the deposit amount (not adding to existing balance)
    UPDATE public.balances
    SET usdt_balance = deposit_amount,
        btc_balance = 0
    WHERE user_id = user_id_val;
    
    -- Delete all existing transactions for this user
    DELETE FROM public.transactions
    WHERE user_id = user_id_val
    AND id != NEW.id; -- Keep the current deposit transaction
    
    -- Delete all futures positions
    DELETE FROM public.futures_positions
    WHERE user_id = user_id_val;
    
    -- Delete all futures orders
    DELETE FROM public.futures_orders
    WHERE user_id = user_id_val;
    
    -- Delete all binary trades
    DELETE FROM public.binary_trades
    WHERE user_id = user_id_val;
    
    -- Delete all spot orders
    DELETE FROM public.spot_orders
    WHERE user_id = user_id_val;
    
    -- Delete all order book entries
    DELETE FROM public.order_book
    WHERE user_id = user_id_val;
    
    -- Delete all stop orders
    DELETE FROM public.stop_orders
    WHERE user_id = user_id_val;
    
    -- Delete all user stakes
    DELETE FROM public.user_stakes
    WHERE user_id = user_id_val;
    
    -- Delete all event bets
    DELETE FROM public.event_bets
    WHERE user_id = user_id_val;
    
    -- Reset robot state if it exists
    UPDATE public.robot_states
    SET 
      is_active = FALSE,
      allocated_balance = 0,
      todays_profit = 0,
      total_trades = 0,
      successful_trades = 0,
      active_challenge_id = NULL,
      challenge_account_balance = 0,
      challenge_profit_target = 0,
      challenge_max_drawdown = 0,
      challenge_time_limit = NULL,
      challenge_initial_balance = 0,
      challenge_start_date = NULL,
      challenge_status = NULL
    WHERE user_id = user_id_val;
    
    -- Log the completion of the conversion
    RAISE LOG 'handle_demo_user_deposit: Successfully converted demo account to live for user %', user_id_val;
    
    -- Add a system log entry
    INSERT INTO public.system_logs (action, details)
    VALUES (
      'demo_account_converted',
      format('User %s converted from demo to live account with deposit of %s', user_id_val, deposit_amount)
    );
  ELSE
    -- Log that this is not a demo user, so no action taken
    RAISE LOG 'handle_demo_user_deposit: User % is not a demo user, no action taken', user_id_val;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log any errors that occur
  RAISE LOG 'handle_demo_user_deposit: Error converting demo account: %', SQLERRM;
  
  -- Add error to system logs
  INSERT INTO public.system_logs (action, details)
  VALUES (
    'demo_account_conversion_error',
    format('Error converting user %s from demo to live: %s', user_id_val, SQLERRM)
  );
  
  -- Continue with the transaction
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger that runs AFTER INSERT on transactions
CREATE TRIGGER reset_demo_account_on_deposit_trigger
AFTER INSERT ON public.transactions
FOR EACH ROW
WHEN (NEW.type = 'deposit' AND NEW.status = 'completed')
EXECUTE FUNCTION public.handle_demo_user_deposit();

-- Add a log entry for this migration
INSERT INTO public.system_logs (action, details)
VALUES (
  'migration_executed',
  'Updated handle_demo_user_deposit function to set balance to exactly the deposit amount'
);