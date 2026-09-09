/*
  # Fix prop_logs RLS policy for user insertions

  1. Security Updates
    - Add policy to allow authenticated users to insert their own prop logs
    - Ensure users can log actions related to their own challenges

  2. Changes
    - Add INSERT policy for authenticated users on prop_logs table
*/

-- Add policy to allow authenticated users to insert their own prop logs
CREATE POLICY "Users can insert own prop logs"
  ON prop_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);