/*
  # Prevent Stake Cancellation

  1. Changes
    - Add a database function to prevent stake cancellation
    - Add a trigger to block UPDATE operations that try to set status to 'cancelled'
    - Ensure existing functionality for completed stakes remains intact
    
  2. Security
    - Maintain existing RLS policies
    - Add additional security to prevent stake cancellation
*/

-- First, identify and fix any existing duplicate active stakes
-- We'll keep the most recently created stake and update others to 'completed'
DO $$
DECLARE
  duplicate_record RECORD;
BEGIN
  -- Find all duplicates (user_id, asset_symbol combinations with multiple active stakes)
  FOR duplicate_record IN
    SELECT user_id, asset_symbol
    FROM user_stakes
    WHERE status = 'active'
    GROUP BY user_id, asset_symbol
    HAVING COUNT(*) > 1
  LOOP
    -- Keep the most recent stake active, mark others as completed
    UPDATE user_stakes
    SET 
      status = 'completed',
      updated_at = now()
    WHERE id NOT IN (
      SELECT id 
      FROM user_stakes 
      WHERE user_id = duplicate_record.user_id 
        AND asset_symbol = duplicate_record.asset_symbol 
        AND status = 'active'
      ORDER BY created_at DESC 
      LIMIT 1
    )
    AND user_id = duplicate_record.user_id
    AND asset_symbol = duplicate_record.asset_symbol
    AND status = 'active';
    
    -- Log the fix
    RAISE NOTICE 'Fixed duplicate active stakes for user % and asset %', 
      duplicate_record.user_id, duplicate_record.asset_symbol;
  END LOOP;
END $$;

-- Create a unique index to prevent duplicate active stakes
CREATE UNIQUE INDEX IF NOT EXISTS user_stakes_user_id_asset_symbol_active_key
ON public.user_stakes (user_id, asset_symbol)
WHERE status = 'active';

-- Add a function to check for existing active stakes before inserting
CREATE OR REPLACE FUNCTION check_active_stake_exists()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM user_stakes
    WHERE user_id = NEW.user_id
      AND asset_symbol = NEW.asset_symbol
      AND status = 'active'
      AND id != NEW.id
  ) THEN
    RAISE EXCEPTION 'User already has an active stake for %', NEW.asset_symbol;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add a trigger to check for existing active stakes before insert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'check_active_stake_before_insert'
  ) THEN
    CREATE TRIGGER check_active_stake_before_insert
      BEFORE INSERT ON user_stakes
      FOR EACH ROW
      EXECUTE FUNCTION check_active_stake_exists();
  END IF;
END $$;

-- Create a function to prevent stake cancellation
CREATE OR REPLACE FUNCTION prevent_stake_cancellation()
RETURNS TRIGGER AS $$
BEGIN
  -- If trying to change status from 'active' to 'cancelled', block it
  IF OLD.status = 'active' AND NEW.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cancelling stakes is not allowed. Stakes must complete their full duration.';
  END IF;
  
  -- Allow other status changes (like 'active' to 'completed')
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add a trigger to prevent stake cancellation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'prevent_stake_cancellation'
  ) THEN
    CREATE TRIGGER prevent_stake_cancellation
      BEFORE UPDATE ON user_stakes
      FOR EACH ROW
      EXECUTE FUNCTION prevent_stake_cancellation();
  END IF;
END $$;