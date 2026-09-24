/* CRM-issued wheel spins have an administrator-selected outcome. Deposit spins
   keep their existing random odds. */

ALTER TABLE public.wheel_spin_grants
  ADD COLUMN IF NOT EXISTS configured_percentage integer;

UPDATE public.wheel_spin_grants
SET configured_percentage = COALESCE(winning_percentage, 5)
WHERE configured_percentage IS NULL;

ALTER TABLE public.wheel_spin_grants
  ALTER COLUMN configured_percentage SET NOT NULL;

ALTER TABLE public.wheel_spin_grants
  DROP CONSTRAINT IF EXISTS wheel_spin_grants_configured_percentage_check;
ALTER TABLE public.wheel_spin_grants
  ADD CONSTRAINT wheel_spin_grants_configured_percentage_check
  CHECK (configured_percentage IN (0, 5, 10, 20, 50, 70, 80, 100));

DROP FUNCTION IF EXISTS public.admin_grant_wheel_spin(uuid, numeric, text, text);

CREATE OR REPLACE FUNCTION public.admin_grant_wheel_spin(
  p_target_user_id uuid,
  p_reference_amount numeric,
  p_currency text,
  p_winning_percentage integer,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_currency text := upper(btrim(COALESCE(p_currency, '')));
  v_grant public.wheel_spin_grants%ROWTYPE;
BEGIN
  PERFORM public.require_admin();
  IF p_target_user_id IS NULL THEN RAISE EXCEPTION 'Select a client account'; END IF;
  IF p_reference_amount IS NULL OR p_reference_amount <= 0 OR p_reference_amount > 1000000000000 THEN
    RAISE EXCEPTION 'Enter a reference amount greater than zero';
  END IF;
  IF v_currency NOT IN ('EUR', 'USD') THEN RAISE EXCEPTION 'Select EUR or USD'; END IF;
  IF p_winning_percentage IS NULL OR p_winning_percentage NOT IN (0, 5, 10, 20, 50, 70, 80, 100) THEN
    RAISE EXCEPTION 'Select a valid wheel result';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'Enter an audit reason'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_target_user_id
      AND NOT COALESCE(u.is_admin, false)
      AND NOT EXISTS (SELECT 1 FROM public.crm_staff_roles sr WHERE sr.user_id = u.id)
  ) THEN RAISE EXCEPTION 'The selected account is not a client'; END IF;

  INSERT INTO public.wheel_spin_grants(
    user_id, reference_amount, currency, configured_percentage, granted_by
  ) VALUES (
    p_target_user_id, round(p_reference_amount, 2), v_currency,
    p_winning_percentage, auth.uid()
  )
  RETURNING * INTO v_grant;

  INSERT INTO public.admin_action_logs(admin_user_id, target_user_id, action, after_data, reason)
  VALUES (auth.uid(), p_target_user_id, 'grant_wheel_spin', to_jsonb(v_grant), btrim(p_reason));

  RETURN to_jsonb(v_grant);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_wheel_spin(
  p_source_type text,
  p_source_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_source_type text := lower(btrim(COALESCE(p_source_type, '')));
  v_grant public.wheel_spin_grants%ROWTYPE;
  v_deposit public.transactions%ROWTYPE;
  v_reference_amount numeric;
  v_currency text;
  v_roll numeric;
  v_percentage integer;
  v_winning_amount numeric;
  v_ledger_amount numeric;
  v_rate numeric := 1;
  v_bonus_transaction_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_source_id IS NULL OR v_source_type NOT IN ('crm_grant', 'deposit') THEN
    RAISE EXCEPTION 'Invalid wheel spin';
  END IF;

  IF v_source_type = 'crm_grant' THEN
    SELECT * INTO v_grant
    FROM public.wheel_spin_grants
    WHERE id = p_source_id AND user_id = v_user_id
    FOR UPDATE;
    IF NOT FOUND OR v_grant.status <> 'available' THEN
      RAISE EXCEPTION 'This wheel spin is no longer available';
    END IF;
    v_reference_amount := v_grant.reference_amount;
    v_currency := v_grant.currency;
    v_percentage := v_grant.configured_percentage;
  ELSE
    SELECT * INTO v_deposit
    FROM public.transactions
    WHERE id = p_source_id AND user_id = v_user_id
    FOR UPDATE;
    IF NOT FOUND OR v_deposit.type <> 'deposit' OR v_deposit.status <> 'completed'
       OR COALESCE(v_deposit.wheel_spun, false) THEN
      RAISE EXCEPTION 'This deposit is not eligible for a wheel spin';
    END IF;
    v_reference_amount := abs(v_deposit.amount);
    v_currency := upper(COALESCE(v_deposit.currency, 'USDT'));

    v_roll := random() * 100;
    v_percentage := CASE
      WHEN v_roll < 40 THEN 5
      WHEN v_roll < 60 THEN 10
      WHEN v_roll < 68 THEN 20
      WHEN v_roll < 99.34 THEN 0
      WHEN v_roll < 99.84 THEN 50
      WHEN v_roll < 99.94 THEN 70
      WHEN v_roll < 99.99 THEN 80
      ELSE 100
    END;
  END IF;

  v_winning_amount := round(v_reference_amount * v_percentage / 100, 8);

  IF v_currency = 'EUR' AND v_winning_amount > 0 THEN
    v_rate := public.get_current_eur_usd_rate();
    v_ledger_amount := round(v_winning_amount * v_rate, 8);
  ELSE
    v_ledger_amount := v_winning_amount;
  END IF;

  IF v_source_type = 'crm_grant' THEN
    UPDATE public.wheel_spin_grants
    SET status = 'claimed',
        winning_percentage = v_percentage,
        winning_amount = v_winning_amount,
        claimed_at = now(),
        updated_at = now()
    WHERE id = p_source_id;
  ELSE
    UPDATE public.transactions
    SET wheel_spun = true,
        wheel_winning_percentage = v_percentage,
        wheel_winning_amount = v_winning_amount,
        updated_at = now()
    WHERE id = p_source_id;
  END IF;

  IF v_winning_amount > 0 THEN
    IF v_currency = 'USD' THEN
      UPDATE public.balances
      SET usd_balance = usd_balance + v_ledger_amount, updated_at = now()
      WHERE user_id = v_user_id;
    ELSE
      UPDATE public.balances
      SET usdt_balance = usdt_balance + v_ledger_amount, updated_at = now()
      WHERE user_id = v_user_id;
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'Wallet balance not found'; END IF;

    INSERT INTO public.transactions (
      user_id, type, amount, currency, description, status,
      balance_effect, balance_processed_at
    ) VALUES (
      v_user_id,
      'wheel_bonus',
      v_winning_amount,
      CASE WHEN v_currency IN ('EUR', 'USD') THEN v_currency ELSE 'USDT' END,
      'Wheel spin bonus: ' || v_percentage || '% of ' ||
        trim(to_char(v_reference_amount, 'FM999999999999990.00')) || ' ' || v_currency,
      'completed',
      jsonb_build_object(
        'ledger_asset', CASE WHEN v_currency = 'USD' THEN 'USD' ELSE 'USDT' END,
        'ledger_amount', v_ledger_amount,
        'source_type', v_source_type,
        'source_id', p_source_id
      ),
      now()
    ) RETURNING id INTO v_bonus_transaction_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'percentage', v_percentage,
    'winning_amount', v_winning_amount,
    'currency', v_currency,
    'bonus_transaction_id', v_bonus_transaction_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_wheel_spin(uuid, numeric, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_wheel_spin(uuid, numeric, text, integer, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
