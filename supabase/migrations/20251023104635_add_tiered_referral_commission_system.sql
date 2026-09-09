/*
  # Tiered Referral Commission System

  1. Changes
    - Create function to calculate commission rate based on referral count
    - Create trigger to automatically update commission rate when referral_count changes
    
  2. Commission Tiers
    - 0-2 referrals: 1% (0.01)
    - 3-9 referrals: 1.5% (0.015)
    - 10-24 referrals: 2% (0.02)
    - 25-49 referrals: 3% (0.03)
    - 50-99 referrals: 4% (0.04)
    - 100+ referrals: 5% (0.05)
    
  3. Security
    - Function is SECURITY DEFINER to allow updating commission rates
    - Only called automatically via trigger
*/

-- Function to calculate commission rate based on referral count
CREATE OR REPLACE FUNCTION calculate_referral_commission_rate(ref_count integer)
RETURNS numeric(4,4)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF ref_count >= 100 THEN
    RETURN 0.05;
  ELSIF ref_count >= 50 THEN
    RETURN 0.04;
  ELSIF ref_count >= 25 THEN
    RETURN 0.03;
  ELSIF ref_count >= 10 THEN
    RETURN 0.02;
  ELSIF ref_count >= 3 THEN
    RETURN 0.015;
  ELSE
    RETURN 0.01;
  END IF;
END;
$$;

-- Function to update commission rate when referral count changes
CREATE OR REPLACE FUNCTION update_referral_commission_rate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_rate numeric(4,4);
BEGIN
  new_rate := calculate_referral_commission_rate(NEW.referral_count);
  
  IF NEW.referral_commission_rate != new_rate THEN
    NEW.referral_commission_rate := new_rate;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to update commission rate on referral count change
DROP TRIGGER IF EXISTS trigger_update_referral_commission_rate ON users;

CREATE TRIGGER trigger_update_referral_commission_rate
  BEFORE INSERT OR UPDATE OF referral_count
  ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_referral_commission_rate();

-- Update existing users' commission rates based on their current referral count
UPDATE users
SET referral_commission_rate = calculate_referral_commission_rate(COALESCE(referral_count, 0))
WHERE referral_commission_rate != calculate_referral_commission_rate(COALESCE(referral_count, 0));
