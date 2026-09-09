/*
  Start prop challenges atomically and restore the state fields used by the UI.
  The challenge configuration is resolved server-side so clients cannot alter
  entry fees, account sizes, targets, drawdowns, or durations.
*/

ALTER TABLE public.robot_states
  ADD COLUMN IF NOT EXISTS challenge_initial_balance numeric(20,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS challenge_start_date timestamptz;

CREATE OR REPLACE FUNCTION public.start_prop_challenge(p_challenge_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_entry_fee numeric(20,8);
  v_starting_balance numeric(20,8);
  v_target_profit numeric(20,8);
  v_max_drawdown numeric(20,8);
  v_duration_days integer := 30;
  v_current_balance numeric(20,8);
  v_new_balance numeric(20,8);
  v_account_id uuid;
  v_active_challenge_id text;
  v_challenge_status text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  CASE p_challenge_id
    WHEN 'starter' THEN
      v_entry_fee := 150;
      v_starting_balance := 10000;
      v_target_profit := 800;
      v_max_drawdown := 500;
    WHEN 'bronze' THEN
      v_entry_fee := 300;
      v_starting_balance := 25000;
      v_target_profit := 2000;
      v_max_drawdown := 1250;
    WHEN 'silver' THEN
      v_entry_fee := 600;
      v_starting_balance := 50000;
      v_target_profit := 4000;
      v_max_drawdown := 2500;
    WHEN 'gold' THEN
      v_entry_fee := 1200;
      v_starting_balance := 100000;
      v_target_profit := 8000;
      v_max_drawdown := 5000;
    WHEN 'platinum' THEN
      v_entry_fee := 2400;
      v_starting_balance := 200000;
      v_target_profit := 16000;
      v_max_drawdown := 10000;
    WHEN 'diamond' THEN
      v_entry_fee := 4800;
      v_starting_balance := 400000;
      v_target_profit := 32000;
      v_max_drawdown := 20000;
    ELSE
      RAISE EXCEPTION 'Invalid challenge type';
  END CASE;

  SELECT b.usdt_balance
  INTO v_current_balance
  FROM public.balances AS b
  WHERE b.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Balance account not found';
  END IF;

  IF v_current_balance < v_entry_fee THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  SELECT r.active_challenge_id, r.challenge_status
  INTO v_active_challenge_id, v_challenge_status
  FROM public.robot_states AS r
  WHERE r.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge state not found';
  END IF;

  IF v_active_challenge_id IS NOT NULL AND v_challenge_status = 'active' THEN
    RAISE EXCEPTION 'An active challenge already exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.prop_account_balances AS pab
    WHERE pab.user_id = v_user_id AND pab.status = 'active'
  ) THEN
    RAISE EXCEPTION 'An active challenge already exists';
  END IF;

  INSERT INTO public.prop_account_balances (
    user_id,
    challenge_id,
    starting_balance,
    current_balance,
    max_balance,
    max_drawdown,
    max_drawdown_reached,
    target_profit,
    start_date,
    end_date,
    status
  ) VALUES (
    v_user_id,
    p_challenge_id,
    v_starting_balance,
    v_starting_balance,
    v_starting_balance,
    v_max_drawdown,
    0,
    v_target_profit,
    now(),
    now() + make_interval(days => v_duration_days),
    'active'
  )
  RETURNING id INTO v_account_id;

  UPDATE public.robot_states
  SET active_challenge_id = p_challenge_id,
      challenge_initial_balance = v_starting_balance,
      challenge_account_balance = v_starting_balance,
      challenge_profit_target = v_target_profit,
      challenge_max_drawdown = v_max_drawdown,
      challenge_time_limit = v_duration_days,
      challenge_start_date = now(),
      challenge_status = 'active'
  WHERE user_id = v_user_id;

  -- The challenge-fee transaction trigger performs the balance deduction.
  INSERT INTO public.transactions (
    user_id,
    type,
    amount,
    description,
    status
  ) VALUES (
    v_user_id,
    'challenge_fee',
    v_entry_fee,
    'Entry fee for ' || initcap(p_challenge_id) || ' Challenge',
    'completed'
  );

  SELECT b.usdt_balance
  INTO v_new_balance
  FROM public.balances AS b
  WHERE b.user_id = v_user_id;

  INSERT INTO public.prop_logs (user_id, challenge_id, action, details)
  VALUES (
    v_user_id,
    p_challenge_id,
    'challenge_initialized',
    jsonb_build_object(
      'account_id', v_account_id,
      'entry_fee', v_entry_fee,
      'starting_balance', v_starting_balance,
      'target_profit', v_target_profit,
      'max_drawdown', v_max_drawdown,
      'duration_days', v_duration_days
    )
  );

  RETURN jsonb_build_object(
    'account_id', v_account_id,
    'challenge_id', p_challenge_id,
    'new_balance', v_new_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_prop_challenge(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_prop_challenge(text) TO authenticated;

-- The legacy RPC trusts caller-supplied user IDs and financial parameters.
REVOKE ALL ON FUNCTION public.initialize_prop_challenge(uuid, text, numeric, numeric, numeric, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_prop_challenge(uuid, text, numeric, numeric, numeric, integer)
  TO service_role;
