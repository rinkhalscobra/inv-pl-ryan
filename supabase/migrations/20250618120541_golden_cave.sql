/*
  # Fix robot_states challenge_time_limit constraint

  1. Changes
    - Modify the constraint on challenge_time_limit to allow NULL values
    - This fixes the error when creating new robot_states records
  
  2. Security
    - No changes to existing RLS policies
*/

-- Drop the existing constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'robot_states_challenge_time_limit_check'
  ) THEN
    ALTER TABLE robot_states DROP CONSTRAINT robot_states_challenge_time_limit_check;
  END IF;
END $$;

-- Add the corrected constraint that allows NULL values
ALTER TABLE robot_states ADD CONSTRAINT robot_states_challenge_time_limit_check 
  CHECK (challenge_time_limit IS NULL OR challenge_time_limit > 0);