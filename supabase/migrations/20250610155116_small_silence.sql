/*
  # Fix market data RLS policies

  1. Security Updates
    - Add policy for authenticated users to insert/update market data
    - This allows the client-side application to update market data from external APIs
    
  2. Changes
    - Add INSERT policy for authenticated users on market_data table
    - Add UPDATE policy for authenticated users on market_data table
*/

-- Add policy to allow authenticated users to insert market data
CREATE POLICY "Authenticated users can insert market data"
  ON market_data
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add policy to allow authenticated users to update market data
CREATE POLICY "Authenticated users can update market data"
  ON market_data
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);