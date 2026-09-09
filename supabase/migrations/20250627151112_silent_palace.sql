/*
  # Clean up orphaned prop trading records

  1. Problem
    - The process-prop-orders edge function is failing due to foreign key constraint violations
    - Records in prop-related tables reference user_ids that don't exist in the users table
    - This causes failures when trying to insert logs into prop_logs table

  2. Solution
    - Remove all orphaned records from prop-related tables where user_id doesn't exist
    - Ensure data integrity by cleaning up all related prop trading data
    - Add additional safety checks to prevent future orphaned records

  3. Tables cleaned
    - prop_orders: Remove orders for non-existent users
    - prop_positions: Remove positions for non-existent users  
    - prop_account_balances: Remove account balances for non-existent users
    - prop_position_history: Remove position history for non-existent users
    - prop_logs: Remove existing logs for non-existent users
*/

-- Clean up orphaned prop_orders records
DELETE FROM prop_orders 
WHERE user_id IS NOT NULL 
AND user_id NOT IN (SELECT id FROM users);

-- Clean up orphaned prop_positions records
DELETE FROM prop_positions 
WHERE user_id IS NOT NULL 
AND user_id NOT IN (SELECT id FROM users);

-- Clean up orphaned prop_account_balances records
DELETE FROM prop_account_balances 
WHERE user_id IS NOT NULL 
AND user_id NOT IN (SELECT id FROM users);

-- Clean up orphaned prop_position_history records
DELETE FROM prop_position_history 
WHERE user_id IS NOT NULL 
AND user_id NOT IN (SELECT id FROM users);

-- Clean up orphaned prop_logs records
DELETE FROM prop_logs 
WHERE user_id IS NOT NULL 
AND user_id NOT IN (SELECT id FROM users);

-- Add a function to prevent future orphaned records
CREATE OR REPLACE FUNCTION check_user_exists()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id) THEN
    RAISE EXCEPTION 'User with id % does not exist', NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers to prevent future orphaned records (only if they don't already exist)
DO $$
BEGIN
  -- Check if trigger exists before creating
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'check_user_exists_prop_orders'
  ) THEN
    CREATE TRIGGER check_user_exists_prop_orders
      BEFORE INSERT OR UPDATE ON prop_orders
      FOR EACH ROW EXECUTE FUNCTION check_user_exists();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'check_user_exists_prop_positions'
  ) THEN
    CREATE TRIGGER check_user_exists_prop_positions
      BEFORE INSERT OR UPDATE ON prop_positions
      FOR EACH ROW EXECUTE FUNCTION check_user_exists();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'check_user_exists_prop_account_balances'
  ) THEN
    CREATE TRIGGER check_user_exists_prop_account_balances
      BEFORE INSERT OR UPDATE ON prop_account_balances
      FOR EACH ROW EXECUTE FUNCTION check_user_exists();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'check_user_exists_prop_logs'
  ) THEN
    CREATE TRIGGER check_user_exists_prop_logs
      BEFORE INSERT OR UPDATE ON prop_logs
      FOR EACH ROW EXECUTE FUNCTION check_user_exists();
  END IF;
END $$;