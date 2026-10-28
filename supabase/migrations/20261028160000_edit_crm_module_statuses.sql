/* Status choices follow the database constraints for every editable CRM module.
   Wallet corrections reconcile recorded ledger effects inside the audited RPC. */

CREATE OR REPLACE FUNCTION crm_private.editable_module_tables()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY[
    'user_assets', 'transactions', 'portfolio_snapshots', 'spot_orders', 'futures_positions',
    'futures_orders', 'futures_position_history', 'position_swap_charges',
    'binary_trades', 'user_stakes', 'trading_logs',
    'crypto_deposit_addresses', 'crypto_deposits', 'crypto_payment_requests',
    'sandbox_payment_transactions', 'giveaway_tickets', 'giveaway_entries',
    'giveaway_winners', 'user_favorites', 'notifications', 'conversations',
    'client_bank_details', 'referral_earnings'
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.admin_get_module_edit_options(p_table_name text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_field record;
  v_choices text[];
  v_result jsonb := '{}'::jsonb;
BEGIN
  PERFORM public.require_admin();
  IF p_table_name IS NULL OR p_table_name <> ALL(crm_private.editable_module_tables()) THEN
    RAISE EXCEPTION 'This CRM table is not editable';
  END IF;

  FOR v_field IN
    SELECT a.attname, a.attnum, a.atttypid, a.attrelid
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class t ON t.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = p_table_name
      AND a.attnum > 0 AND NOT a.attisdropped
  LOOP
    SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) INTO v_choices
    FROM pg_catalog.pg_enum e WHERE e.enumtypid = v_field.atttypid;
    IF v_choices IS NULL THEN
      SELECT array_agg(DISTINCT matches[1] ORDER BY matches[1]) INTO v_choices
      FROM pg_catalog.pg_constraint c
      CROSS JOIN LATERAL pg_catalog.regexp_matches(
        pg_catalog.pg_get_constraintdef(c.oid), $pattern$'([^']*)'$pattern$, 'g'
      ) AS matches
      WHERE c.conrelid = v_field.attrelid AND c.contype = 'c'
        AND cardinality(c.conkey) = 1 AND c.conkey[1] = v_field.attnum
        AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%= ANY%';
    END IF;
    IF cardinality(v_choices) > 0 THEN
      v_result := v_result || jsonb_build_object(v_field.attname, to_jsonb(v_choices));
    END IF;
  END LOOP;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION crm_private.reconcile_crm_wallet_status(
  p_old public.transactions,
  p_new public.transactions
)
RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_asset text;
  v_amount numeric;
  v_balance numeric;
  v_delta numeric;
  v_was_active boolean;
  v_should_be_active boolean;
