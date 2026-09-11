/* Make wallet deposits and withdrawals atomic, auditable, and realtime. */

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS balance_effect jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS balance_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS balance_reversed_at timestamptz;

ALTER TABLE public.crypto_payment_requests
  ALTER COLUMN price_currency SET DEFAULT 'eur';

UPDATE public.transactions
SET currency = 'BTC'
WHERE currency IS NULL
  AND description LIKE 'CRM BTC balance adjustment:%';

/* Existing completed rows predate balance-effect tracking. Mark them as legacy
   so editing descriptive fields cannot credit/debit them a second time. */
UPDATE public.transactions
SET balance_effect = jsonb_build_object('legacy', true),
    balance_processed_at = COALESCE(updated_at, created_at, now())
WHERE status = 'completed'
  AND type IN ('deposit', 'nowpayments_deposit', 'withdrawal')
  AND balance_processed_at IS NULL;

CREATE OR REPLACE FUNCTION public.get_current_eur_usd_rate()
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rate numeric;
BEGIN
  SELECT md.price INTO v_rate
  FROM public.market_data AS md
  WHERE replace(replace(upper(md.symbol), '/', ''), '=X', '') = 'EURUSD'
    AND md.timestamp >= now() - interval '72 hours'
    AND md.price > 0
  ORDER BY md.timestamp DESC
  LIMIT 1;

  IF COALESCE(v_rate, 0) <= 0 THEN
    RAISE EXCEPTION 'A current EUR/USD market rate is unavailable. Please try again shortly.';
  END IF;

  RETURN v_rate;
END;
$$;

REVOKE ALL ON FUNCTION public.get_current_eur_usd_rate() FROM PUBLIC, anon, authenticated;

/* Wallet ledgers are read-only from browsers. All writes must go through the
   purpose-built atomic RPCs, admin RPCs, or service-role settlement. */
DROP POLICY IF EXISTS "Users can manage own balances" ON public.balances;
DROP POLICY IF EXISTS "Users can update own balances" ON public.balances;
DROP POLICY IF EXISTS "Users can read own balances" ON public.balances;
CREATE POLICY "Users can read own balances"
  ON public.balances FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow insert during user creation" ON public.balances;
CREATE POLICY "Allow insert during user creation"
  ON public.balances FOR INSERT TO public
  WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Users can manage own assets" ON public.user_assets;
DROP POLICY IF EXISTS "Users can read own assets" ON public.user_assets;
CREATE POLICY "Users can read own assets"
  ON public.user_assets FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow insert during user creation" ON public.user_assets;
CREATE POLICY "Allow insert during user creation"
  ON public.user_assets FOR INSERT TO public
  WITH CHECK (auth.uid() IS NULL);

/* This legacy helper accepted arbitrary SQL under definer privileges and is
   not used by the application. It must never be callable from a client. */
