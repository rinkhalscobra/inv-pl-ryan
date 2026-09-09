/*
  # Fix challenge cancellation balance transfer issue

  1. Changes
    - Add a trigger to prevent automatic balance transfer when a challenge is cancelled
    - Add a function to handle challenge cancellation properly
*/

-- Create a function to handle challenge cancellation properly
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
        'timestamp', now()
      )
    );
    
    -- Ensure the challenge balance is set to 0
    NEW.challenge_account_balance := 0;
    NEW.challenge_initial_balance := 0;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to handle challenge cancellation
DROP TRIGGER IF EXISTS handle_challenge_cancellation_trigger ON robot_states;
CREATE TRIGGER handle_challenge_cancellation_trigger
BEFORE UPDATE ON robot_states
FOR EACH ROW
WHEN (NEW.challenge_status = 'cancelled' AND (OLD.challenge_status IS NULL OR OLD.challenge_status <> 'cancelled'))
EXECUTE FUNCTION handle_challenge_cancellation();

-- Add a comment to explain the purpose of this migration
COMMENT ON FUNCTION handle_challenge_cancellation() IS 'Ensures that when a challenge is cancelled, the balance is not automatically transferred to the user''s main account';