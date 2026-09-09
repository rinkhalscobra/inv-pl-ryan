/*
  # Add INSERT policy for users table

  1. Security Changes
    - Add RLS policy to allow authenticated users to insert their own user record
    - This enables the sign-up flow to work properly by allowing users to create their entry in the users table

  2. Policy Details
    - Policy name: "Users can insert own data"
    - Allows INSERT operations for authenticated users
    - Restricts users to only insert records with their own auth.uid()
*/

-- Add INSERT policy for users table to allow user registration
CREATE POLICY "Users can insert own data"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);