REVOKE ALL ON FUNCTION public.execute_with_lock(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_with_lock(text, text) TO service_role;

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
    IF OLD.type = 'withdrawal'
       AND OLD.status = 'pending'
       AND OLD.balance_processed_at IS NOT NULL
       AND OLD.balance_reversed_at IS NULL THEN
      v_asset := upper(COALESCE(OLD.balance_effect->>'ledger_asset', 'USDT'));
      v_ledger_amount := COALESCE((OLD.balance_effect->>'ledger_amount')::numeric, 0);
      IF v_asset = 'BTC' THEN
        UPDATE public.balances SET btc_balance = btc_balance + v_ledger_amount, updated_at = now() WHERE user_id = OLD.user_id;
      ELSE
        UPDATE public.balances SET usdt_balance = usdt_balance + v_ledger_amount, updated_at = now() WHERE user_id = OLD.user_id;
      END IF;
    ELSIF OLD.type IN ('deposit', 'nowpayments_deposit')
       AND OLD.status = 'completed'
       AND OLD.balance_processed_at IS NOT NULL
       AND OLD.balance_reversed_at IS NULL THEN
      v_ledger_amount := COALESCE((OLD.balance_effect->>'ledger_amount')::numeric, 0);
      SELECT b.usdt_balance INTO v_balance FROM public.balances b WHERE b.user_id = OLD.user_id FOR UPDATE;
      IF v_balance < v_ledger_amount THEN RAISE EXCEPTION 'The credited deposit has already been used and cannot be deleted'; END IF;
      UPDATE public.balances SET usdt_balance = usdt_balance - v_ledger_amount, updated_at = now() WHERE user_id = OLD.user_id;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.balance_processed_at IS NOT NULL AND (
    NEW.user_id IS DISTINCT FROM OLD.user_id OR
    NEW.type IS DISTINCT FROM OLD.type OR
    NEW.amount IS DISTINCT FROM OLD.amount OR
    NEW.currency IS DISTINCT FROM OLD.currency OR
    NEW.withdrawal_details IS DISTINCT FROM OLD.withdrawal_details OR
    NEW.balance_effect IS DISTINCT FROM OLD.balance_effect
  ) THEN
    RAISE EXCEPTION 'Processed wallet transaction financial fields are immutable';
  END IF;

  /* These are audit rows for balance changes already performed by their
     owning RPC (or an isolated sandbox ledger), not wallet instructions. */
  IF TG_OP = 'INSERT' AND (
    COALESCE(NEW.description, '') LIKE 'CRM balance adjustment:%' OR
    COALESCE(NEW.description, '') LIKE 'CRM BTC balance adjustment:%' OR
    COALESCE(NEW.description, '') LIKE 'Sandbox payment deposit%'
  ) THEN
    IF COALESCE(NEW.description, '') LIKE 'CRM BTC balance adjustment:%' THEN
      NEW.currency := 'BTC';
    END IF;
    NEW.balance_effect := jsonb_build_object('external_balance_change', true);
    NEW.balance_processed_at := now();
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status IN ('completed', 'failed')
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NOT (OLD.type IN ('deposit', 'nowpayments_deposit') AND OLD.status = 'completed' AND NEW.status = 'failed') THEN
    RAISE EXCEPTION 'A finalized wallet transaction status cannot be reopened';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.type = 'withdrawal'
     AND OLD.status = 'pending'
     AND NEW.status = 'failed'
     AND OLD.balance_processed_at IS NOT NULL
     AND OLD.balance_reversed_at IS NULL THEN
    v_asset := upper(COALESCE(OLD.balance_effect->>'ledger_asset', 'USDT'));
    v_ledger_amount := COALESCE((OLD.balance_effect->>'ledger_amount')::numeric, 0);
    IF v_asset = 'BTC' THEN
      UPDATE public.balances SET btc_balance = btc_balance + v_ledger_amount, updated_at = now() WHERE user_id = OLD.user_id;
    ELSE
      UPDATE public.balances SET usdt_balance = usdt_balance + v_ledger_amount, updated_at = now() WHERE user_id = OLD.user_id;
    END IF;
    NEW.balance_reversed_at := now();
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.type IN ('deposit', 'nowpayments_deposit')
     AND OLD.status = 'completed'
     AND NEW.status = 'failed'
     AND OLD.balance_processed_at IS NOT NULL
     AND OLD.balance_reversed_at IS NULL THEN
    v_ledger_amount := COALESCE((OLD.balance_effect->>'ledger_amount')::numeric, 0);
    SELECT b.usdt_balance INTO v_balance FROM public.balances b WHERE b.user_id = OLD.user_id FOR UPDATE;
    IF v_balance < v_ledger_amount THEN RAISE EXCEPTION 'The credited deposit has already been used and cannot be reversed'; END IF;
    UPDATE public.balances SET usdt_balance = usdt_balance - v_ledger_amount, updated_at = now() WHERE user_id = OLD.user_id;
    NEW.balance_reversed_at := now();
    RETURN NEW;
  END IF;

  IF NEW.status <> 'completed' OR NEW.balance_processed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.type IN ('deposit', 'nowpayments_deposit') THEN
    IF upper(COALESCE(NEW.currency, 'USDT')) = 'EUR' THEN
      v_rate := public.get_current_eur_usd_rate();
      v_ledger_amount := round(abs(NEW.amount) * v_rate, 8);
    ELSE
      v_ledger_amount := abs(NEW.amount);
    END IF;

    UPDATE public.balances
    SET usdt_balance = usdt_balance + v_ledger_amount, updated_at = now()
    WHERE user_id = NEW.user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Wallet balance not found'; END IF;

    NEW.balance_effect := jsonb_build_object('ledger_asset', 'USDT', 'ledger_amount', v_ledger_amount);
    NEW.balance_processed_at := now();
    RETURN NEW;
  END IF;

  IF NEW.type = 'withdrawal' THEN
    v_asset := upper(COALESCE(NEW.withdrawal_details->>'currency', NEW.currency, 'USDT'));
    IF v_asset = 'BTC' THEN
      v_ledger_amount := COALESCE((NEW.withdrawal_details->>'amount')::numeric, abs(NEW.amount));
      SELECT b.btc_balance INTO v_balance FROM public.balances b WHERE b.user_id = NEW.user_id FOR UPDATE;
      IF v_balance < v_ledger_amount THEN RAISE EXCEPTION 'Insufficient BTC balance'; END IF;
      UPDATE public.balances SET btc_balance = btc_balance - v_ledger_amount, updated_at = now() WHERE user_id = NEW.user_id;
    ELSE
      IF v_asset = 'EUR' THEN
        v_ledger_amount := COALESCE(
          (NEW.withdrawal_details->>'source_amount_usd')::numeric,
          round(abs(NEW.amount) * public.get_current_eur_usd_rate(), 8)
        );
      ELSE
        v_ledger_amount := abs(NEW.amount);
      END IF;
      SELECT b.usdt_balance INTO v_balance FROM public.balances b WHERE b.user_id = NEW.user_id FOR UPDATE;
      IF v_balance < v_ledger_amount THEN RAISE EXCEPTION 'Insufficient fiat balance'; END IF;
      UPDATE public.balances SET usdt_balance = usdt_balance - v_ledger_amount, updated_at = now() WHERE user_id = NEW.user_id;
      v_asset := 'USDT';
    END IF;

    NEW.balance_effect := jsonb_build_object('ledger_asset', v_asset, 'ledger_amount', v_ledger_amount);
    NEW.balance_processed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_trigger record;
BEGIN
  FOR v_trigger IN
    SELECT tgname
    FROM pg_trigger
    WHERE tgrelid = 'public.transactions'::regclass
      AND tgfoid = 'public.handle_transaction_balance_update()'::regprocedure
      AND NOT tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER %I ON public.transactions', v_trigger.tgname);
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS apply_wallet_transaction_balance_trigger ON public.transactions;
CREATE TRIGGER apply_wallet_transaction_balance_trigger
BEFORE INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.apply_wallet_transaction_balance();

CREATE OR REPLACE FUNCTION public.request_bank_withdrawal(
  p_amount_eur numeric,
  p_bank_name text,
  p_account_number text,
  p_routing_number text,
  p_beneficiary_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_rate numeric;
  v_ledger_amount numeric;
  v_balance numeric;
  v_reserved_margin numeric;
  v_transaction_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_user_id AND u.kyc_status = 'verified') THEN
    RAISE EXCEPTION 'Identity verification is required before withdrawing funds';
  END IF;
  IF p_amount_eur IS NULL OR p_amount_eur < 100 THEN RAISE EXCEPTION 'Minimum bank withdrawal is EUR 100'; END IF;
  IF p_amount_eur > 1000000 THEN RAISE EXCEPTION 'Maximum bank withdrawal is EUR 1,000,000'; END IF;
  IF btrim(COALESCE(p_bank_name, '')) = '' OR btrim(COALESCE(p_account_number, '')) = '' OR
     btrim(COALESCE(p_routing_number, '')) = '' OR btrim(COALESCE(p_beneficiary_name, '')) = '' THEN
    RAISE EXCEPTION 'Complete bank details are required';
  END IF;

  v_rate := public.get_current_eur_usd_rate();
  v_ledger_amount := round(p_amount_eur * v_rate, 8);

  SELECT b.usdt_balance INTO v_balance
  FROM public.balances b WHERE b.user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet balance not found'; END IF;

  SELECT
    COALESCE((SELECT sum(fp.margin) FROM public.futures_positions fp WHERE fp.user_id = v_user_id AND fp.is_open = true), 0) +
    COALESCE((SELECT sum(fo.reserved_margin) FROM public.futures_orders fo WHERE fo.user_id = v_user_id AND fo.status = 'open'), 0)
  INTO v_reserved_margin;

  IF v_ledger_amount > GREATEST(v_balance - v_reserved_margin, 0) THEN
    RAISE EXCEPTION 'Insufficient withdrawable EUR balance';
  END IF;

  UPDATE public.balances SET usdt_balance = usdt_balance - v_ledger_amount, updated_at = now() WHERE user_id = v_user_id;

  INSERT INTO public.transactions(
    user_id, type, amount, currency, description, status, withdrawal_details,
    balance_effect, balance_processed_at
  ) VALUES (
    v_user_id, 'withdrawal', -p_amount_eur, 'EUR',
    'Bank withdrawal of EUR ' || trim(to_char(p_amount_eur, 'FM999999999999990.00')) || ' via ' || btrim(p_bank_name) ||
      ' (account ****' || right(btrim(p_account_number), 4) || ')',
    'pending',
    jsonb_build_object(
      'currency', 'EUR', 'amount', p_amount_eur, 'source_amount_usd', v_ledger_amount,
      'payout_currency', 'EUR', 'estimated_payout_eur', round(p_amount_eur * 0.995, 2),
      'fee_eur', round(p_amount_eur * 0.005, 2), 'eur_usd_rate', v_rate,
      'bank_name', btrim(p_bank_name), 'account_number', btrim(p_account_number),
      'routing_number', btrim(p_routing_number), 'beneficiary_name', btrim(p_beneficiary_name),
      'withdrawal_type', 'bank', 'created_at', now()
    ),
    jsonb_build_object('ledger_asset', 'USDT', 'ledger_amount', v_ledger_amount),
    now()
  ) RETURNING id INTO v_transaction_id;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_transaction_id, 'status', 'pending');
