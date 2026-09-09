CREATE OR REPLACE FUNCTION add_usdt_balance(
  p_user_id uuid,
  p_amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE balances
  SET usdt_balance = usdt_balance + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;