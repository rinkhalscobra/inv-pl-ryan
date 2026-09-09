/*
  # Add Scheduled Market Data Sync Function

  1. New Function
    - `scheduled_market_sync` - Function to be called by a cron job
    - Syncs market data from Bybit API to the database
    - Runs once every 5 minutes platform-wide
    
  2. Benefits
    - Reduces redundant API calls
    - Ensures consistent data across all users
    - Optimizes resource usage
    - Centralizes data synchronization
*/

-- Create a function that will be called by the scheduled job
CREATE OR REPLACE FUNCTION scheduled_market_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Call the run_background_processes function to update market data
  PERFORM run_background_processes();
  
  -- Log the execution
  INSERT INTO system_logs (action, details)
  VALUES ('scheduled_market_sync', 'Executed scheduled market data sync at ' || now()::text)
  ON CONFLICT DO NOTHING;
END;
$$;

-- Create system_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  details text,
  created_at timestamptz DEFAULT now()
);

-- Create index for system_logs
CREATE INDEX IF NOT EXISTS idx_system_logs_action ON system_logs(action);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at DESC);

-- Note: The actual scheduling of this function needs to be done in the Supabase dashboard
-- or via the Supabase Management API. This migration only creates the function.