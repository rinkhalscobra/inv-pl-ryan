/*
  Keep the referral commission trigger compatible with account creation functions
  that intentionally use an empty search_path.
*/

CREATE OR REPLACE FUNCTION public.update_referral_commission_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_rate numeric(4,4);
BEGIN
  new_rate := public.calculate_referral_commission_rate(
    COALESCE(NEW.referral_count, 0)
  );

  IF NEW.referral_commission_rate IS NULL
     OR NEW.referral_commission_rate != new_rate THEN
    NEW.referral_commission_rate := new_rate;
  END IF;

  RETURN NEW;
END;
$$;
