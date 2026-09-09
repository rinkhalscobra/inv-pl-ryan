/*
  # Add cancel_challenge_without_balance_transfer function

  1. New Functions
    - `cancel_challenge_without_balance_transfer` - A function to cancel a prop firm challenge without transferring the balance back to the user's main account
*/

-- Create a function to cancel a challenge without transferring the balance
CREATE OR REPLACE FUNCTION cancel_challenge_without_balance_transfer(p_user_id UUID, p_challenge_id TEXT)
RETURNS VOID AS $$
BEGIN
  -- Update the robot state directly
  UPDATE robot_states
  SET 
    active_challenge_id = NULL,
    challenge_account_balance = 0,
    challenge_profit_target = 0,
    challenge_max_drawdown = 0,
    challenge_time_limit = NULL,
    challenge_initial_balance = 0,
    challenge_start_date = NULL,
    challenge_status = 'cancelled'
  WHERE user_id = p_user_id;
  
  -- Log the action
  INSERT INTO prop_logs (
    user_id,
    challenge_id,
    action,
    details
  ) VALUES (
    p_user_id,
    p_challenge_id,
    'challenge_cancelled_no_transfer',
    jsonb_build_object(
      'cancelled_at', now(),
      'prevent_balance_transfer', true,
      'balance_forfeited', true,
      'cancelled_by', 'user',
      'method', 'direct_sql'
    )
  );
END;
$$ LANGUAGE plpgsql;

-- Add a comment to the function
COMMENT ON FUNCTION cancel_challenge_without_balance_transfer(UUID, TEXT) IS 'Cancels a prop firm challenge without transferring the balance back to the user''s main account';