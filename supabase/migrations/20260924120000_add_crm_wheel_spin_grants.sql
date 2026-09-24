/* First-class, audited CRM wheel grants and atomic wheel settlement.

   Deposits remain valid wheel sources. CRM grants are independent sources, so
   an administrator can issue a spin without creating or reopening a deposit.
   The result and wallet credit are settled together on the server. */

CREATE TABLE IF NOT EXISTS public.wheel_spin_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reference_amount numeric(20,8) NOT NULL CHECK (reference_amount > 0),
  currency text NOT NULL CHECK (currency IN ('EUR', 'USD')),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'claimed', 'revoked')),
  winning_percentage integer CHECK (winning_percentage IN (0, 5, 10, 20, 50, 70, 80, 100)),
  winning_amount numeric(20,8) CHECK (winning_amount IS NULL OR winning_amount >= 0),
  granted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wheel_spin_grants_user_status_created
  ON public.wheel_spin_grants(user_id, status, created_at DESC);

ALTER TABLE public.wheel_spin_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own wheel spin grants" ON public.wheel_spin_grants;
CREATE POLICY "Users can view own wheel spin grants"
  ON public.wheel_spin_grants FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.get_wheel_spin_eligibility()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_grant public.wheel_spin_grants%ROWTYPE;
  v_deposit public.transactions%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO v_grant
  FROM public.wheel_spin_grants
  WHERE user_id = v_user_id AND status = 'available'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', v_grant.id,
      'source_type', 'crm_grant',
      'amount', v_grant.reference_amount,
      'currency', v_grant.currency,
      'created_at', v_grant.created_at
    );
  END IF;

  SELECT * INTO v_deposit
  FROM public.transactions
  WHERE user_id = v_user_id
    AND type = 'deposit'
    AND status = 'completed'
    AND COALESCE(wheel_spun, false) = false
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', v_deposit.id,
      'source_type', 'deposit',
      'amount', abs(v_deposit.amount),
      'currency', upper(COALESCE(v_deposit.currency, 'USDT')),
      'created_at', v_deposit.created_at
    );
  END IF;

  RETURN NULL;
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
  END IF;

  /* Preserve the published wheel odds: 40%, 20%, 8%, 31.34%, .5%,
     .1%, .05% and .01%, totaling exactly 100%. */
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

CREATE OR REPLACE FUNCTION public.admin_get_user_wheel_grants(p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(g) ORDER BY g.created_at DESC)
    FROM public.wheel_spin_grants g
    WHERE g.user_id = p_target_user_id
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_grant_wheel_spin(
  p_target_user_id uuid,
  p_reference_amount numeric,
  p_currency text,
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
  IF length(btrim(COALESCE(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'Enter an audit reason'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_target_user_id
      AND NOT COALESCE(u.is_admin, false)
      AND NOT EXISTS (SELECT 1 FROM public.crm_staff_roles sr WHERE sr.user_id = u.id)
  ) THEN RAISE EXCEPTION 'The selected account is not a client'; END IF;

  INSERT INTO public.wheel_spin_grants(user_id, reference_amount, currency, granted_by)
  VALUES (p_target_user_id, round(p_reference_amount, 2), v_currency, auth.uid())
  RETURNING * INTO v_grant;

  INSERT INTO public.admin_action_logs(admin_user_id, target_user_id, action, after_data, reason)
  VALUES (auth.uid(), p_target_user_id, 'grant_wheel_spin', to_jsonb(v_grant), btrim(p_reason));

  RETURN to_jsonb(v_grant);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_wheel_spin(
  p_target_user_id uuid,
  p_grant_id uuid,
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
  IF length(btrim(COALESCE(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'Enter an audit reason'; END IF;

  SELECT to_jsonb(g) INTO v_before
  FROM public.wheel_spin_grants g
  WHERE g.id = p_grant_id AND g.user_id = p_target_user_id
  FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Wheel spin grant not found'; END IF;
  IF v_before->>'status' <> 'available' THEN RAISE EXCEPTION 'Only an available spin can be revoked'; END IF;

  UPDATE public.wheel_spin_grants
  SET status = 'revoked', revoked_at = now(), updated_at = now()
  WHERE id = p_grant_id
  RETURNING to_jsonb(wheel_spin_grants.*) INTO v_after;

  INSERT INTO public.admin_action_logs(admin_user_id, target_user_id, action, before_data, after_data, reason)
  VALUES (auth.uid(), p_target_user_id, 'revoke_wheel_spin', v_before, v_after, btrim(p_reason));
  RETURN v_after;
END;
$$;

/* Wheel outcomes and their accounting can only be produced by the atomic RPC. */
DROP POLICY IF EXISTS "Users can create own non-deposit transactions" ON public.transactions;
CREATE POLICY "Users can create own non-deposit transactions"
  ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND type NOT IN ('deposit', 'withdrawal', 'wheel_bonus'));

DROP POLICY IF EXISTS "Users can update own non-deposit transactions" ON public.transactions;
CREATE POLICY "Users can update own non-deposit transactions"
  ON public.transactions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND type NOT IN ('deposit', 'withdrawal', 'wheel_bonus'))
  WITH CHECK (auth.uid() = user_id AND type NOT IN ('deposit', 'withdrawal', 'wheel_bonus'));

DROP POLICY IF EXISTS "Users can delete own non-deposit transactions" ON public.transactions;
CREATE POLICY "Users can delete own non-deposit transactions"
  ON public.transactions FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND type NOT IN ('deposit', 'withdrawal', 'wheel_bonus'));

REVOKE ALL ON TABLE public.wheel_spin_grants FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.wheel_spin_grants TO authenticated;

REVOKE ALL ON FUNCTION public.get_wheel_spin_eligibility() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_wheel_spin(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_user_wheel_grants(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_grant_wheel_spin(uuid, numeric, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_revoke_wheel_spin(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_wheel_spin_eligibility() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_wheel_spin(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_wheel_grants(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_wheel_spin(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_wheel_spin(uuid, uuid, text) TO authenticated;

/* Retire the legacy caller-supplied balance helper. Wheel credits now happen
   only inside claim_wheel_spin, after eligibility and the result are locked. */
REVOKE ALL ON FUNCTION public.update_user_balance(uuid, numeric, text) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
