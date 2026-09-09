/*
  # Disable problematic users trigger

  1. Changes
    - Disable the update_users_updated_at trigger that's causing signup failures
    - This trigger was automatically updating the updated_at column but causing database errors
  
  2. Security
    - This is a safe change as it only removes an automatic timestamp update
    - The application can still manually update timestamps if needed
*/

-- Disable the trigger that's causing signup failures
DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;

-- Optionally, you can also drop the trigger function if it's not used elsewhere
-- DROP FUNCTION IF EXISTS update_updated_at_column();