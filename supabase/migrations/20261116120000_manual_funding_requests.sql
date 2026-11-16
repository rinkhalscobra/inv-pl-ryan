/* Client funding requests are reviewed in the CRM. Instructions belong to a
   company and may be overridden for one client. Never expose another client's
   destination or let clients settle their own requests. */

CREATE TABLE public.deposit_payment_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('btc', 'crypto', 'bank')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX deposit_instructions_shared_key ON public.deposit_payment_instructions(company_id, method) WHERE user_id IS NULL;
CREATE UNIQUE INDEX deposit_instructions_client_key ON public.deposit_payment_instructions(user_id, method) WHERE user_id IS NOT NULL;
ALTER TABLE public.deposit_payment_instructions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deposit_payment_instructions FROM anon, authenticated;

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS deposit_details jsonb;

-- Keep the existing non-funding app transactions available, but funnel all
-- deposit and withdrawal mutations through authenticated server functions.
DROP POLICY IF EXISTS "Users can create own non-deposit transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can update own non-deposit transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can delete own non-deposit transactions" ON public.transactions;
CREATE POLICY "Users can create own non-funding transactions" ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND type NOT IN ('deposit', 'nowpayments_deposit', 'withdrawal'));
CREATE POLICY "Users can update own non-funding transactions" ON public.transactions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND type NOT IN ('deposit', 'nowpayments_deposit', 'withdrawal'))
  WITH CHECK (auth.uid() = user_id AND type NOT IN ('deposit', 'nowpayments_deposit', 'withdrawal'));
CREATE POLICY "Users can delete own non-funding transactions" ON public.transactions FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND type NOT IN ('deposit', 'nowpayments_deposit', 'withdrawal'));

