/* Atomically move funds into and out of the arbitrage robot. */

CREATE OR REPLACE FUNCTION public.allocate_robot_funds(p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_balance numeric(20,8);
  v_allocated numeric(20,8);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Allocation amount must be greater than zero';
  END IF;

  SELECT b.usdt_balance INTO v_balance
  FROM public.balances AS b
  WHERE b.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Balance account not found';
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  SELECT r.allocated_balance INTO v_allocated
  FROM public.robot_states AS r
  WHERE r.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Robot state not found';
  END IF;

  UPDATE public.balances
  SET usdt_balance = usdt_balance - p_amount,
      updated_at = now()
  WHERE user_id = v_user_id;

  UPDATE public.robot_states
  SET allocated_balance = allocated_balance + p_amount,
      updated_at = now()
  WHERE user_id = v_user_id;

  INSERT INTO public.transactions (user_id, type, amount, description, status)
  VALUES (
    v_user_id, 'robot_allocation', -p_amount,
    'Funds allocated to AI Arbitrage Robot', 'completed'
  );

  RETURN jsonb_build_object(
    'allocated_amount', p_amount,
    'new_balance', v_balance - p_amount,
    'new_allocated_balance', v_allocated + p_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.deallocate_robot_funds()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_balance numeric(20,8);
  v_allocated numeric(20,8);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
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

  UPDATE public.balances
  SET usdt_balance = usdt_balance + v_allocated,
      updated_at = now()
  WHERE user_id = v_user_id;

  UPDATE public.robot_states
  SET allocated_balance = 0,
      is_active = false,
      updated_at = now()
  WHERE user_id = v_user_id;

  INSERT INTO public.transactions (user_id, type, amount, description, status)
  VALUES (
    v_user_id, 'robot_withdrawal', v_allocated,
    'Funds removed from AI Arbitrage Robot', 'completed'
  );

  RETURN jsonb_build_object(
    'deallocated_amount', v_allocated,
    'new_balance', v_balance + v_allocated,
    'new_allocated_balance', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_robot_funds(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deallocate_robot_funds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_robot_funds(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deallocate_robot_funds() TO authenticated;
