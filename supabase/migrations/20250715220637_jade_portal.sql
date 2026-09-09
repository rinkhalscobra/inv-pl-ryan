/*
  # Update Demo Status on Deposit

  1. Changes
     - Modifies the handle_demo_user_deposit function to update is_demo to false when a deposit is made
     - Adds additional error handling and logging
*/

-- Drop the existing trigger if it exists
DROP TRIGGER IF EXISTS reset_demo_account_on_deposit_trigger ON public.transactions;

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS public.handle_demo_user_deposit();

-- Create an improved function that both resets the account and changes demo status
CREATE OR REPLACE FUNCTION public.handle_demo_user_deposit()
RETURNS TRIGGER AS $$
DECLARE
  v_is_demo BOOLEAN;
  v_user_id UUID;
  v_amount NUMERIC;
  v_log_message TEXT;
BEGIN
  -- Get the user ID from the new transaction
  v_user_id := NEW.user_id;
  v_amount := NEW.amount;
  
  -- Check if this is a deposit transaction
  IF NEW.type != 'deposit' THEN
    RETURN NEW;
  END IF;
  
  -- Log the deposit
  INSERT INTO public.system_logs(action, details)
  VALUES ('deposit_detected', format('User ID: %s, Amount: %s, Transaction ID: %s', 
                                    v_user_id, v_amount, NEW.id));
  
  -- Check if the user is a demo user
  SELECT is_demo INTO v_is_demo
  FROM public.users
  WHERE id = v_user_id;
  
  -- If not a demo user or is_demo is null, just return
  IF v_is_demo IS NULL OR v_is_demo = FALSE THEN
    RETURN NEW;
  END IF;
  
  -- Log that we found a demo user
  INSERT INTO public.system_logs(action, details)
  VALUES ('demo_user_deposit', format('Demo user %s made a deposit of %s', v_user_id, v_amount));
  
  BEGIN
    -- Update the user's demo status to false (convert to live account)
    UPDATE public.users
    SET is_demo = FALSE
    WHERE id = v_user_id;
    
    -- Log the status change
    INSERT INTO public.system_logs(action, details)
    VALUES ('demo_user_converted', format('User %s converted from demo to live account', v_user_id));
    
    -- Reset the account by deleting data from various tables
    -- We'll use separate try-catch blocks for each table to prevent one failure from stopping others
    
    -- Delete from user_2fa
    BEGIN
      DELETE FROM public.user_2fa WHERE user_id = v_user_id;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.system_logs(action, details)
        VALUES ('reset_error', format('Error deleting from user_2fa for user %s: %s', v_user_id, SQLERRM));
    END;
    
    -- Delete from trading_logs
    BEGIN
      DELETE FROM public.trading_logs WHERE user_id = v_user_id;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.system_logs(action, details)
        VALUES ('reset_error', format('Error deleting from trading_logs for user %s: %s', v_user_id, SQLERRM));
    END;
    
    -- Delete from binary_trades
    BEGIN
      DELETE FROM public.binary_trades WHERE user_id = v_user_id;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.system_logs(action, details)
        VALUES ('reset_error', format('Error deleting from binary_trades for user %s: %s', v_user_id, SQLERRM));
    END;
    
    -- Delete from futures_positions
    BEGIN
      DELETE FROM public.futures_positions WHERE user_id = v_user_id;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.system_logs(action, details)
        VALUES ('reset_error', format('Error deleting from futures_positions for user %s: %s', v_user_id, SQLERRM));
    END;
    
    -- Delete from futures_orders
    BEGIN
      DELETE FROM public.futures_orders WHERE user_id = v_user_id;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.system_logs(action, details)
        VALUES ('reset_error', format('Error deleting from futures_orders for user %s: %s', v_user_id, SQLERRM));
    END;
    
    -- Delete from spot_orders
    BEGIN
      DELETE FROM public.spot_orders WHERE user_id = v_user_id;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.system_logs(action, details)
        VALUES ('reset_error', format('Error deleting from spot_orders for user %s: %s', v_user_id, SQLERRM));
    END;
    
    -- Delete from order_book
    BEGIN
      DELETE FROM public.order_book WHERE user_id = v_user_id;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.system_logs(action, details)
        VALUES ('reset_error', format('Error deleting from order_book for user %s: %s', v_user_id, SQLERRM));
    END;
    
    -- Delete from stop_orders
    BEGIN
      DELETE FROM public.stop_orders WHERE user_id = v_user_id;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.system_logs(action, details)
        VALUES ('reset_error', format('Error deleting from stop_orders for user %s: %s', v_user_id, SQLERRM));
    END;
    
    -- Delete from user_assets
    BEGIN
      DELETE FROM public.user_assets WHERE user_id = v_user_id;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.system_logs(action, details)
        VALUES ('reset_error', format('Error deleting from user_assets for user %s: %s', v_user_id, SQLERRM));
    END;
    
    -- Delete from transactions (except the current one)
    BEGIN
      DELETE FROM public.transactions 
      WHERE user_id = v_user_id AND id != NEW.id;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.system_logs(action, details)
        VALUES ('reset_error', format('Error deleting from transactions for user %s: %s', v_user_id, SQLERRM));
    END;
    
    -- Delete from robot_states
    BEGIN
      DELETE FROM public.robot_states WHERE user_id = v_user_id;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.system_logs(action, details)
        VALUES ('reset_error', format('Error deleting from robot_states for user %s: %s', v_user_id, SQLERRM));
    END;
    
    -- Delete from prop_positions
    BEGIN
      DELETE FROM public.prop_positions WHERE user_id = v_user_id;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.system_logs(action, details)
        VALUES ('reset_error', format('Error deleting from prop_positions for user %s: %s', v_user_id, SQLERRM));
    END;
    
    -- Delete from prop_orders
    BEGIN
      DELETE FROM public.prop_orders WHERE user_id = v_user_id;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.system_logs(action, details)
        VALUES ('reset_error', format('Error deleting from prop_orders for user %s: %s', v_user_id, SQLERRM));
    END;
    
    -- Delete from prop_position_history
    BEGIN
      DELETE FROM public.prop_position_history WHERE user_id = v_user_id;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.system_logs(action, details)
        VALUES ('reset_error', format('Error deleting from prop_position_history for user %s: %s', v_user_id, SQLERRM));
    END;
    
    -- Delete from prop_account_balances
    BEGIN
      DELETE FROM public.prop_account_balances WHERE user_id = v_user_id;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.system_logs(action, details)
        VALUES ('reset_error', format('Error deleting from prop_account_balances for user %s: %s', v_user_id, SQLERRM));
    END;
    
    -- Delete from prop_logs
    BEGIN
      DELETE FROM public.prop_logs WHERE user_id = v_user_id;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.system_logs(action, details)
        VALUES ('reset_error', format('Error deleting from prop_logs for user %s: %s', v_user_id, SQLERRM));
    END;
    
    -- Delete from event_bets
    BEGIN
      DELETE FROM public.event_bets WHERE user_id = v_user_id;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.system_logs(action, details)
        VALUES ('reset_error', format('Error deleting from event_bets for user %s: %s', v_user_id, SQLERRM));
    END;
    
    -- Delete from notifications
    BEGIN
      DELETE FROM public.notifications WHERE user_id = v_user_id;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.system_logs(action, details)
        VALUES ('reset_error', format('Error deleting from notifications for user %s: %s', v_user_id, SQLERRM));
    END;
    
    -- Delete from portfolio_snapshots
    BEGIN
      DELETE FROM public.portfolio_snapshots WHERE user_id = v_user_id;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.system_logs(action, details)
        VALUES ('reset_error', format('Error deleting from portfolio_snapshots for user %s: %s', v_user_id, SQLERRM));
    END;
    
    -- Delete from user_stakes
    BEGIN
      DELETE FROM public.user_stakes WHERE user_id = v_user_id;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.system_logs(action, details)
        VALUES ('reset_error', format('Error deleting from user_stakes for user %s: %s', v_user_id, SQLERRM));
    END;
    
    -- Update balances
    UPDATE public.balances
    SET usdt_balance = v_amount,
        btc_balance = 0
    WHERE user_id = v_user_id;
    
    -- Log the successful reset
    INSERT INTO public.system_logs(action, details)
    VALUES ('demo_account_reset', format('Demo account for user %s has been reset with balance %s', v_user_id, v_amount));
    
    EXCEPTION WHEN OTHERS THEN
      -- Log any errors that occurred during the reset process
      INSERT INTO public.system_logs(action, details)
      VALUES ('demo_reset_failed', format('Failed to reset demo account for user %s: %s', v_user_id, SQLERRM));
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER reset_demo_account_on_deposit_trigger
AFTER INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.handle_demo_user_deposit();

-- Log that the migration was applied
INSERT INTO public.system_logs(action, details)
VALUES ('migration_applied', 'Updated handle_demo_user_deposit function to convert demo accounts to live accounts on deposit');