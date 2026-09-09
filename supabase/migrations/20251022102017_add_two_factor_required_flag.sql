/*
  # Add 2FA Required Flag

  1. Changes
    - Add `two_factor_required` column to users table
    - Defaults to true for new signups to require 2FA setup
    - Add index for performance

  2. Security
    - No changes to RLS policies needed
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'two_factor_required'
  ) THEN
    ALTER TABLE users ADD COLUMN two_factor_required BOOLEAN DEFAULT true;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_two_factor_required ON users(two_factor_required);