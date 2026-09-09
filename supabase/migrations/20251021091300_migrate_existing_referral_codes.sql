/*
  # Update Referral Code Format - Part 2: Data Migration

  1. Changes
    - Update all existing referral codes to new format
    - Uses the generate_referral_code() function created in previous migration

  2. Safety
    - Only updates users with existing referral codes
    - Ensures no duplicate codes are generated
*/

-- Update all existing referral codes to new format
DO $$
DECLARE
  user_record record;
  new_code text;
BEGIN
  FOR user_record IN SELECT id, referral_code FROM users WHERE referral_code IS NOT NULL
  LOOP
    new_code := generate_referral_code();

    UPDATE users
    SET referral_code = new_code
    WHERE id = user_record.id;
  END LOOP;
END $$;
