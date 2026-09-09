/*
  # Update deposit trigger to only process successful deposits
  
  1. Changes
    - Drop existing trigger
    - Create new trigger with WHEN condition to only fire on completed deposits
    - Keeps the same trigger function logic
*/

-- Drop the existing trigger
DROP TRIGGER IF EXISTS reset_demo_account_on_deposit_trigger ON public.transactions;

-- Recreate the trigger with a WHEN condition for successful deposits only
CREATE TRIGGER reset_demo_account_on_deposit_trigger 
AFTER INSERT ON public.transactions 
FOR EACH ROW
WHEN (NEW.type = 'deposit' AND NEW.status = 'completed')
EXECUTE FUNCTION handle_demo_user_deposit();

-- Add a log entry to track this migration
INSERT INTO system_logs (action, details)
VALUES ('migration_executed', 'Updated reset_demo_account_on_deposit_trigger to only process successful deposits');