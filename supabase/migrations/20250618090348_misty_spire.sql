/*
  # Add KYC status to users table

  1. Schema Updates
    - Add kyc_status column to users table
    - Set default status to 'not_verified'
    - Add constraint to ensure valid status values

  2. Security
    - Maintain existing RLS policies
    - Allow users to read and update their own KYC status
*/

-- Add kyc_status column to users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'kyc_status'
  ) THEN
    ALTER TABLE users ADD COLUMN kyc_status text DEFAULT 'not_verified' CHECK (kyc_status IN ('not_verified', 'pending', 'verified'));
  END IF;
END $$;

-- Create index for KYC status queries
CREATE INDEX IF NOT EXISTS idx_users_kyc_status ON users(kyc_status);

-- Update existing users to have default KYC status
UPDATE users SET kyc_status = 'not_verified' WHERE kyc_status IS NULL;