/*
  # Fix Referral Commission Trigger for NULL Handling

  1. Changes
    - Fix the update_referral_commission_rate function to handle NULL values
    - Ensure the trigger doesn't fail when referral_commission_rate is NULL
    
  2. Security
    - Maintains existing SECURITY DEFINER
    - No changes to RLS policies
*/

-- Fix the function to handle NULL commission rates properly
CREATE OR REPLACE FUNCTION update_referral_commission_rate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_rate numeric(4,4);
BEGIN
  new_rate := calculate_referral_commission_rate(COALESCE(NEW.referral_count, 0));
  
  -- Handle NULL case properly
  IF NEW.referral_commission_rate IS NULL OR NEW.referral_commission_rate != new_rate THEN
    NEW.referral_commission_rate := new_rate;
  END IF;
  
  RETURN NEW;
END;
$$;
