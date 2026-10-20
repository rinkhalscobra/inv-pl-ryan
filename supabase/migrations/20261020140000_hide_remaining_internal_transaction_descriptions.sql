/* Remove the remaining internal CRM terminology from customer statements. */

UPDATE public.transactions
SET description = 'Robot profit credited'
WHERE description LIKE 'CRM robot profit:%';

UPDATE public.transactions
SET description = CASE
  WHEN description LIKE 'CRM EUR wallet deposit%' THEN 'EUR deposit completed'
  WHEN description LIKE 'CRM USD wallet deposit%' THEN 'USD deposit completed'
  ELSE 'Deposit completed'
END
WHERE description LIKE 'CRM % wallet deposit%';

CREATE OR REPLACE FUNCTION public.admin_credit_robot_profit(
  p_target_user_id uuid,
  p_amount numeric,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
BEGIN
  PERFORM public.require_admin();
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Profit amount must be greater than zero'; END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;

  SELECT to_jsonb(r) INTO v_before
  FROM public.robot_states AS r
  WHERE r.user_id = p_target_user_id
  FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Robot state not found'; END IF;

  UPDATE public.robot_states
  SET allocated_balance = allocated_balance + p_amount,
      todays_profit = CASE
        WHEN last_profit_timestamp IS NOT NULL
          AND (last_profit_timestamp AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date
        THEN todays_profit + p_amount ELSE p_amount
      END,
      total_trades = COALESCE(total_trades, 0) + 1,
      successful_trades = COALESCE(successful_trades, 0) + 1,
      last_profit_timestamp = now(),
      updated_at = now()
  WHERE user_id = p_target_user_id
  RETURNING to_jsonb(robot_states.*) INTO v_after;

  INSERT INTO public.transactions(user_id, type, amount, description, status)
  VALUES (p_target_user_id, 'robot_profit', p_amount, 'Robot profit credited', 'completed');

  INSERT INTO public.admin_action_logs(admin_user_id, target_user_id, action, before_data, after_data, reason)
  VALUES (auth.uid(), p_target_user_id, 'credit_robot_profit', v_before, v_after, p_reason);

  RETURN v_after;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_credit_robot_profit(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_credit_robot_profit(uuid, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_add_user_deposit(
  p_target_user_id uuid,
  p_amount numeric,
  p_currency text,
  p_reference text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_currency text := upper(btrim(COALESCE(p_currency, '')));
  v_reference text := NULLIF(btrim(COALESCE(p_reference, '')), '');
  v_before jsonb;
  v_after jsonb;
  v_transaction public.transactions%ROWTYPE;
BEGIN
  PERFORM public.require_admin();

  IF p_target_user_id IS NULL THEN RAISE EXCEPTION 'Select a client account'; END IF;
  IF v_currency NOT IN ('EUR', 'USD') THEN RAISE EXCEPTION 'Only EUR and USD deposits are supported'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000000000 THEN
    RAISE EXCEPTION 'Enter a deposit amount greater than zero';
  END IF;
  IF length(COALESCE(v_reference, '')) > 120 THEN
    RAISE EXCEPTION 'The payment reference must be 120 characters or fewer';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'Enter an audit reason'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users AS u
    WHERE u.id = p_target_user_id
      AND NOT COALESCE(u.is_admin, false)
      AND NOT EXISTS (SELECT 1 FROM public.crm_staff_roles AS sr WHERE sr.user_id = u.id)
  ) THEN
    RAISE EXCEPTION 'The selected account is not a client';
  END IF;

  SELECT to_jsonb(b) INTO v_before
  FROM public.balances AS b
  WHERE b.user_id = p_target_user_id
  FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'The client wallet does not exist'; END IF;

  INSERT INTO public.transactions(user_id, type, amount, currency, description, status)
  VALUES (p_target_user_id, 'deposit', round(p_amount, 2), v_currency, v_currency || ' deposit completed', 'completed')
  RETURNING * INTO v_transaction;

  SELECT to_jsonb(b) INTO v_after
  FROM public.balances AS b
  WHERE b.user_id = p_target_user_id;

  INSERT INTO public.admin_action_logs(admin_user_id, target_user_id, action, before_data, after_data, reason)
  VALUES (
    auth.uid(), p_target_user_id, 'add_wallet_deposit', v_before,
    jsonb_build_object(
      'balance', v_after,
      'transaction_id', v_transaction.id,
      'amount', v_transaction.amount,
      'currency', v_currency,
      'reference', v_reference
    ),
    btrim(p_reason)
  );

  RETURN jsonb_build_object(
    'success', true,
    'transaction', to_jsonb(v_transaction),
    'balance', v_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_add_user_deposit(uuid, numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_user_deposit(uuid, numeric, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
