/*
  # Add Two-Factor Authentication Support

  1. New Table
    - `user_2fa` - Stores user 2FA settings and secrets
    
  2. Security
    - Enable RLS on the new table
    - Add policies for authenticated users to manage their own 2FA settings
    - Add policy for service role to manage all 2FA settings
    
  3. Features
    - Store whether 2FA is enabled for each user
    - Store the 2FA secret key securely
    - Track when 2FA was last updated
*/

-- Create user_2fa table
CREATE TABLE IF NOT EXISTS user_2fa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  is_enabled boolean DEFAULT false NOT NULL,
  secret text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable Row Level Security
ALTER TABLE user_2fa ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
CREATE POLICY "Users can manage own 2FA settings"
  ON user_2fa
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage all 2FA settings"
  ON user_2fa
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_2fa_user_id ON user_2fa(user_id);
CREATE INDEX IF NOT EXISTS idx_user_2fa_is_enabled ON user_2fa(is_enabled);

-- Create updated_at trigger
CREATE TRIGGER update_user_2fa_updated_at
  BEFORE UPDATE ON user_2fa
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();