END;
$$;

CREATE OR REPLACE FUNCTION public.request_btc_withdrawal(
  p_amount_btc numeric,
  p_address text,
  p_network text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_balance numeric;
  v_network text := upper(btrim(p_network));
  v_transaction_id uuid;
  v_fee constant numeric := 0.0005;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_user_id AND u.kyc_status = 'verified') THEN
    RAISE EXCEPTION 'Identity verification is required before withdrawing funds';
  END IF;
  IF p_amount_btc IS NULL OR p_amount_btc < 0.001 THEN RAISE EXCEPTION 'Minimum BTC withdrawal is 0.001 BTC'; END IF;
  IF btrim(COALESCE(p_address, '')) = '' OR length(btrim(p_address)) < 14 THEN RAISE EXCEPTION 'A valid BTC destination is required'; END IF;
  IF v_network NOT IN ('BTC', 'LIGHTNING') THEN RAISE EXCEPTION 'Unsupported BTC network'; END IF;
  IF p_amount_btc <= v_fee THEN RAISE EXCEPTION 'Withdrawal amount must exceed the network fee'; END IF;

  SELECT b.btc_balance INTO v_balance
  FROM public.balances b WHERE b.user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet balance not found'; END IF;
  IF p_amount_btc > v_balance THEN RAISE EXCEPTION 'Insufficient BTC balance'; END IF;

  UPDATE public.balances SET btc_balance = btc_balance - p_amount_btc, updated_at = now() WHERE user_id = v_user_id;

  INSERT INTO public.transactions(
    user_id, type, amount, currency, description, status, withdrawal_details,
    balance_effect, balance_processed_at
  ) VALUES (
    v_user_id, 'withdrawal', -p_amount_btc, 'BTC',
    'BTC withdrawal of ' || trim(to_char(p_amount_btc, 'FM999999999999990.99999999')) ||
      ' BTC to ' || left(btrim(p_address), 8) || '...' || right(btrim(p_address), 8),
    'pending',
    jsonb_build_object(
      'currency', 'BTC', 'amount', p_amount_btc, 'recipient_address', btrim(p_address),
      'network', v_network, 'fee_btc', v_fee, 'estimated_payout_btc', p_amount_btc - v_fee,
      'withdrawal_type', 'crypto', 'created_at', now()
    ),
    jsonb_build_object('ledger_asset', 'BTC', 'ledger_amount', p_amount_btc),
    now()
  ) RETURNING id INTO v_transaction_id;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_transaction_id, 'status', 'pending');
