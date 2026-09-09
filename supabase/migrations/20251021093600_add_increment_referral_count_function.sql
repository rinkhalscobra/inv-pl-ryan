/*
  # Add Increment Referral Count Function

  1. Changes
    - Create function to safely increment referral_count
    - Ensures atomic updates for referral tracking

  2. Security
    - SECURITY DEFINER to allow updates
    - Only increments, never decrements
*/

CREATE OR REPLACE FUNCTION increment_referral_count(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE users
  SET referral_count = COALESCE(referral_count, 0) + 1
  WHERE id = user_id;
END;
$$;
