/*
  # Add anonymous access policy for market_data table

  1. New Policies
    - Allow anonymous users to read market_data for realtime subscriptions
  
  2. Security
    - Market data is public information, safe to expose to anonymous users
    - Only SELECT operations are allowed for anonymous users
    - Realtime subscriptions require anon role access to function properly
*/

-- Ensure RLS is enabled on market_data table
ALTER TABLE market_data ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anonymous users to read market data
CREATE POLICY "Anonymous users can read market data"
  ON market_data
  FOR SELECT
  TO anon
  USING (true);