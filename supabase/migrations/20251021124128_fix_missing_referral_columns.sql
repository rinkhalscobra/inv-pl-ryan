/*
  # Fix Missing Referral Earnings Columns

  1. Schema Updates
    - Add `total_referral_earnings` column to users table
    - Add `referral_commission_rate` column to users table
    
  2. Changes
    - Both columns should have been created in previous migration but are missing
    - Add them with proper defaults
*/

-- Add referral earnings columns to users table if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'total_referral_earnings'
  ) THEN
    ALTER TABLE users ADD COLUMN total_referral_earnings numeric(20,8) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'referral_commission_rate'
  ) THEN
    ALTER TABLE users ADD COLUMN referral_commission_rate numeric(4,4) DEFAULT 0.01;
  END IF;
END $$;
