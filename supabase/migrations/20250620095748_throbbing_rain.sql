/*
  # Add User Stakes Table for Staking Feature

  1. New Table
    - `user_stakes` - Stores user staking positions and earnings
    
  2. Security
    - Enable RLS on the new table
    - Add policies for authenticated users to manage their own stakes
    - Add policy for service role to manage all stakes
    
  3. Features
    - Automatic timestamps with updated_at trigger
    - Proper foreign key relationships
    - Indexes for performance
*/

-- Create user_stakes table
CREATE TABLE IF NOT EXISTS user_stakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  asset_symbol text NOT NULL,
  staked_amount numeric(20,8) NOT NULL,
  apy_rate numeric(10,4) NOT NULL,
  start_date timestamptz DEFAULT now() NOT NULL,
  end_date timestamptz NOT NULL,
  earned_amount numeric(20,8) DEFAULT 0 NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'completed', 'cancelled')) DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE user_stakes ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
CREATE POLICY "Users can insert own stakes"
  ON user_stakes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select own stakes"
  ON user_stakes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own stakes"
  ON user_stakes
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage all stakes"
  ON user_stakes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_stakes_user_id ON user_stakes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_stakes_status ON user_stakes(status);
CREATE INDEX IF NOT EXISTS idx_user_stakes_end_date ON user_stakes(end_date);
CREATE INDEX IF NOT EXISTS idx_user_stakes_asset_symbol ON user_stakes(asset_symbol);

-- Create updated_at trigger
CREATE TRIGGER update_user_stakes_updated_at
  BEFORE UPDATE ON user_stakes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();