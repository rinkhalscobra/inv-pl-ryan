/*
  # Grant Execute Permission on Balance Update Function

  1. Changes
    - Grant EXECUTE permission on update_user_balance function to authenticated users
    
  2. Security
    - Function already has SECURITY DEFINER so it runs with creator's privileges
    - Authenticated users need EXECUTE permission to call it
*/

GRANT EXECUTE ON FUNCTION update_user_balance(uuid, numeric, text) TO authenticated;