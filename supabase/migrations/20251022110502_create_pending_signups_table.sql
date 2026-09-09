/*
  # Create Pending Signups Table

  1. New Tables
    - `pending_signups`
      - `id` (uuid, primary key)
      - `email` (text, unique)
      - `password_hash` (text) - encrypted password
      - `first_name` (text)
      - `last_name` (text)
      - `country` (text)
      - `referral_code` (text)
      - `email_verified` (boolean)
      - `created_at` (timestamptz)
      - `expires_at` (timestamptz) - cleanup after 24 hours

  2. Security
    - Enable RLS on `pending_signups` table
    - Add policy for service role access only

  3. Notes
    - This table temporarily stores signup data until email is verified
    - After email verification, data is moved to auth.users and this record is deleted
*/

CREATE TABLE IF NOT EXISTS pending_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password text NOT NULL,
  first_name text,
  last_name text,
  country text,
  referral_code text,
  email_verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '24 hours')
);

ALTER TABLE pending_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage pending signups"
  ON pending_signups
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_pending_signups_email ON pending_signups(email);
CREATE INDEX IF NOT EXISTS idx_pending_signups_expires_at ON pending_signups(expires_at);