CREATE OR REPLACE FUNCTION public.get_deposit_payment_instructions(p_method text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid := auth.uid(); v_result jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_method IS NULL OR p_method NOT IN ('btc','crypto','bank') THEN RAISE EXCEPTION 'Unsupported deposit method'; END IF;
  SELECT jsonb_build_object('id', i.id, 'method', i.method, 'details', i.details) INTO v_result
  FROM public.deposit_payment_instructions i JOIN public.users u ON u.id = v_user AND u.company_id = i.company_id
  WHERE i.method = p_method AND (i.user_id = v_user OR i.user_id IS NULL)
  ORDER BY (i.user_id IS NOT NULL) DESC LIMIT 1;
  -- Preserve existing bank instructions until the CRM has saved a replacement.
  IF v_result IS NULL AND p_method = 'bank' THEN
    SELECT jsonb_build_object('method','bank','details',jsonb_strip_nulls(jsonb_build_object(
      'bank_name',b.bank_name,'account_number',b.account_number,'routing_number',b.routing_number,
      'swift_code',b.swift_code,'beneficiary_name',b.beneficiary_name,'iban',b.iban,'currency',b.currency)))
    INTO v_result FROM public.client_bank_details b WHERE b.user_id = v_user;
  END IF;
  RETURN COALESCE(v_result, jsonb_build_object('method', p_method, 'details', '{}'::jsonb));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_get_deposit_payment_instructions(p_target_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_company uuid;
BEGIN
  PERFORM public.require_admin();
  PERFORM crm_private.assert_actor_user_access(p_target_user_id);
  SELECT company_id INTO v_company FROM public.users WHERE id = p_target_user_id;
  RETURN jsonb_build_object(
    'shared', COALESCE((SELECT jsonb_agg(to_jsonb(i)) FROM public.deposit_payment_instructions i WHERE company_id=v_company AND user_id IS NULL), '[]'::jsonb),
    'client', COALESCE((SELECT jsonb_agg(to_jsonb(i)) FROM public.deposit_payment_instructions i WHERE company_id=v_company AND user_id=p_target_user_id), '[]'::jsonb)
  );
END; $$;

CREATE OR REPLACE FUNCTION public.admin_save_deposit_payment_instructions(
  p_target_user_id uuid, p_method text, p_scope text, p_details jsonb, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_company uuid; v_user uuid; v_before jsonb; v_after jsonb;
BEGIN
  PERFORM public.require_admin();
  PERFORM crm_private.assert_actor_user_access(p_target_user_id);
  SELECT company_id INTO v_company FROM public.users WHERE id=p_target_user_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Client company not found'; END IF;
  IF p_method IS NULL OR p_method NOT IN ('btc','crypto','bank') THEN RAISE EXCEPTION 'Unsupported deposit method'; END IF;
  IF p_scope IS NULL OR p_scope NOT IN ('client','shared') THEN RAISE EXCEPTION 'Invalid instruction scope'; END IF;
  IF btrim(COALESCE(p_reason,''))='' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF p_details IS NOT NULL AND (jsonb_typeof(p_details) <> 'object' OR octet_length(p_details::text)>16000) THEN
    RAISE EXCEPTION 'Payment instructions must be an object of at most 16 KB';
  END IF;
  IF p_details IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_each(p_details) WHERE jsonb_typeof(value)<>'string' OR length(key)>100 OR length(value #>> '{}')>4000) THEN
    RAISE EXCEPTION 'Instruction fields must contain text of at most 4,000 characters';
  END IF;
  v_user := CASE WHEN p_scope='client' THEN p_target_user_id ELSE NULL END;
  -- Serialize edits, including creation of a previously missing instruction.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_company::text || ':' || COALESCE(v_user::text,'shared') || ':' || p_method, 0));
  SELECT to_jsonb(i) INTO v_before FROM public.deposit_payment_instructions i
  WHERE company_id=v_company AND user_id IS NOT DISTINCT FROM v_user AND method=p_method FOR UPDATE;
  IF p_details IS NULL THEN
    DELETE FROM public.deposit_payment_instructions WHERE company_id=v_company AND user_id IS NOT DISTINCT FROM v_user AND method=p_method;
  ELSIF v_before IS NULL THEN
    INSERT INTO public.deposit_payment_instructions(company_id,user_id,method,details,updated_by)
    VALUES(v_company,v_user,p_method,p_details,auth.uid()) RETURNING to_jsonb(deposit_payment_instructions) INTO v_after;
  ELSE
    UPDATE public.deposit_payment_instructions SET details=p_details,updated_by=auth.uid(),updated_at=now()
    WHERE id=(v_before->>'id')::uuid RETURNING to_jsonb(deposit_payment_instructions) INTO v_after;
  END IF;
  INSERT INTO public.admin_action_logs(admin_user_id,target_user_id,company_id,action,before_data,after_data,reason)
  VALUES(auth.uid(),CASE WHEN p_scope='client' THEN p_target_user_id ELSE NULL END,v_company,
    'save_deposit_payment_instructions',v_before,v_after,btrim(p_reason));
  RETURN COALESCE(v_after,'{}'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.request_manual_deposit(
  p_method text, p_amount numeric, p_currency text, p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid := auth.uid(); v_currency text := upper(btrim(p_currency)); v_row public.transactions; v_instructions jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=v_user) THEN RAISE EXCEPTION 'Client account not found'; END IF;
  IF p_method IS NULL OR p_method NOT IN ('btc','crypto','bank') THEN RAISE EXCEPTION 'Unsupported deposit method'; END IF;
  IF v_currency IS NULL OR (p_method='btc' AND v_currency<>'BTC') OR (p_method<>'btc' AND v_currency NOT IN ('EUR','USD')) THEN
    RAISE EXCEPTION 'Unsupported deposit currency for this method';
  END IF;
  IF p_amount IS NULL OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_amount > 1000000
    OR p_amount < (CASE WHEN v_currency='BTC' THEN 0.0001 ELSE 10 END) THEN RAISE EXCEPTION 'Invalid deposit amount'; END IF;
  IF p_amount <> round(p_amount,CASE WHEN v_currency='BTC' THEN 8 ELSE 2 END) THEN RAISE EXCEPTION 'Invalid amount precision'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request reference is required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  SELECT * INTO v_row FROM public.transactions WHERE id=p_request_id;
  IF FOUND THEN
    IF v_row.user_id<>v_user OR v_row.type<>'deposit' OR v_row.deposit_details->>'method' IS DISTINCT FROM p_method
      OR v_row.amount<>p_amount OR v_row.currency<>v_currency THEN RAISE EXCEPTION 'Request reference already used'; END IF;
  ELSE
    v_instructions := public.get_deposit_payment_instructions(p_method);
    INSERT INTO public.transactions(id,user_id,type,amount,currency,status,description,deposit_details)
    VALUES(p_request_id,v_user,'deposit',p_amount,v_currency,'pending',
      CASE p_method WHEN 'btc' THEN 'Bitcoin' WHEN 'crypto' THEN 'Crypto' ELSE 'Bank transfer' END || ' deposit request',
      jsonb_build_object('method',p_method,'instructions',v_instructions->'details')) RETURNING * INTO v_row;
  END IF;
  RETURN to_jsonb(v_row);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_get_funding_requests(p_target_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.require_admin();
  PERFORM crm_private.assert_actor_user_access(p_target_user_id);
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY (t.status='pending') DESC,t.created_at DESC)
    FROM public.transactions t WHERE t.user_id=p_target_user_id AND t.type IN ('deposit','nowpayments_deposit','withdrawal')
    AND (t.status='pending' OR t.id IN (SELECT id FROM public.transactions WHERE user_id=p_target_user_id
      AND type IN ('deposit','nowpayments_deposit','withdrawal') ORDER BY created_at DESC LIMIT 50))), '[]'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_review_funding_request(
  p_target_user_id uuid, p_transaction_id uuid, p_decision text, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.transactions; v_status text;
BEGIN
  PERFORM public.require_admin();
  PERFORM crm_private.assert_actor_user_access(p_target_user_id);
  IF p_decision IS NULL OR p_decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'Invalid review decision'; END IF;
  IF btrim(COALESCE(p_reason,''))='' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT * INTO v_row FROM public.transactions WHERE id=p_transaction_id AND user_id=p_target_user_id
    AND type IN ('deposit','nowpayments_deposit','withdrawal') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funding request not found for this client'; END IF;
  v_status := CASE WHEN p_decision='approve' THEN 'completed' ELSE 'failed' END;
  IF v_row.status=v_status THEN RETURN to_jsonb(v_row); END IF;
  IF v_row.status<>'pending' THEN RAISE EXCEPTION 'This request has already been reviewed'; END IF;
  RETURN public.admin_update_module_record(p_target_user_id,'transactions',p_transaction_id,jsonb_build_object('status',v_status),p_reason);
END; $$;

REVOKE ALL ON FUNCTION public.get_deposit_payment_instructions(text),public.request_manual_deposit(text,numeric,text,uuid),
  public.admin_get_deposit_payment_instructions(uuid),public.admin_save_deposit_payment_instructions(uuid,text,text,jsonb,text),
  public.admin_get_funding_requests(uuid),public.admin_review_funding_request(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_deposit_payment_instructions(text),public.request_manual_deposit(text,numeric,text,uuid),
  public.admin_get_deposit_payment_instructions(uuid),public.admin_save_deposit_payment_instructions(uuid,text,text,jsonb,text),
  public.admin_get_funding_requests(uuid),public.admin_review_funding_request(uuid,uuid,text,text) TO authenticated;

/* BTC deposits settle in BTC; keep the existing audited status and reversal semantics. */

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
    IF v_asset = 'BTC' THEN
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
      IF v_asset = 'BTC' THEN
        SELECT btc_balance INTO v_balance FROM public.balances WHERE user_id = OLD.user_id FOR UPDATE;
        IF v_balance < v_ledger_amount THEN RAISE EXCEPTION 'The credited BTC deposit has already been used and cannot be deleted'; END IF;
        UPDATE public.balances SET btc_balance = btc_balance - v_ledger_amount, updated_at = now() WHERE user_id = OLD.user_id;
      ELSIF v_asset = 'USD' THEN
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
    NEW.deposit_details IS DISTINCT FROM OLD.deposit_details OR
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
    IF v_asset = 'BTC' THEN
      SELECT btc_balance INTO v_balance FROM public.balances WHERE user_id = OLD.user_id FOR UPDATE;
      IF v_balance < v_ledger_amount THEN RAISE EXCEPTION 'The credited BTC deposit has already been used and cannot be reversed'; END IF;
      UPDATE public.balances SET btc_balance = btc_balance - v_ledger_amount, updated_at = now() WHERE user_id = OLD.user_id;
    ELSIF v_asset = 'USD' THEN
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
    IF v_asset = 'BTC' THEN
      v_ledger_amount := abs(NEW.amount);
      UPDATE public.balances SET btc_balance = btc_balance + v_ledger_amount, updated_at = now() WHERE user_id = NEW.user_id;
      NEW.balance_effect := jsonb_build_object('ledger_asset', 'BTC', 'ledger_amount', v_ledger_amount);
    ELSIF v_asset = 'USD' THEN
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


/* Preserve atomic pending withdrawals and reject invalid numeric or destination inputs. */

CREATE OR REPLACE FUNCTION public.request_fiat_withdrawal(
  p_currency text, p_amount numeric, p_bank_name text, p_account_number text,
  p_routing_number text, p_beneficiary_name text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user_id uuid := auth.uid(); v_currency text := upper(btrim(p_currency));
  v_rate numeric := 1; v_ledger_amount numeric; v_balance numeric; v_reserved numeric := 0; v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_currency IS NULL OR v_currency NOT IN ('EUR','USD') THEN RAISE EXCEPTION 'Unsupported withdrawal currency'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=v_user_id AND kyc_status='verified') THEN RAISE EXCEPTION 'Identity verification is required before withdrawing funds'; END IF;
  IF p_amount IS NULL OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_amount <> round(p_amount,2) OR p_amount < 100 OR p_amount > 1000000 THEN RAISE EXCEPTION 'Withdrawal amount must be between 100 and 1,000,000'; END IF;
  IF btrim(COALESCE(p_bank_name,''))='' OR btrim(COALESCE(p_account_number,''))='' OR btrim(COALESCE(p_routing_number,''))='' OR btrim(COALESCE(p_beneficiary_name,''))='' THEN RAISE EXCEPTION 'Complete bank details are required'; END IF;
  IF v_currency='EUR' THEN
    v_rate := public.get_current_eur_usd_rate(); v_ledger_amount := round(p_amount*v_rate,8);
    SELECT usdt_balance INTO v_balance FROM public.balances WHERE user_id=v_user_id FOR UPDATE;
    SELECT COALESCE((SELECT sum(margin) FROM public.futures_positions WHERE user_id=v_user_id AND is_open=true),0)+COALESCE((SELECT sum(reserved_margin) FROM public.futures_orders WHERE user_id=v_user_id AND status='open'),0) INTO v_reserved;
  ELSE
    v_ledger_amount := p_amount;
    SELECT usd_balance INTO v_balance FROM public.balances WHERE user_id=v_user_id FOR UPDATE;
  END IF;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'Wallet balance not found'; END IF;
  IF v_ledger_amount > GREATEST(v_balance-v_reserved,0) THEN RAISE EXCEPTION 'Insufficient withdrawable % balance',v_currency; END IF;
  IF v_currency='EUR' THEN UPDATE public.balances SET usdt_balance=usdt_balance-v_ledger_amount,updated_at=now() WHERE user_id=v_user_id;
  ELSE UPDATE public.balances SET usd_balance=usd_balance-v_ledger_amount,updated_at=now() WHERE user_id=v_user_id; END IF;
  INSERT INTO public.transactions(user_id,type,amount,currency,description,status,withdrawal_details,balance_effect,balance_processed_at)
  VALUES(v_user_id,'withdrawal',-p_amount,v_currency,'Bank withdrawal of '||v_currency||' '||trim(to_char(p_amount,'FM999999999999990.00'))||' via '||btrim(p_bank_name),'pending',
    jsonb_build_object('currency',v_currency,'amount',p_amount,'source_amount_usd',v_ledger_amount,'payout_currency',v_currency,'estimated_payout',round(p_amount*0.995,2),'fee',round(p_amount*0.005,2),'bank_name',btrim(p_bank_name),'account_number',btrim(p_account_number),'routing_number',btrim(p_routing_number),'beneficiary_name',btrim(p_beneficiary_name),'withdrawal_type','bank','created_at',now()),
    jsonb_build_object('ledger_asset',CASE WHEN v_currency='USD' THEN 'USD' ELSE 'USDT' END,'ledger_amount',v_ledger_amount),now()) RETURNING id INTO v_id;
  RETURN jsonb_build_object('success',true,'transaction_id',v_id,'currency',v_currency,'status','pending');
END; $$;

REVOKE ALL ON FUNCTION public.request_fiat_withdrawal(text,numeric,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_fiat_withdrawal(text,numeric,text,text,text,text) TO authenticated;

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
  IF p_amount_btc IS NULL OR p_amount_btc::text IN ('NaN','Infinity','-Infinity') OR p_amount_btc <> round(p_amount_btc,8) OR p_amount_btc < 0.001 THEN RAISE EXCEPTION 'Minimum BTC withdrawal is 0.001 BTC'; END IF;
  IF btrim(COALESCE(p_address, '')) = '' OR length(btrim(p_address)) < 14 THEN RAISE EXCEPTION 'A valid BTC destination is required'; END IF;
  IF v_network IS NULL OR v_network NOT IN ('BTC', 'LIGHTNING') THEN RAISE EXCEPTION 'Unsupported BTC network'; END IF;
  IF (v_network='BTC' AND btrim(p_address) !~* '^(bc1|[13])[a-zA-HJ-NP-Z0-9]{20,}$')
     OR (v_network='LIGHTNING' AND btrim(p_address) !~* '^lnbc[0-9a-z]{20,}$') THEN
    RAISE EXCEPTION 'A valid BTC destination for the selected network is required';
  END IF;
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


REVOKE ALL ON FUNCTION public.request_btc_withdrawal(numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_btc_withdrawal(numeric,text,text) TO authenticated;
