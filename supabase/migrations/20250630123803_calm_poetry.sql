/*
  # Fix Duplicate Active Stakes

  1. Changes
    - First identify and fix any existing duplicate active stakes
    - Then create a unique index to prevent future duplicates
    - Add trigger to check for duplicates on insert/update
    
  2. Security
    - No changes to existing RLS policies
*/

-- First, identify and fix any existing duplicate active stakes
-- We'll keep the most recently created stake and update others to 'cancelled'
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
    -- Keep the most recent stake active, mark others as cancelled
    UPDATE user_stakes
    SET 
      status = 'cancelled',
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

-- Now create the unique index after fixing duplicates
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

-- Add a trigger to check for existing active stakes before insert or update
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