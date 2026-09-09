/*
  # Fix Events Table RLS Policy for External Events

  1. Security Changes
    - Add policy to allow authenticated users to insert external events (polymarket_id IS NOT NULL, user_id IS NULL)
    - Add policy to allow authenticated users to update external events (polymarket_id IS NOT NULL, user_id IS NULL)
    
  2. Notes
    - This allows the background processor to sync external events from Manifold Markets
    - External events are identified by having a polymarket_id and user_id set to NULL
    - This maintains security while allowing external data synchronization
*/

-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "Authenticated users can insert external events" ON events;
DROP POLICY IF EXISTS "Authenticated users can update external events" ON events;

-- Create policy to allow authenticated users to insert external events
CREATE POLICY "Authenticated users can insert external events"
  ON events
  FOR INSERT
  TO authenticated
  WITH CHECK (polymarket_id IS NOT NULL AND user_id IS NULL);

-- Create policy to allow authenticated users to update external events  
CREATE POLICY "Authenticated users can update external events"
  ON events
  FOR UPDATE
  TO authenticated
  USING (polymarket_id IS NOT NULL AND user_id IS NULL)
  WITH CHECK (polymarket_id IS NOT NULL AND user_id IS NULL);