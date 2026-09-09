/*
  # Fix stack depth limit error in demo user deposit trigger

  1. Changes
    - Modify the handle_demo_user_deposit trigger function to prevent recursion
    - Add safeguards to prevent infinite loops
    - Improve error handling
*/

-- Drop the existing trigger first to avoid conflicts
DROP TRIGGER IF EXISTS reset_demo_account_on_deposit_trigger ON public.transactions;

-- Create an improved version of the trigger function
CREATE OR REPLACE FUNCTION public.handle_demo_user_deposit()
RETURNS TRIGGER AS $$
DECLARE
  v_is_demo BOOLEAN;
  v_user_id UUID;
  v_deposit_amount NUMERIC;
  v_transaction_type TEXT;
BEGIN
  -- Get the transaction type
  v_transaction_type := NEW.type;
  
  -- Only proceed for deposit transactions
  IF v_transaction_type <> 'deposit' THEN
    RETURN NEW;
  END IF;
  
  -- Get user_id and deposit amount
  v_user_id := NEW.user_id;
  v_deposit_amount := NEW.amount;
  
  -- Check if this is a demo user
  SELECT is_demo INTO v_is_demo
  FROM public.users
  WHERE id = v_user_id;
  
  -- Only proceed for demo users
  IF v_is_demo IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  
  -- Add a safeguard to prevent recursion
  -- Check if this transaction was created by the trigger itself
  IF NEW.description LIKE 'Initial demo account funding%' THEN
    RETURN NEW;
  END IF;
  
  -- Log the reset operation
  INSERT INTO public.system_logs (action, details)
  VALUES ('demo_account_reset', format('Resetting demo account for user %s with deposit amount %s', v_user_id, v_deposit_amount));
  
  -- Delete user data from all relevant tables
  -- Use separate DELETE statements with error handling to prevent cascading failures
  
  BEGIN
    DELETE FROM public.user_2fa WHERE user_id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
      -- Log error but continue
      INSERT INTO public.system_logs (action, details)
      VALUES ('demo_reset_error', format('Error deleting from user_2fa: %s', SQLERRM));
  END;
  
  BEGIN
    DELETE FROM public.user_notes WHERE user_id = v_user_id OR admin_id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (action, details)
      VALUES ('demo_reset_error', format('Error deleting from user_notes: %s', SQLERRM));
  END;
  
  BEGIN
    DELETE FROM public.trading_logs WHERE user_id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (action, details)
      VALUES ('demo_reset_error', format('Error deleting from trading_logs: %s', SQLERRM));
  END;
  
  BEGIN
    DELETE FROM public.binary_trades WHERE user_id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (action, details)
      VALUES ('demo_reset_error', format('Error deleting from binary_trades: %s', SQLERRM));
  END;
  
  BEGIN
    DELETE FROM public.futures_positions WHERE user_id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (action, details)
      VALUES ('demo_reset_error', format('Error deleting from futures_positions: %s', SQLERRM));
  END;
  
  BEGIN
    DELETE FROM public.futures_orders WHERE user_id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (action, details)
      VALUES ('demo_reset_error', format('Error deleting from futures_orders: %s', SQLERRM));
  END;
  
  BEGIN
    DELETE FROM public.spot_orders WHERE user_id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (action, details)
      VALUES ('demo_reset_error', format('Error deleting from spot_orders: %s', SQLERRM));
  END;
  
  BEGIN
    DELETE FROM public.user_assets WHERE user_id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (action, details)
      VALUES ('demo_reset_error', format('Error deleting from user_assets: %s', SQLERRM));
  END;
  
  BEGIN
    DELETE FROM public.transactions WHERE user_id = v_user_id AND id <> NEW.id;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (action, details)
      VALUES ('demo_reset_error', format('Error deleting from transactions: %s', SQLERRM));
  END;
  
  BEGIN
    DELETE FROM public.client_bank_details WHERE user_id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (action, details)
      VALUES ('demo_reset_error', format('Error deleting from client_bank_details: %s', SQLERRM));
  END;
  
  BEGIN
    DELETE FROM public.prop_positions WHERE user_id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (action, details)
      VALUES ('demo_reset_error', format('Error deleting from prop_positions: %s', SQLERRM));
  END;
  
  BEGIN
    DELETE FROM public.prop_orders WHERE user_id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (action, details)
      VALUES ('demo_reset_error', format('Error deleting from prop_orders: %s', SQLERRM));
  END;
  
  BEGIN
    DELETE FROM public.prop_position_history WHERE user_id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (action, details)
      VALUES ('demo_reset_error', format('Error deleting from prop_position_history: %s', SQLERRM));
  END;
  
  BEGIN
    DELETE FROM public.prop_account_balances WHERE user_id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (action, details)
      VALUES ('demo_reset_error', format('Error deleting from prop_account_balances: %s', SQLERRM));
  END;
  
  BEGIN
    DELETE FROM public.prop_logs WHERE user_id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (action, details)
      VALUES ('demo_reset_error', format('Error deleting from prop_logs: %s', SQLERRM));
  END;
  
  BEGIN
    DELETE FROM public.event_bets WHERE user_id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (action, details)
      VALUES ('demo_reset_error', format('Error deleting from event_bets: %s', SQLERRM));
  END;
  
  BEGIN
    DELETE FROM public.notifications WHERE user_id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (action, details)
      VALUES ('demo_reset_error', format('Error deleting from notifications: %s', SQLERRM));
  END;
  
  BEGIN
    DELETE FROM public.portfolio_snapshots WHERE user_id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (action, details)
      VALUES ('demo_reset_error', format('Error deleting from portfolio_snapshots: %s', SQLERRM));
  END;
  
  BEGIN
    DELETE FROM public.user_stakes WHERE user_id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (action, details)
      VALUES ('demo_reset_error', format('Error deleting from user_stakes: %s', SQLERRM));
  END;
  
  -- Reset robot state
  BEGIN
    UPDATE public.robot_states
    SET 
      is_active = false,
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
      challenge_status = 'active'
    WHERE user_id = v_user_id;
    
    -- If no robot state exists, create one
    IF NOT FOUND THEN
      INSERT INTO public.robot_states (
        user_id, is_active, strategy, min_profit_threshold, max_trade_amount,
        allocated_balance, todays_profit, total_trades, successful_trades
      )
      VALUES (
        v_user_id, false, 'triangular', 0.5, 1000,
        0, 0, 0, 0
      );
    END IF;
    
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (action, details)
      VALUES ('demo_reset_error', format('Error resetting robot_states: %s', SQLERRM));
  END;
  
  -- Reset balances
  BEGIN
    UPDATE public.balances
    SET 
      usdt_balance = v_deposit_amount,
      btc_balance = 0
    WHERE user_id = v_user_id;
    
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (action, details)
      VALUES ('demo_reset_error', format('Error updating balances: %s', SQLERRM));
  END;
  
  -- Log completion
  INSERT INTO public.system_logs (action, details)
  VALUES ('demo_account_reset_complete', format('Demo account reset completed for user %s with deposit amount %s', v_user_id, v_deposit_amount));
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER reset_demo_account_on_deposit_trigger
AFTER INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.handle_demo_user_deposit();

-- Log that the migration was applied
INSERT INTO public.system_logs (action, details)
VALUES ('migration_applied', 'Fixed stack depth limit error in demo user deposit trigger');