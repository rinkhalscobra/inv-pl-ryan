/*
  # Add Referral System to Users Table

  1. Schema Updates
    - Add referral_code column to users table for storing each user's unique code
    - Add referral_count column to track how many successful referrals a user has made
    - Add referred_by column to track which user referred the current user
    - Add appropriate constraints and indexes for performance

  2. Security
    - Maintain existing RLS policies
    - Ensure proper foreign key relationships
*/

-- Add referral system columns to users table
DO $$
BEGIN
  -- Add referral_code column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'referral_code'
  ) THEN
    ALTER TABLE users ADD COLUMN referral_code text;
  END IF;

  -- Add referral_count column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'referral_count'
  ) THEN
    ALTER TABLE users ADD COLUMN referral_count integer DEFAULT 0;
  END IF;

  -- Add referred_by column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'referred_by'
  ) THEN
    ALTER TABLE users ADD COLUMN referred_by uuid REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by) WHERE referred_by IS NOT NULL;