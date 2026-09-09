/* Apply challenge fees exactly once when their ledger row is created. */

CREATE OR REPLACE FUNCTION public.apply_challenge_fee_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Challenge fee must be greater than zero';
  END IF;

  UPDATE public.balances
  SET usdt_balance = usdt_balance - NEW.amount,
      updated_at = now()
  WHERE user_id = NEW.user_id
    AND usdt_balance >= NEW.amount;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_challenge_fee_balance_trigger ON public.transactions;
CREATE TRIGGER apply_challenge_fee_balance_trigger
AFTER INSERT ON public.transactions
FOR EACH ROW
WHEN (NEW.type = 'challenge_fee' AND NEW.status = 'completed')
EXECUTE FUNCTION public.apply_challenge_fee_balance();

REVOKE ALL ON FUNCTION public.apply_challenge_fee_balance() FROM PUBLIC;
