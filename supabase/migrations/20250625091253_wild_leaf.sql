/*
  # Add Profile Fields to Users Table

  1. Schema Updates
    - Add first_name column to users table
    - Add last_name column to users table
    - Add country column to users table
    - Add document_id_url column for KYC document storage
    - Add document_selfie_url column for KYC selfie storage
    
  2. Data Integrity
    - Ensure proper data types for all fields
    - Add indexes for better performance
*/

-- Add profile fields to users table if they don't exist
DO $$
BEGIN
  -- Add first_name column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'first_name'
  ) THEN
    ALTER TABLE users ADD COLUMN first_name text;
  END IF;

  -- Add last_name column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'last_name'
  ) THEN
    ALTER TABLE users ADD COLUMN last_name text;
  END IF;

  -- Add country column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'country'
  ) THEN
    ALTER TABLE users ADD COLUMN country text;
  END IF;

  -- Add document_id_url column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'document_id_url'
  ) THEN
    ALTER TABLE users ADD COLUMN document_id_url text;
  END IF;

  -- Add document_selfie_url column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'document_selfie_url'
  ) THEN
    ALTER TABLE users ADD COLUMN document_selfie_url text;
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_first_name ON users(first_name) WHERE first_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_last_name ON users(last_name) WHERE last_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_country ON users(country) WHERE country IS NOT NULL;