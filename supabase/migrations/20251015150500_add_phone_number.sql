/*
  # Add Phone Number to Users Table

  1. Changes
    - Add phone_number column to users table
    - Phone number is optional (nullable)
    - Stored as text to support international formats with country codes

  2. Security
    - No changes to RLS policies needed
    - Phone numbers are protected by existing user-level RLS policies
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'phone_number'
  ) THEN
    ALTER TABLE users ADD COLUMN phone_number text;
  END IF;
END $$;
