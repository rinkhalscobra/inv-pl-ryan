/*
  # Portfolio Snapshots System

  1. New Table
    - `portfolio_snapshots` - Stores daily snapshots of user portfolio values
    - `is_demo` column for users table to distinguish between real and demo accounts
    
  2. Security
    - Enable RLS on the new table
    - Add policies for authenticated users to read their own snapshots
    - Add policy for service role to manage all snapshots
    
  3. Indexes
    - Create indexes for efficient querying by user_id and date
*/

-- Add is_demo column to users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'is_demo'
  ) THEN
    ALTER TABLE users ADD COLUMN is_demo boolean DEFAULT false;
  END IF;
END $$;

-- Create portfolio_snapshots table
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  total_value numeric(20,8) NOT NULL,
  usdt_balance numeric(20,8) NOT NULL,
  btc_balance numeric(20,8) NOT NULL,
  btc_price numeric(20,8) NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
CREATE POLICY "Users can read own portfolio snapshots"
  ON portfolio_snapshots
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage portfolio snapshots"
  ON portfolio_snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create unique constraint to prevent duplicate snapshots for the same user and date
ALTER TABLE portfolio_snapshots ADD CONSTRAINT portfolio_snapshots_user_id_date_key UNIQUE (user_id, snapshot_date);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_id ON portfolio_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_date ON portfolio_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_date ON portfolio_snapshots(user_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_users_is_demo ON users(is_demo);