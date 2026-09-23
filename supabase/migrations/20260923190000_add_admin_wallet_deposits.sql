/* Allow CRM administrators to post audited fiat deposits without editing the
   customer's entire wallet balance. The existing wallet trigger performs the
   EUR conversion or USD credit atomically with the transaction insert. */
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

  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Select a client account';
  END IF;
  IF v_currency NOT IN ('EUR', 'USD') THEN
    RAISE EXCEPTION 'Only EUR and USD deposits are supported';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000000000 THEN
    RAISE EXCEPTION 'Enter a deposit amount greater than zero';
  END IF;
  IF length(COALESCE(v_reference, '')) > 120 THEN
    RAISE EXCEPTION 'The payment reference must be 120 characters or fewer';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Enter an audit reason';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = p_target_user_id
      AND NOT COALESCE(u.is_admin, false)
      AND NOT EXISTS (SELECT 1 FROM public.crm_staff_roles sr WHERE sr.user_id = u.id)
  ) THEN
    RAISE EXCEPTION 'The selected account is not a client';
  END IF;

  SELECT to_jsonb(b) INTO v_before
  FROM public.balances b
  WHERE b.user_id = p_target_user_id
  FOR UPDATE;
  IF v_before IS NULL THEN
    RAISE EXCEPTION 'The client wallet does not exist';
  END IF;

  INSERT INTO public.transactions (
    user_id, type, amount, currency, description, status
  ) VALUES (
    p_target_user_id,
    'deposit',
    round(p_amount, CASE WHEN v_currency = 'USD' THEN 2 ELSE 2 END),
    v_currency,
    'CRM ' || v_currency || ' wallet deposit' ||
      CASE WHEN v_reference IS NULL THEN '' ELSE ' - reference ' || v_reference END,
    'completed'
  )
  RETURNING * INTO v_transaction;

  SELECT to_jsonb(b) INTO v_after
  FROM public.balances b
  WHERE b.user_id = p_target_user_id;

  INSERT INTO public.admin_action_logs (
    admin_user_id, target_user_id, action, before_data, after_data, reason
  ) VALUES (
    auth.uid(),
    p_target_user_id,
    'add_wallet_deposit',
    v_before,
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

