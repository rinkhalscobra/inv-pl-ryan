-- Create email_otps table
CREATE TABLE IF NOT EXISTS email_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  otp_code text NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  is_used boolean DEFAULT false
);

-- Enable Row Level Security
ALTER TABLE email_otps ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'email_otps'
      AND policyname = 'Service role can manage email OTPs'
  ) THEN
    CREATE POLICY "Service role can manage email OTPs"
      ON email_otps
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_otps_user_email ON email_otps(user_email);
CREATE INDEX IF NOT EXISTS idx_email_otps_otp_code ON email_otps(otp_code);
CREATE INDEX IF NOT EXISTS idx_email_otps_expires_at ON email_otps(expires_at);
CREATE INDEX IF NOT EXISTS idx_email_otps_is_used ON email_otps(is_used);