/*
  # Reset Demo Account on Deposit

  1. New Functions
    - `reset_demo_user_account` - Resets a demo user's account to a fresh state with the specified deposit amount
    - `handle_demo_user_deposit` - Trigger function that checks if a deposit is for a demo user and calls the reset function

  2. New Triggers
    - `reset_demo_account_on_deposit_trigger` - Fires after a deposit transaction is inserted
*/

-- Function to reset a demo user's account to a fresh state
CREATE OR REPLACE FUNCTION reset_demo_user_account(p_user_id UUID, p_initial_deposit_amount NUMERIC)
RETURNS VOID AS $$
DECLARE
    v_is_demo BOOLEAN;
    v_transaction_id UUID;
BEGIN
    -- Check if the user is a demo user
    SELECT is_demo INTO v_is_demo FROM users WHERE id = p_user_id;
    
    IF v_is_demo IS NOT TRUE THEN
        RAISE EXCEPTION 'Cannot reset account for non-demo user';
    END IF;
    
    -- Log the reset operation
    INSERT INTO system_logs (action, details)
    VALUES ('demo_account_reset', format('Resetting demo account for user %s with initial deposit %s', p_user_id, p_initial_deposit_amount));
    
    -- Delete all user data from various tables
    -- 2FA data
    DELETE FROM user_2fa WHERE user_id = p_user_id;
    
    -- User notes
    DELETE FROM user_notes WHERE user_id = p_user_id OR admin_id = p_user_id;
    
    -- Trading logs
    DELETE FROM trading_logs WHERE user_id = p_user_id;
    
    -- Robot state
    DELETE FROM robot_states WHERE user_id = p_user_id;
    
    -- Binary trades
    DELETE FROM binary_trades WHERE user_id = p_user_id;
    
    -- Futures positions and orders
    DELETE FROM futures_positions WHERE user_id = p_user_id;
    DELETE FROM futures_orders WHERE user_id = p_user_id;
    
    -- Spot orders
    DELETE FROM spot_orders WHERE user_id = p_user_id;
    
    -- User assets
    DELETE FROM user_assets WHERE user_id = p_user_id;
    
    -- Transactions (keep the current deposit)
    DELETE FROM transactions WHERE user_id = p_user_id;
    
    -- Bank details
    DELETE FROM client_bank_details WHERE user_id = p_user_id;
    
    -- Prop firm data
    DELETE FROM prop_positions WHERE user_id = p_user_id;
    DELETE FROM prop_orders WHERE user_id = p_user_id;
    DELETE FROM prop_position_history WHERE user_id = p_user_id;
    DELETE FROM prop_account_balances WHERE user_id = p_user_id;
    DELETE FROM prop_logs WHERE user_id = p_user_id;
    
    -- Event bets
    DELETE FROM event_bets WHERE user_id = p_user_id;
    
    -- Notifications
    DELETE FROM notifications WHERE user_id = p_user_id;
    
    -- Portfolio snapshots
    DELETE FROM portfolio_snapshots WHERE user_id = p_user_id;
    
    -- User stakes
    DELETE FROM user_stakes WHERE user_id = p_user_id;
    
    -- Admin action logs
    DELETE FROM admin_action_logs WHERE admin_user_id = p_user_id OR target_user_id = p_user_id;
    
    -- Reset balances
    UPDATE balances
    SET usdt_balance = p_initial_deposit_amount,
        btc_balance = 0,
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    -- Reset user profile data
    UPDATE users
    SET kyc_status = 'not_verified',
        first_name = NULL,
        last_name = NULL,
        country = NULL,
        document_id_url = NULL,
        document_selfie_url = NULL,
        updated_at = NOW()
    WHERE id = p_user_id;
    
    -- Create a transaction record for the initial deposit
    INSERT INTO transactions (
        user_id,
        type,
        amount,
        description,
        status
    ) VALUES (
        p_user_id,
        'deposit',
        p_initial_deposit_amount,
        'Initial demo account funding',
        'completed'
    ) RETURNING id INTO v_transaction_id;
    
    -- Log completion
    INSERT INTO system_logs (action, details)
    VALUES ('demo_account_reset_complete', format('Demo account reset completed for user %s. New transaction ID: %s', p_user_id, v_transaction_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function to handle deposits for demo users
CREATE OR REPLACE FUNCTION handle_demo_user_deposit()
RETURNS TRIGGER AS $$
DECLARE
    v_is_demo BOOLEAN;
BEGIN
    -- Only process deposit transactions
    IF NEW.type != 'deposit' THEN
        RETURN NEW;
    END IF;
    
    -- Check if the user is a demo user
    SELECT is_demo INTO v_is_demo FROM users WHERE id = NEW.user_id;
    
    -- If this is a demo user making a deposit, reset their account
    IF v_is_demo IS TRUE THEN
        -- Log that we're about to reset the demo account
        INSERT INTO system_logs (action, details)
        VALUES ('demo_deposit_detected', format('Demo user %s made a deposit of %s. Triggering account reset.', NEW.user_id, NEW.amount));
        
        -- Call the reset function with the deposit amount
        PERFORM reset_demo_user_account(NEW.user_id, NEW.amount);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger on the transactions table
DROP TRIGGER IF EXISTS reset_demo_account_on_deposit_trigger ON transactions;
CREATE TRIGGER reset_demo_account_on_deposit_trigger
AFTER INSERT ON transactions
FOR EACH ROW
EXECUTE FUNCTION handle_demo_user_deposit();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION reset_demo_user_account(UUID, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION handle_demo_user_deposit() TO service_role;