/*
  # Fix challenge cancellation balance transfer issue

  1. New Functions
    - `handle_challenge_cancellation` - Prevents automatic balance transfer on challenge cancellation
  
  2. Triggers
    - Add trigger to prevent automatic balance transfer on challenge cancellation
*/

-- Create a trigger function to handle challenge cancellation
CREATE OR REPLACE FUNCTION handle_challenge_cancellation() RETURNS TRIGGER AS $$
DECLARE
  v_log_count INTEGER;
  v_current_balance NUMERIC(20,8);
BEGIN
  -- Store the current balance for logging
  v_current_balance := OLD.challenge_account_balance;
  
  -- Log the trigger execution
  INSERT INTO system_logs (action, details)
  VALUES (
    'handle_challenge_cancellation_trigger',
    format('User ID: %s, Challenge ID: %s, Old Status: %s, New Status: %s, Balance: %s',
           NEW.user_id, OLD.active_challenge_id, OLD.challenge_status, NEW.challenge_status, v_current_balance)::TEXT
  );
  
  -- Check if there's a log entry indicating this is a user-initiated cancellation
  -- that should prevent balance transfer
  SELECT COUNT(*) INTO v_log_count
  FROM prop_logs
  WHERE user_id = NEW.user_id
    AND challenge_id = OLD.active_challenge_id
    AND action = 'challenge_cancellation_requested'
    AND (details->>'prevent_balance_transfer')::BOOLEAN = TRUE
    AND created_at > NOW() - INTERVAL '5 minutes';
  
  -- Log the check result
  INSERT INTO system_logs (action, details)
  VALUES (
    'challenge_cancellation_check',
    format('User ID: %s, Challenge ID: %s, Found prevention logs: %s',
           NEW.user_id, OLD.active_challenge_id, v_log_count)::TEXT
  );
  
  -- If we found a prevention log, ensure the balance is not transferred
  IF v_log_count > 0 THEN
    -- Log this special case
    INSERT INTO system_logs (action, details)
    VALUES (
      'challenge_cancellation_balance_transfer_prevented',
      format('User ID: %s, Challenge ID: %s, Balance: %s',
             NEW.user_id, OLD.active_challenge_id, v_current_balance)::TEXT
    );
    
    -- IMPORTANT: Ensure challenge balance is set to 0
    -- This is the key part that prevents the balance from being transferred
    NEW.challenge_account_balance := 0;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add the trigger to the robot_states table
DROP TRIGGER IF EXISTS handle_challenge_cancellation_trigger ON robot_states;
CREATE TRIGGER handle_challenge_cancellation_trigger
BEFORE UPDATE ON robot_states
FOR EACH ROW
WHEN ((NEW.challenge_status = 'cancelled') AND ((OLD.challenge_status IS NULL) OR (OLD.challenge_status <> 'cancelled')))
EXECUTE FUNCTION handle_challenge_cancellation();

-- Comment to explain what this trigger does
COMMENT ON FUNCTION handle_challenge_cancellation() IS 'Ensures that when a challenge is cancelled, the balance is not automatically transferred to the user''s main account';