/*
  # Fix trigger to be on auth.users table

  1. Changes
    - Drop trigger from public.users
    - Create trigger on auth.users (correct table)
*/

-- Drop trigger from wrong table
DROP TRIGGER IF EXISTS on_auth_user_created ON public.users;

-- Drop trigger from correct table (just in case)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger on the CORRECT table (auth.users)
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();
