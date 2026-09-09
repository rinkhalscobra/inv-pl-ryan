/*
  # Fix RLS Policy for Futures Orders Table

  1. Security Updates
    - Add proper RLS policy for futures_orders table
    - Ensure authenticated users can manage their own futures orders
    - Fix the issue with "new row violates row-level security policy"
    
  2. Changes
    - Drop any existing policies that might be causing conflicts
    - Create a new policy with proper USING and WITH CHECK clauses
    - Ensure the policy allows both INSERT and other operations
*/

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Users can manage own futures orders" ON futures_orders;

-- Create proper RLS policy for futures_orders
CREATE POLICY "Users can manage own futures orders"
  ON futures_orders
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Ensure RLS is enabled on the table
ALTER TABLE futures_orders ENABLE ROW LEVEL SECURITY;

-- Add service role policy for system operations
CREATE POLICY "Service role can manage futures orders"
  ON futures_orders
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);