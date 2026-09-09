/*
  # Fix active_challenge_id column type

  1. Changes
    - Change active_challenge_id from UUID to TEXT to allow string identifiers like 'bronze', 'silver', etc.
    - Update any existing NULL values to remain NULL
    - Remove foreign key constraint if it exists

  2. Security
    - Maintain existing RLS policies
*/

-- First, drop any foreign key constraints on active_challenge_id if they exist
DO $$
BEGIN
  -- Check if there are any foreign key constraints and drop them
  IF EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'robot_states' 
    AND ccu.column_name = 'active_challenge_id'
    AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    -- Get the constraint name and drop it
    DECLARE
      constraint_name_var TEXT;
    BEGIN
      SELECT tc.constraint_name INTO constraint_name_var
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      WHERE tc.table_name = 'robot_states' 
      AND ccu.column_name = 'active_challenge_id'
      AND tc.constraint_type = 'FOREIGN KEY'
      LIMIT 1;
      
      IF constraint_name_var IS NOT NULL THEN
        EXECUTE 'ALTER TABLE robot_states DROP CONSTRAINT ' || constraint_name_var;
      END IF;
    END;
  END IF;
END $$;

-- Change the column type from UUID to TEXT
ALTER TABLE robot_states 
ALTER COLUMN active_challenge_id TYPE TEXT USING active_challenge_id::TEXT;

-- Update the column to allow NULL values (it should already allow this)
ALTER TABLE robot_states 
ALTER COLUMN active_challenge_id DROP NOT NULL;

-- Add a check constraint to ensure only valid challenge IDs are used
ALTER TABLE robot_states 
ADD CONSTRAINT valid_challenge_id 
CHECK (
  active_challenge_id IS NULL OR 
  active_challenge_id IN ('starter', 'bronze', 'silver', 'gold', 'platinum', 'diamond')
);