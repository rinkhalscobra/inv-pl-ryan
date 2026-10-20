/* Keep internal CRM terminology and audit reasons out of client statements. */

UPDATE public.transactions
SET description = CASE
  WHEN description LIKE 'CRM BTC balance adjustment:%' AND amount >= 0
    THEN 'BTC funds added to account'
  WHEN description LIKE 'CRM BTC balance adjustment:%'
    THEN 'BTC funds removed from account'
  WHEN description LIKE 'CRM USD balance adjustment:%' AND amount >= 0
    THEN 'USD funds added to account'
  WHEN description LIKE 'CRM USD balance adjustment:%'
    THEN 'USD funds removed from account'
  WHEN description LIKE 'CRM balance adjustment:%' AND amount >= 0
    THEN 'EUR funds added to account'
  WHEN description LIKE 'CRM balance adjustment:%'
    THEN 'EUR funds removed from account'
  ELSE description
END
WHERE description LIKE 'CRM balance adjustment:%'
   OR description LIKE 'CRM USD balance adjustment:%'
   OR description LIKE 'CRM BTC balance adjustment:%';

CREATE OR REPLACE FUNCTION public.admin_set_user_balances(
  p_target_user_id uuid,
  p_usdt_balance numeric,
  p_usd_balance numeric,
  p_btc_balance numeric,
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
  v_old_eur numeric;
  v_old_usd numeric;
  v_old_btc numeric;
  v_eur_usd_rate numeric;
BEGIN
  PERFORM public.require_admin();

  IF p_usdt_balance < 0 OR p_usd_balance < 0 OR p_btc_balance < 0 THEN
    RAISE EXCEPTION 'Balances cannot be negative';
  END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;

  SELECT to_jsonb(b), usdt_balance, usd_balance, btc_balance
  INTO v_before, v_old_eur, v_old_usd, v_old_btc
  FROM public.balances AS b
  WHERE user_id = p_target_user_id
  FOR UPDATE;

  IF v_before IS NULL THEN
    RAISE EXCEPTION 'Balance account not found';
  END IF;

  UPDATE public.balances
  SET usdt_balance = p_usdt_balance,
      usd_balance = p_usd_balance,
      btc_balance = p_btc_balance,
      updated_at = now()
  WHERE user_id = p_target_user_id
  RETURNING to_jsonb(balances.*) INTO v_after;

  IF p_usdt_balance IS DISTINCT FROM v_old_eur THEN
    v_eur_usd_rate := public.get_current_eur_usd_rate();
    INSERT INTO public.transactions (
      user_id, type, amount, currency, description, status,
      balance_effect, balance_processed_at
    ) VALUES (
      p_target_user_id,
      CASE WHEN p_usdt_balance > v_old_eur THEN 'deposit' ELSE 'withdrawal' END,
      round((p_usdt_balance - v_old_eur) / v_eur_usd_rate, 8),
      'EUR',
      CASE
        WHEN p_usdt_balance > v_old_eur THEN 'EUR funds added to account'
        ELSE 'EUR funds removed from account'
      END,
      'completed',
      jsonb_build_object(
        'external_balance_change', true,
        'source', 'admin_balance_update',
        'ledger_asset', 'USDT',
        'ledger_amount', abs(p_usdt_balance - v_old_eur)
      ),
      now()
    );
  END IF;

  IF p_usd_balance IS DISTINCT FROM v_old_usd THEN
    INSERT INTO public.transactions (
      user_id, type, amount, currency, description, status,
      balance_effect, balance_processed_at
    ) VALUES (
      p_target_user_id,
      CASE WHEN p_usd_balance > v_old_usd THEN 'deposit' ELSE 'withdrawal' END,
      p_usd_balance - v_old_usd,
      'USD',
      CASE
        WHEN p_usd_balance > v_old_usd THEN 'USD funds added to account'
        ELSE 'USD funds removed from account'
      END,
      'completed',
      jsonb_build_object(
        'external_balance_change', true,
        'source', 'admin_balance_update',
        'ledger_asset', 'USD',
        'ledger_amount', abs(p_usd_balance - v_old_usd)
      ),
      now()
    );
  END IF;

  IF p_btc_balance IS DISTINCT FROM v_old_btc THEN
    INSERT INTO public.transactions (
      user_id, type, amount, currency, description, status,
      balance_effect, balance_processed_at
    ) VALUES (
      p_target_user_id,
      CASE WHEN p_btc_balance > v_old_btc THEN 'deposit' ELSE 'withdrawal' END,
      p_btc_balance - v_old_btc,
      'BTC',
      CASE
        WHEN p_btc_balance > v_old_btc THEN 'BTC funds added to account'
        ELSE 'BTC funds removed from account'
      END,
      'completed',
      jsonb_build_object(
        'external_balance_change', true,
        'source', 'admin_balance_update',
        'ledger_asset', 'BTC',
        'ledger_amount', abs(p_btc_balance - v_old_btc)
      ),
      now()
    );
  END IF;

  INSERT INTO public.admin_action_logs (
    admin_user_id, target_user_id, action, before_data, after_data, reason
  ) VALUES (
    auth.uid(), p_target_user_id, 'set_balances',
    v_before, v_after, p_reason
  );

  RETURN v_after;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_balances(uuid, numeric, numeric, numeric, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_balances(uuid, numeric, numeric, numeric, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION crm_private.first_qualifying_deposit_at(p_user_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT min(t.balance_processed_at)
  FROM public.transactions AS t
  WHERE t.user_id = p_user_id
    AND t.status = 'completed'
    AND t.type IN ('deposit', 'nowpayments_deposit')
    AND t.amount > 0
    AND t.balance_processed_at IS NOT NULL
    AND t.balance_reversed_at IS NULL
    AND t.balance_effect->>'legacy' IS DISTINCT FROM 'true'
    AND CASE
      WHEN t.balance_effect->>'external_balance_change' = 'true'
        AND (
          t.balance_effect->>'source' = 'admin_balance_update'
          OR t.description IN (
            'EUR funds added to account',
            'USD funds added to account'
          )
        )
        THEN CASE
          WHEN jsonb_typeof(t.balance_effect->'ledger_amount') = 'number'
            THEN (t.balance_effect->>'ledger_amount')::numeric >= 250
          ELSE t.amount >= 250
        END
      WHEN t.balance_effect->>'external_balance_change' IS DISTINCT FROM 'true'
        AND jsonb_typeof(t.balance_effect->'ledger_amount') = 'number'
        THEN (t.balance_effect->>'ledger_amount')::numeric >= 250
      ELSE false
    END;
$$;

REVOKE ALL ON FUNCTION crm_private.first_qualifying_deposit_at(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crm_private.first_qualifying_deposit_at(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION crm_private.capture_qualifying_affiliate_ftd()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_qualifying_credit boolean := false;
BEGIN
  IF NEW.status = 'completed'
     AND NEW.type IN ('deposit', 'nowpayments_deposit')
     AND NEW.amount > 0
     AND NEW.balance_processed_at IS NOT NULL
     AND NEW.balance_reversed_at IS NULL
     AND NEW.balance_effect->>'legacy' IS DISTINCT FROM 'true' THEN
    v_is_qualifying_credit := CASE
      WHEN NEW.balance_effect->>'external_balance_change' = 'true'
        AND (
          NEW.balance_effect->>'source' = 'admin_balance_update'
          OR NEW.description IN (
            'EUR funds added to account',
            'USD funds added to account'
          )
        )
        THEN CASE
          WHEN jsonb_typeof(NEW.balance_effect->'ledger_amount') = 'number'
            THEN (NEW.balance_effect->>'ledger_amount')::numeric >= 250
          ELSE NEW.amount >= 250
        END
      WHEN NEW.balance_effect->>'external_balance_change' IS DISTINCT FROM 'true'
        AND jsonb_typeof(NEW.balance_effect->'ledger_amount') = 'number'
        THEN (NEW.balance_effect->>'ledger_amount')::numeric >= 250
      ELSE false
    END;
  END IF;

  IF v_is_qualifying_credit THEN
    PERFORM crm_private.sync_affiliate_lead_ftd(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION crm_private.first_qualifying_deposit_at(uuid) IS
  'Earliest qualifying customer deposit or administrative EUR/USD wallet credit.';

NOTIFY pgrst, 'reload schema';
