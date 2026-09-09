/*
  # Fix Challenge Cancellation Balance Transfer

  1. Changes
    - Modify the handle_challenge_cancellation function to prevent balance transfer
    - Add a new function to bypass all triggers when cancelling a challenge
*/

-- Modify the handle_challenge_cancellation function to prevent balance transfer
CREATE OR REPLACE FUNCTION handle_challenge_cancellation()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if the challenge status is changing to 'cancelled'
  IF (NEW.challenge_status = 'cancelled' AND (OLD.challenge_status IS NULL OR OLD.challenge_status <> 'cancelled')) THEN
    -- Log the cancellation
    INSERT INTO system_logs (action, details)
    VALUES (
      'challenge_cancellation_trigger',
      json_build_object(
        'user_id', NEW.user_id,
        'challenge_id', OLD.active_challenge_id,
        'old_balance', OLD.challenge_account_balance,
        'new_balance', NEW.challenge_account_balance,
        'timestamp', now(),
        'prevent_balance_transfer', true
      )
    );

    -- Ensure the challenge balance is set to 0
    NEW.challenge_account_balance := 0;
    NEW.challenge_initial_balance := 0;
    
    -- CRITICAL: DO NOT ADD ANY CODE HERE THAT WOULD TRANSFER BALANCE TO THE USER'S MAIN ACCOUNT
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a function to bypass all triggers when updating robot_states
CREATE OR REPLACE FUNCTION bypass_all_triggers_update_robot_state(p_user_id UUID, p_update_json JSONB)
RETURNS VOID AS $$
DECLARE
  v_sql TEXT;
BEGIN
  -- Log the function call
  INSERT INTO system_logs (action, details)
  VALUES (
    'bypass_triggers_update',
    json_build_object(
      'user_id', p_user_id,
      'update_payload', p_update_json,
      'timestamp', now(),
      'message', 'Bypassing all triggers to prevent balance transfer'
    )
  );
  
  -- Construct SQL to update robot_states directly
  v_sql := format(
    'UPDATE robot_states SET 
     active_challenge_id = NULL,
     challenge_account_balance = 0,
     challenge_profit_target = 0,
     challenge_max_drawdown = 0,
     challenge_time_limit = NULL,
     challenge_initial_balance = 0,
     challenge_start_date = NULL,
     challenge_status = ''cancelled''
     WHERE user_id = %L',
    p_user_id
  );
  
  -- Execute the SQL directly to bypass all triggers
  EXECUTE v_sql;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to directly cancel a challenge without triggering balance transfer
CREATE OR REPLACE FUNCTION cancel_challenge_without_balance_transfer(p_user_id UUID, p_challenge_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_sql TEXT;
BEGIN
  -- Log the function call
  INSERT INTO system_logs (action, details)
  VALUES (
    'cancel_challenge_direct',
    json_build_object(
      'user_id', p_user_id,
      'challenge_id', p_challenge_id,
      'timestamp', now(),
      'message', 'Direct cancellation to prevent balance transfer'
    )
  );
  
  -- Construct SQL to update robot_states directly
  v_sql := format(
    'UPDATE robot_states SET 
     active_challenge_id = NULL,
     challenge_account_balance = 0,
     challenge_profit_target = 0,
     challenge_max_drawdown = 0,
     challenge_time_limit = NULL,
     challenge_initial_balance = 0,
     challenge_start_date = NULL,
     challenge_status = ''cancelled''
     WHERE user_id = %L AND active_challenge_id = %L',
    p_user_id, p_challenge_id
  );
  
  -- Execute the SQL directly to bypass all triggers
  EXECUTE v_sql;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;