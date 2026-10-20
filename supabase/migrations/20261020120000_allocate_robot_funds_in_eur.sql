/*
  Accept robot allocations in EUR at the public RPC boundary.

  The historical usdt_balance and robot allocated_balance columns remain the
  platform's USD-valued settlement ledgers. The conversion happens atomically
  on the server, while the customer-facing amount and transaction are EUR.
*/

CREATE OR REPLACE FUNCTION public.allocate_robot_eur_funds(p_amount_eur numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_rate numeric;
  v_ledger_amount numeric(20,8);
  v_balance numeric(20,8);
  v_allocated numeric(20,8);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_amount_eur IS NULL OR p_amount_eur <= 0 THEN
    RAISE EXCEPTION 'Allocation amount must be greater than zero';
  END IF;

  v_rate := public.get_current_eur_usd_rate();
  IF COALESCE(v_rate, 0) <= 0 THEN
    RAISE EXCEPTION 'A current EUR exchange rate is required';
  END IF;
  v_ledger_amount := round(p_amount_eur * v_rate, 8);

  SELECT b.usdt_balance INTO v_balance
  FROM public.balances AS b
  WHERE b.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Balance account not found';
  END IF;

  IF v_balance < v_ledger_amount THEN
    RAISE EXCEPTION 'Insufficient EUR balance';
  END IF;

  SELECT r.allocated_balance INTO v_allocated
  FROM public.robot_states AS r
  WHERE r.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Robot state not found';
  END IF;

  UPDATE public.balances
  SET usdt_balance = usdt_balance - v_ledger_amount,
      updated_at = now()
  WHERE user_id = v_user_id;

  UPDATE public.robot_states
  SET allocated_balance = allocated_balance + v_ledger_amount,
      updated_at = now()
  WHERE user_id = v_user_id;

  INSERT INTO public.transactions (
    user_id, type, amount, currency, description, status, balance_effect
  )
  VALUES (
    v_user_id,
    'robot_allocation',
    -p_amount_eur,
    'EUR',
    'EUR funds allocated to AI Arbitrage Robot',
    'completed',
    jsonb_build_object('ledger_asset', 'USDT', 'ledger_amount', v_ledger_amount)
  );

  RETURN jsonb_build_object(
    'allocated_amount_eur', p_amount_eur,
    'settlement_amount', v_ledger_amount,
    'new_balance', v_balance - v_ledger_amount,
    'new_allocated_balance', v_allocated + v_ledger_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.deallocate_robot_eur_funds()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_rate numeric;
  v_balance numeric(20,8);
  v_allocated numeric(20,8);
  v_amount_eur numeric(20,8);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_rate := public.get_current_eur_usd_rate();
  IF COALESCE(v_rate, 0) <= 0 THEN
    RAISE EXCEPTION 'A current EUR exchange rate is required';
  END IF;

  SELECT b.usdt_balance INTO v_balance
  FROM public.balances AS b
  WHERE b.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Balance account not found';
  END IF;

  SELECT r.allocated_balance INTO v_allocated
  FROM public.robot_states AS r
  WHERE r.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Robot state not found';
  END IF;

  IF v_allocated IS NULL OR v_allocated <= 0 THEN
    RAISE EXCEPTION 'No allocated funds to remove';
  END IF;

  v_amount_eur := round(v_allocated / v_rate, 8);

  UPDATE public.balances
  SET usdt_balance = usdt_balance + v_allocated,
      updated_at = now()
  WHERE user_id = v_user_id;

  UPDATE public.robot_states
  SET allocated_balance = 0,
      is_active = false,
      updated_at = now()
  WHERE user_id = v_user_id;

  INSERT INTO public.transactions (
    user_id, type, amount, currency, description, status, balance_effect
  )
  VALUES (
    v_user_id,
    'robot_withdrawal',
    v_amount_eur,
    'EUR',
    'EUR funds removed from AI Arbitrage Robot',
    'completed',
    jsonb_build_object('ledger_asset', 'USDT', 'ledger_amount', v_allocated)
  );

  RETURN jsonb_build_object(
    'deallocated_amount_eur', v_amount_eur,
    'settlement_amount', v_allocated,
    'new_balance', v_balance + v_allocated,
    'new_allocated_balance', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_robot_eur_funds(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deallocate_robot_eur_funds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_robot_eur_funds(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deallocate_robot_eur_funds() TO authenticated;

NOTIFY pgrst, 'reload schema';
