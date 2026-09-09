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

-- Create RLS Policies with existence checks
DO $$
BEGIN
  -- Check if the policy already exists before creating it
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_2fa' AND policyname = 'Users can manage own 2FA settings'
  ) THEN
    CREATE POLICY "Users can manage own 2FA settings"
      ON user_2fa
      FOR ALL
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  -- Check if the policy already exists before creating it
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_2fa' AND policyname = 'Service role can manage all 2FA settings'
  ) THEN
    CREATE POLICY "Service role can manage all 2FA settings"
      ON user_2fa
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_2fa_user_id ON user_2fa(user_id);
CREATE INDEX IF NOT EXISTS idx_user_2fa_is_enabled ON user_2fa(is_enabled);

-- Create updated_at trigger with existence check
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_user_2fa_updated_at'
    AND tgrelid = 'user_2fa'::regclass
  ) THEN
    CREATE TRIGGER update_user_2fa_updated_at
      BEFORE UPDATE ON user_2fa
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;