BEGIN
  PERFORM public.require_admin();
  PERFORM crm_private.assert_actor_user_access(p_old.user_id);
  IF p_new.id IS DISTINCT FROM p_old.id OR p_new.user_id IS DISTINCT FROM p_old.user_id THEN
    RAISE EXCEPTION 'Transaction ownership cannot be changed';
  END IF;

  -- Legacy records and external adjustments describe balances managed elsewhere.
  -- Their status can change without replaying that external credit or debit.
  IF p_new.type NOT IN ('deposit', 'nowpayments_deposit', 'withdrawal')
     OR p_old.balance_effect->>'legacy' = 'true'
     OR p_old.balance_effect->>'external_balance_change' = 'true'
     OR (p_old.balance_processed_at IS NOT NULL AND NOT (p_old.balance_effect ? 'ledger_amount')) THEN
    RETURN p_new;
  END IF;

  v_was_active := p_old.balance_processed_at IS NOT NULL AND p_old.balance_reversed_at IS NULL;
  v_should_be_active := CASE WHEN p_new.type = 'withdrawal'
    THEN p_new.status IN ('pending', 'completed')
    ELSE p_new.status = 'completed' END;

  IF v_was_active = v_should_be_active THEN RETURN p_new; END IF;

  v_asset := upper(p_old.balance_effect->>'ledger_asset');
  v_amount := (p_old.balance_effect->>'ledger_amount')::numeric;
  IF v_amount IS NULL THEN
    v_asset := upper(COALESCE(p_new.withdrawal_details->>'currency', p_new.currency, 'EUR'));
    IF p_new.type = 'withdrawal' AND v_asset = 'BTC' THEN
      v_amount := COALESCE((p_new.withdrawal_details->>'amount')::numeric, abs(p_new.amount));
    ELSIF v_asset = 'USD' THEN
      v_amount := abs(p_new.amount);
    ELSIF v_asset = 'EUR' THEN
      v_amount := COALESCE(
        (p_new.withdrawal_details->>'source_amount_usd')::numeric,
        round(abs(p_new.amount) * public.get_current_eur_usd_rate(), 8)
      );
      v_asset := 'USDT';
    ELSE
      v_amount := abs(p_new.amount);
      v_asset := 'USDT';
    END IF;
  END IF;
  IF v_asset IS NULL OR v_asset NOT IN ('USDT', 'USD', 'BTC') OR v_amount IS NULL
     OR v_amount::text IN ('NaN', 'Infinity', '-Infinity') OR v_amount < 0 THEN
    RAISE EXCEPTION 'Invalid recorded wallet balance effect';
  END IF;

  v_delta := v_amount * (CASE WHEN v_should_be_active THEN 1 ELSE -1 END)
    * (CASE WHEN p_new.type = 'withdrawal' THEN -1 ELSE 1 END);

  SELECT CASE v_asset WHEN 'USD' THEN b.usd_balance WHEN 'BTC' THEN b.btc_balance ELSE b.usdt_balance END
  INTO v_balance FROM public.balances b WHERE b.user_id = p_old.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet balance not found'; END IF;
  IF v_balance + v_delta < 0 THEN
    RAISE EXCEPTION 'Insufficient % balance to change transaction status', v_asset;
  END IF;

  UPDATE public.balances
  SET usdt_balance = usdt_balance + CASE WHEN v_asset = 'USDT' THEN v_delta ELSE 0 END,
      usd_balance = usd_balance + CASE WHEN v_asset = 'USD' THEN v_delta ELSE 0 END,
      btc_balance = btc_balance + CASE WHEN v_asset = 'BTC' THEN v_delta ELSE 0 END,
      updated_at = now()
  WHERE user_id = p_old.user_id;

  p_new.balance_effect := p_old.balance_effect || jsonb_build_object('ledger_asset', v_asset, 'ledger_amount', v_amount);
  p_new.balance_processed_at := COALESCE(p_old.balance_processed_at, now());
  p_new.balance_reversed_at := CASE WHEN v_should_be_active THEN NULL ELSE now() END;
  RETURN p_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_wallet_transaction_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_asset text;
  v_ledger_amount numeric;
  v_rate numeric;
  v_balance numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.type = 'withdrawal' AND OLD.status = 'pending'
       AND OLD.balance_processed_at IS NOT NULL AND OLD.balance_reversed_at IS NULL THEN
      v_asset := upper(COALESCE(OLD.balance_effect->>'ledger_asset', 'USDT'));
      v_ledger_amount := COALESCE((OLD.balance_effect->>'ledger_amount')::numeric, 0);
      IF v_asset = 'BTC' THEN
        UPDATE public.balances SET btc_balance = btc_balance + v_ledger_amount, updated_at = now() WHERE user_id = OLD.user_id;
      ELSIF v_asset = 'USD' THEN
        UPDATE public.balances SET usd_balance = usd_balance + v_ledger_amount, updated_at = now() WHERE user_id = OLD.user_id;
      ELSE
        UPDATE public.balances SET usdt_balance = usdt_balance + v_ledger_amount, updated_at = now() WHERE user_id = OLD.user_id;
      END IF;
    ELSIF OLD.type IN ('deposit', 'nowpayments_deposit') AND OLD.status = 'completed'
       AND OLD.balance_processed_at IS NOT NULL AND OLD.balance_reversed_at IS NULL THEN
      v_asset := upper(COALESCE(OLD.balance_effect->>'ledger_asset', 'USDT'));
      v_ledger_amount := COALESCE((OLD.balance_effect->>'ledger_amount')::numeric, 0);
      IF v_asset = 'USD' THEN
        SELECT usd_balance INTO v_balance FROM public.balances WHERE user_id = OLD.user_id FOR UPDATE;
        IF v_balance < v_ledger_amount THEN RAISE EXCEPTION 'The credited USD deposit has already been used and cannot be deleted'; END IF;
        UPDATE public.balances SET usd_balance = usd_balance - v_ledger_amount, updated_at = now() WHERE user_id = OLD.user_id;
      ELSE
        SELECT usdt_balance INTO v_balance FROM public.balances WHERE user_id = OLD.user_id FOR UPDATE;
        IF v_balance < v_ledger_amount THEN RAISE EXCEPTION 'The credited deposit has already been used and cannot be deleted'; END IF;
        UPDATE public.balances SET usdt_balance = usdt_balance - v_ledger_amount, updated_at = now() WHERE user_id = OLD.user_id;
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.balance_processed_at IS NOT NULL AND (
    NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.type IS DISTINCT FROM OLD.type OR
    NEW.amount IS DISTINCT FROM OLD.amount OR NEW.currency IS DISTINCT FROM OLD.currency OR
    NEW.withdrawal_details IS DISTINCT FROM OLD.withdrawal_details OR
    NEW.balance_effect IS DISTINCT FROM OLD.balance_effect
  ) THEN RAISE EXCEPTION 'Processed wallet transaction financial fields are immutable'; END IF;

  IF TG_OP = 'INSERT' AND (
    COALESCE(NEW.description, '') LIKE 'CRM balance adjustment:%' OR
    COALESCE(NEW.description, '') LIKE 'CRM USD balance adjustment:%' OR
    COALESCE(NEW.description, '') LIKE 'CRM BTC balance adjustment:%' OR
    COALESCE(NEW.description, '') LIKE 'Sandbox payment deposit%'
  ) THEN
    IF COALESCE(NEW.description, '') LIKE 'CRM USD balance adjustment:%' THEN NEW.currency := 'USD';
    ELSIF COALESCE(NEW.description, '') LIKE 'CRM BTC balance adjustment:%' THEN NEW.currency := 'BTC'; END IF;
    NEW.balance_effect := jsonb_build_object('external_balance_change', true);
    NEW.balance_processed_at := now();
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
     AND COALESCE(current_setting('crm.module_edit_transaction', true), '') = OLD.id::text THEN
    RETURN crm_private.reconcile_crm_wallet_status(OLD, NEW);
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IN ('completed', 'failed') AND NEW.status IS DISTINCT FROM OLD.status
     AND NOT (OLD.type IN ('deposit', 'nowpayments_deposit') AND OLD.status = 'completed' AND NEW.status = 'failed') THEN
    RAISE EXCEPTION 'A finalized wallet transaction status cannot be reopened';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.type = 'withdrawal' AND OLD.status = 'pending' AND NEW.status = 'failed'
     AND OLD.balance_processed_at IS NOT NULL AND OLD.balance_reversed_at IS NULL THEN
    v_asset := upper(COALESCE(OLD.balance_effect->>'ledger_asset', 'USDT'));
    v_ledger_amount := COALESCE((OLD.balance_effect->>'ledger_amount')::numeric, 0);
    IF v_asset = 'BTC' THEN UPDATE public.balances SET btc_balance = btc_balance + v_ledger_amount, updated_at = now() WHERE user_id = OLD.user_id;
    ELSIF v_asset = 'USD' THEN UPDATE public.balances SET usd_balance = usd_balance + v_ledger_amount, updated_at = now() WHERE user_id = OLD.user_id;
    ELSE UPDATE public.balances SET usdt_balance = usdt_balance + v_ledger_amount, updated_at = now() WHERE user_id = OLD.user_id; END IF;
    NEW.balance_reversed_at := now();
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.type IN ('deposit', 'nowpayments_deposit') AND OLD.status = 'completed'
     AND NEW.status = 'failed' AND OLD.balance_processed_at IS NOT NULL AND OLD.balance_reversed_at IS NULL THEN
    v_asset := upper(COALESCE(OLD.balance_effect->>'ledger_asset', 'USDT'));
    v_ledger_amount := COALESCE((OLD.balance_effect->>'ledger_amount')::numeric, 0);
    IF v_asset = 'USD' THEN
      SELECT usd_balance INTO v_balance FROM public.balances WHERE user_id = OLD.user_id FOR UPDATE;
      IF v_balance < v_ledger_amount THEN RAISE EXCEPTION 'The credited USD deposit has already been used and cannot be reversed'; END IF;
      UPDATE public.balances SET usd_balance = usd_balance - v_ledger_amount, updated_at = now() WHERE user_id = OLD.user_id;
    ELSE
      SELECT usdt_balance INTO v_balance FROM public.balances WHERE user_id = OLD.user_id FOR UPDATE;
      IF v_balance < v_ledger_amount THEN RAISE EXCEPTION 'The credited deposit has already been used and cannot be reversed'; END IF;
      UPDATE public.balances SET usdt_balance = usdt_balance - v_ledger_amount, updated_at = now() WHERE user_id = OLD.user_id;
    END IF;
    NEW.balance_reversed_at := now();
    RETURN NEW;
  END IF;

  IF NEW.status <> 'completed' OR NEW.balance_processed_at IS NOT NULL THEN RETURN NEW; END IF;

  IF NEW.type IN ('deposit', 'nowpayments_deposit') THEN
    v_asset := upper(COALESCE(NEW.currency, 'EUR'));
    IF v_asset = 'USD' THEN
      v_ledger_amount := abs(NEW.amount);
      UPDATE public.balances SET usd_balance = usd_balance + v_ledger_amount, updated_at = now() WHERE user_id = NEW.user_id;
      NEW.balance_effect := jsonb_build_object('ledger_asset', 'USD', 'ledger_amount', v_ledger_amount);
    ELSE
      IF v_asset = 'EUR' THEN v_rate := public.get_current_eur_usd_rate(); v_ledger_amount := round(abs(NEW.amount) * v_rate, 8);
      ELSE v_ledger_amount := abs(NEW.amount); END IF;
      UPDATE public.balances SET usdt_balance = usdt_balance + v_ledger_amount, updated_at = now() WHERE user_id = NEW.user_id;
      NEW.balance_effect := jsonb_build_object('ledger_asset', 'USDT', 'ledger_amount', v_ledger_amount);
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'Wallet balance not found'; END IF;
    NEW.balance_processed_at := now();
    RETURN NEW;
  END IF;

  IF NEW.type = 'withdrawal' THEN
    v_asset := upper(COALESCE(NEW.withdrawal_details->>'currency', NEW.currency, 'EUR'));
    IF v_asset = 'BTC' THEN
      v_ledger_amount := COALESCE((NEW.withdrawal_details->>'amount')::numeric, abs(NEW.amount));
      SELECT btc_balance INTO v_balance FROM public.balances WHERE user_id = NEW.user_id FOR UPDATE;
      IF v_balance < v_ledger_amount THEN RAISE EXCEPTION 'Insufficient BTC balance'; END IF;
      UPDATE public.balances SET btc_balance = btc_balance - v_ledger_amount, updated_at = now() WHERE user_id = NEW.user_id;
    ELSIF v_asset = 'USD' THEN
      v_ledger_amount := abs(NEW.amount);
      SELECT usd_balance INTO v_balance FROM public.balances WHERE user_id = NEW.user_id FOR UPDATE;
      IF v_balance < v_ledger_amount THEN RAISE EXCEPTION 'Insufficient USD balance'; END IF;
      UPDATE public.balances SET usd_balance = usd_balance - v_ledger_amount, updated_at = now() WHERE user_id = NEW.user_id;
    ELSE
      v_ledger_amount := COALESCE((NEW.withdrawal_details->>'source_amount_usd')::numeric, round(abs(NEW.amount) * public.get_current_eur_usd_rate(), 8));
      SELECT usdt_balance INTO v_balance FROM public.balances WHERE user_id = NEW.user_id FOR UPDATE;
      IF v_balance < v_ledger_amount THEN RAISE EXCEPTION 'Insufficient EUR balance'; END IF;
      UPDATE public.balances SET usdt_balance = usdt_balance - v_ledger_amount, updated_at = now() WHERE user_id = NEW.user_id;
      v_asset := 'USDT';
    END IF;
    NEW.balance_effect := jsonb_build_object('ledger_asset', v_asset, 'ledger_amount', v_ledger_amount);
    NEW.balance_processed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_module_record(
  p_target_user_id uuid,
  p_table_name text,
  p_record_id uuid,
  p_changes jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_predicate text;
  v_columns text;
  v_patched_columns text;
  v_before jsonb;
  v_after jsonb;
  v_changes jsonb;
  v_company_id uuid;
  v_previous_transaction text := COALESCE(current_setting('crm.module_edit_transaction', true), '');
BEGIN
  PERFORM public.require_admin();
  PERFORM crm_private.assert_actor_user_access(p_target_user_id);
  IF p_table_name IS NULL OR p_table_name <> ALL(crm_private.editable_module_tables()) THEN
    RAISE EXCEPTION 'This CRM table is not editable';
  END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF jsonb_typeof(p_changes) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Changes must be an object'; END IF;

  v_owner_predicate := CASE WHEN p_table_name = 'referral_earnings'
    THEN '(target.referrer_id = $2 OR target.referred_user_id = $2)'
    ELSE 'target.user_id = $2' END;

  EXECUTE format('SELECT to_jsonb(target) FROM public.%I target WHERE target.id = $1 AND %s FOR UPDATE', p_table_name, v_owner_predicate)
    INTO v_before USING p_record_id, p_target_user_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Record not found for this user'; END IF;

  IF p_table_name = 'referral_earnings' THEN
    PERFORM crm_private.assert_actor_user_access((v_before->>'referrer_id')::uuid);
    PERFORM crm_private.assert_actor_user_access((v_before->>'referred_user_id')::uuid);
  END IF;

  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_changes
  FROM jsonb_each(p_changes)
  WHERE value IS DISTINCT FROM v_before->key
    AND key NOT IN ('id', 'user_id', 'referrer_id', 'referred_user_id', 'created_at', 'updated_at');

  IF p_table_name = 'transactions' AND v_changes ?| ARRAY[
    'balance_effect', 'balance_processed_at', 'balance_reversed_at', 'tickets_processed'
  ] THEN RAISE EXCEPTION 'Wallet ledger metadata is managed automatically'; END IF;

  IF v_changes = '{}'::jsonb THEN RETURN v_before; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(v_changes) k
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = p_table_name AND c.column_name = k
        AND c.is_generated = 'NEVER'
    )
  ) THEN RAISE EXCEPTION 'Changes contain an unknown or generated field'; END IF;

  SELECT
    string_agg(format('%I', c.column_name), ', ' ORDER BY c.ordinal_position),
    string_agg(format('patched.%I', c.column_name), ', ' ORDER BY c.ordinal_position)
  INTO v_columns, v_patched_columns
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = p_table_name
    AND c.column_name IN (SELECT jsonb_object_keys(v_changes));

  IF p_table_name = 'transactions' THEN
    PERFORM set_config('crm.module_edit_transaction', p_record_id::text, true);
  END IF;
  EXECUTE format(
    'UPDATE public.%1$I AS target SET (%2$s) = (SELECT %3$s FROM jsonb_populate_record(target, $1) AS patched) WHERE target.id = $2 AND %4$s RETURNING to_jsonb(target)',
    p_table_name, v_columns, v_patched_columns, replace(v_owner_predicate, '$2', '$3')
  ) INTO v_after USING v_changes, p_record_id, p_target_user_id;
  IF p_table_name = 'transactions' THEN
    PERFORM set_config('crm.module_edit_transaction', v_previous_transaction, true);
  END IF;

  SELECT company_id INTO v_company_id FROM public.users WHERE id = p_target_user_id;
  INSERT INTO public.admin_action_logs(admin_user_id, target_user_id, company_id, action, before_data, after_data, reason)
  VALUES (auth.uid(), p_target_user_id, v_company_id, 'update_' || p_table_name, v_before, v_after, btrim(p_reason));
  RETURN v_after;
END;
$$;

REVOKE ALL ON FUNCTION crm_private.editable_module_tables() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION crm_private.reconcile_crm_wallet_status(public.transactions, public.transactions) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_get_module_edit_options(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_module_record(uuid, text, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_module_edit_options(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_module_record(uuid, text, uuid, jsonb, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

