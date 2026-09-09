/*
  # Create finalize_challenge_cancellation function
  
  1. New Functions
    - `finalize_challenge_cancellation`: A function to safely cancel a challenge without transferring balance
  
  2. Purpose
    - Provides a direct way to update robot_states for challenge cancellation
    - Explicitly sets challenge_account_balance to 0
    - Clears all challenge-related fields
    - Does not perform any balance transfers
*/

-- Create the finalize_challenge_cancellation function
CREATE OR REPLACE FUNCTION public.finalize_challenge_cancellation(
  p_user_id UUID,
  p_challenge_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_robot_state_exists BOOLEAN;
BEGIN
  -- First check if the robot state exists for this user
  SELECT EXISTS (
    SELECT 1 FROM robot_states 
    WHERE user_id = p_user_id 
    AND active_challenge_id = p_challenge_id
  ) INTO v_robot_state_exists;
  
  -- If robot state doesn't exist or challenge ID doesn't match, return false
  IF NOT v_robot_state_exists THEN
    RETURN FALSE;
  END IF;
  
  -- Log the cancellation action
  INSERT INTO prop_logs (
    user_id,
    challenge_id,
    action,
    details
  ) VALUES (
    p_user_id,
    p_challenge_id,
    'challenge_cancelled_by_function',
    jsonb_build_object(
      'cancelled_at', now(),
      'prevent_balance_transfer', true,
      'balance_forfeited', true
    )
  );
  
  -- Update the robot state to cancel the challenge
  -- IMPORTANT: Set all challenge-related fields to NULL or 0
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
  WHERE 
    user_id = p_user_id 
    AND active_challenge_id = p_challenge_id;
  
  -- Return success
  RETURN TRUE;
END;
$$;