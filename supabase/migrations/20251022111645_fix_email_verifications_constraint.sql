/*
  # Fix Email Verifications Foreign Key Constraint

  1. Changes
    - Drop the foreign key constraint on email_verifications.user_id
    - Change user_id to text to support both pending signups and real users
    - Add index for performance

  2. Notes
    - This allows email_verifications to work with pending_signups IDs
    - Once user is created, the verification record can be cleaned up
*/

ALTER TABLE email_verifications 
  DROP CONSTRAINT IF EXISTS email_verifications_user_id_fkey;

DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'email_verifications' 
    AND column_name = 'user_id' 
    AND data_type = 'uuid'
  ) THEN
    ALTER TABLE email_verifications 
      ALTER COLUMN user_id TYPE text USING user_id::text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id_text ON email_verifications(user_id);