END;
$$;

REVOKE ALL ON FUNCTION public.request_bank_withdrawal(numeric, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_btc_withdrawal(numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_bank_withdrawal(numeric, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_btc_withdrawal(numeric, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.finalize_nowpayments_payment(
  p_provider_payment_id text,
  p_payment_status text,
  p_actually_paid numeric,
  p_provider_response jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment public.crypto_payment_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_payment
  FROM public.crypto_payment_requests
  WHERE provider_payment_id = p_provider_payment_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment request not found'; END IF;

  UPDATE public.crypto_payment_requests
  SET payment_status = p_payment_status,
      actually_paid = COALESCE(p_actually_paid, actually_paid),
      provider_response = COALESCE(p_provider_response, provider_response)
  WHERE id = v_payment.id;

  IF p_payment_status = 'finished' AND NOT v_payment.credited THEN
    INSERT INTO public.transactions(user_id, type, amount, currency, status, description)
    VALUES (
      v_payment.user_id, 'nowpayments_deposit', v_payment.price_amount,
      upper(v_payment.price_currency), 'completed',
      'Crypto deposit completed - payment ' || v_payment.provider_payment_id
    );

    UPDATE public.crypto_payment_requests
    SET credited = true, credited_at = now()
    WHERE id = v_payment.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'payment_status', p_payment_status,
    'credited', p_payment_status = 'finished' OR v_payment.credited
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_nowpayments_payment(text, text, numeric, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_nowpayments_payment(text, text, numeric, jsonb) TO service_role;

DROP POLICY IF EXISTS "Users can create own non-deposit transactions" ON public.transactions;
CREATE POLICY "Users can create own non-deposit transactions"
  ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND type NOT IN ('deposit', 'withdrawal'));

DROP POLICY IF EXISTS "Users can update own non-deposit transactions" ON public.transactions;
CREATE POLICY "Users can update own non-deposit transactions"
  ON public.transactions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND type NOT IN ('deposit', 'withdrawal'))
  WITH CHECK (auth.uid() = user_id AND type NOT IN ('deposit', 'withdrawal'));

DROP POLICY IF EXISTS "Users can delete own non-deposit transactions" ON public.transactions;
CREATE POLICY "Users can delete own non-deposit transactions"
  ON public.transactions FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND type NOT IN ('deposit', 'withdrawal'));

DO $$
DECLARE
  v_table text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH v_table IN ARRAY ARRAY[
      'balances', 'user_assets', 'transactions', 'user_stakes', 'robot_states',
      'futures_positions', 'futures_orders', 'futures_position_history', 'crypto_payment_requests'
    ] LOOP
      IF to_regclass('public.' || v_table) IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = v_table
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
      END IF;
      IF to_regclass('public.' || v_table) IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', v_table);
      END IF;
    END LOOP;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
