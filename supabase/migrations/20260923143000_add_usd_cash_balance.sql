/* Add a separate USD cash wallet without changing the existing EUR ledger. */

ALTER TABLE public.balances
  ADD COLUMN IF NOT EXISTS usd_balance numeric(20,8) NOT NULL DEFAULT 0;
ALTER TABLE public.portfolio_snapshots
  ADD COLUMN IF NOT EXISTS usd_balance numeric(20,8) NOT NULL DEFAULT 0;

ALTER TABLE public.balances DROP CONSTRAINT IF EXISTS balances_usd_balance_nonnegative;
ALTER TABLE public.balances ADD CONSTRAINT balances_usd_balance_nonnegative CHECK (usd_balance >= 0);

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

CREATE OR REPLACE FUNCTION public.request_fiat_withdrawal(
  p_currency text, p_amount numeric, p_bank_name text, p_account_number text,
  p_routing_number text, p_beneficiary_name text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user_id uuid := auth.uid(); v_currency text := upper(btrim(p_currency));
  v_rate numeric := 1; v_ledger_amount numeric; v_balance numeric; v_reserved numeric := 0; v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_currency NOT IN ('EUR','USD') THEN RAISE EXCEPTION 'Unsupported withdrawal currency'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=v_user_id AND kyc_status='verified') THEN RAISE EXCEPTION 'Identity verification is required before withdrawing funds'; END IF;
  IF p_amount IS NULL OR p_amount < 100 OR p_amount > 1000000 THEN RAISE EXCEPTION 'Withdrawal amount must be between 100 and 1,000,000'; END IF;
  IF btrim(COALESCE(p_bank_name,''))='' OR btrim(COALESCE(p_account_number,''))='' OR btrim(COALESCE(p_routing_number,''))='' OR btrim(COALESCE(p_beneficiary_name,''))='' THEN RAISE EXCEPTION 'Complete bank details are required'; END IF;
  IF v_currency='EUR' THEN
    v_rate := public.get_current_eur_usd_rate(); v_ledger_amount := round(p_amount*v_rate,8);
    SELECT usdt_balance INTO v_balance FROM public.balances WHERE user_id=v_user_id FOR UPDATE;
    SELECT COALESCE((SELECT sum(margin) FROM public.futures_positions WHERE user_id=v_user_id AND is_open=true),0)+COALESCE((SELECT sum(reserved_margin) FROM public.futures_orders WHERE user_id=v_user_id AND status='open'),0) INTO v_reserved;
  ELSE
    v_ledger_amount := p_amount;
    SELECT usd_balance INTO v_balance FROM public.balances WHERE user_id=v_user_id FOR UPDATE;
  END IF;
  IF v_ledger_amount > GREATEST(v_balance-v_reserved,0) THEN RAISE EXCEPTION 'Insufficient withdrawable % balance',v_currency; END IF;
  IF v_currency='EUR' THEN UPDATE public.balances SET usdt_balance=usdt_balance-v_ledger_amount,updated_at=now() WHERE user_id=v_user_id;
  ELSE UPDATE public.balances SET usd_balance=usd_balance-v_ledger_amount,updated_at=now() WHERE user_id=v_user_id; END IF;
  INSERT INTO public.transactions(user_id,type,amount,currency,description,status,withdrawal_details,balance_effect,balance_processed_at)
  VALUES(v_user_id,'withdrawal',-p_amount,v_currency,'Bank withdrawal of '||v_currency||' '||trim(to_char(p_amount,'FM999999999999990.00'))||' via '||btrim(p_bank_name),'pending',
    jsonb_build_object('currency',v_currency,'amount',p_amount,'source_amount_usd',v_ledger_amount,'payout_currency',v_currency,'estimated_payout',round(p_amount*0.995,2),'fee',round(p_amount*0.005,2),'bank_name',btrim(p_bank_name),'account_number',btrim(p_account_number),'routing_number',btrim(p_routing_number),'beneficiary_name',btrim(p_beneficiary_name),'withdrawal_type','bank','created_at',now()),
    jsonb_build_object('ledger_asset',CASE WHEN v_currency='USD' THEN 'USD' ELSE 'USDT' END,'ledger_amount',v_ledger_amount),now()) RETURNING id INTO v_id;
  RETURN jsonb_build_object('success',true,'transaction_id',v_id,'currency',v_currency,'status','pending');
END; $$;

REVOKE ALL ON FUNCTION public.request_fiat_withdrawal(text,numeric,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_fiat_withdrawal(text,numeric,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_user_balances(
  p_target_user_id uuid, p_usdt_balance numeric, p_usd_balance numeric, p_btc_balance numeric, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_before jsonb; v_after jsonb; v_old_eur numeric; v_old_usd numeric; v_old_btc numeric;
BEGIN
  PERFORM public.require_admin();
  IF p_usdt_balance<0 OR p_usd_balance<0 OR p_btc_balance<0 THEN RAISE EXCEPTION 'Balances cannot be negative'; END IF;
  IF btrim(COALESCE(p_reason,''))='' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT to_jsonb(b),usdt_balance,usd_balance,btc_balance INTO v_before,v_old_eur,v_old_usd,v_old_btc FROM public.balances b WHERE user_id=p_target_user_id FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Balance account not found'; END IF;
  UPDATE public.balances SET usdt_balance=p_usdt_balance,usd_balance=p_usd_balance,btc_balance=p_btc_balance,updated_at=now() WHERE user_id=p_target_user_id RETURNING to_jsonb(balances.*) INTO v_after;
  IF p_usdt_balance IS DISTINCT FROM v_old_eur THEN INSERT INTO public.transactions(user_id,type,amount,currency,description,status) VALUES(p_target_user_id,CASE WHEN p_usdt_balance>v_old_eur THEN 'deposit' ELSE 'withdrawal' END,p_usdt_balance-v_old_eur,'EUR','CRM balance adjustment: '||p_reason,'completed'); END IF;
  IF p_usd_balance IS DISTINCT FROM v_old_usd THEN INSERT INTO public.transactions(user_id,type,amount,currency,description,status) VALUES(p_target_user_id,CASE WHEN p_usd_balance>v_old_usd THEN 'deposit' ELSE 'withdrawal' END,p_usd_balance-v_old_usd,'USD','CRM USD balance adjustment: '||p_reason,'completed'); END IF;
  IF p_btc_balance IS DISTINCT FROM v_old_btc THEN INSERT INTO public.transactions(user_id,type,amount,currency,description,status) VALUES(p_target_user_id,CASE WHEN p_btc_balance>v_old_btc THEN 'deposit' ELSE 'withdrawal' END,p_btc_balance-v_old_btc,'BTC','CRM BTC balance adjustment: '||p_reason,'completed'); END IF;
  INSERT INTO public.admin_action_logs(admin_user_id,target_user_id,action,before_data,after_data,reason) VALUES(auth.uid(),p_target_user_id,'set_balances',v_before,v_after,p_reason);
  RETURN v_after;
END; $$;

REVOKE ALL ON FUNCTION public.admin_set_user_balances(uuid,numeric,numeric,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_balances(uuid,numeric,numeric,numeric,text) TO authenticated;

/* USD participates in the same atomic swap settlement as EUR and crypto. */
CREATE OR REPLACE FUNCTION public.execute_asset_swap(
  p_from_symbol text, p_to_symbol text, p_from_amount numeric,
  p_expected_to_amount numeric DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_user_id uuid := auth.uid(); v_from_symbol text := upper(btrim(p_from_symbol));
  v_to_symbol text := upper(btrim(p_to_symbol));
  v_allowed_symbols constant text[] := ARRAY['EUR','USD','BTC','ETH','USDC','BNB','SOL','XRP','ADA','DOGE','AVAX','TRX','DOT','SHIB','APT','ARB','OP','LTC','PEPE'];
  v_from_price numeric; v_to_price numeric; v_from_balance numeric; v_to_amount numeric;
  v_from_value_usd numeric; v_eur_usd_rate numeric; v_fee_rate constant numeric := 0.001;
  v_eur_ledger numeric; v_usd_balance numeric; v_btc_balance numeric; v_transaction_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_from_symbol=v_to_symbol THEN RAISE EXCEPTION 'Cannot swap an asset to itself'; END IF;
  IF v_from_symbol<>ALL(v_allowed_symbols) OR v_to_symbol<>ALL(v_allowed_symbols) THEN RAISE EXCEPTION 'Unsupported swap asset'; END IF;
  IF p_from_amount IS NULL OR p_from_amount<=0 THEN RAISE EXCEPTION 'Swap amount must be greater than zero'; END IF;
  SELECT q.price INTO v_eur_usd_rate FROM public.cfd_market_quotes q WHERE q.symbol='EUR/USD' AND q.timestamp BETWEEN now()-interval '6 minutes' AND now()+interval '1 minute';
  IF COALESCE(v_eur_usd_rate,0)<=0 THEN RAISE EXCEPTION 'A current EUR/USD quote is required'; END IF;
  IF v_from_symbol='EUR' THEN v_from_price:=v_eur_usd_rate;
  ELSIF v_from_symbol='USD' THEN v_from_price:=1;
  ELSE SELECT q.price_usd INTO v_from_price FROM public.crypto_market_quotes q WHERE q.symbol=v_from_symbol||'USDT' AND q.timestamp BETWEEN now()-interval '6 minutes' AND now()+interval '1 minute'; END IF;
  IF v_to_symbol='EUR' THEN v_to_price:=v_eur_usd_rate;
  ELSIF v_to_symbol='USD' THEN v_to_price:=1;
  ELSE SELECT q.price_usd INTO v_to_price FROM public.crypto_market_quotes q WHERE q.symbol=v_to_symbol||'USDT' AND q.timestamp BETWEEN now()-interval '6 minutes' AND now()+interval '1 minute'; END IF;
  IF COALESCE(v_from_price,0)<=0 OR COALESCE(v_to_price,0)<=0 THEN RAISE EXCEPTION 'A current market price is unavailable for this swap'; END IF;
  v_from_value_usd:=p_from_amount*v_from_price;
  IF v_from_value_usd/v_eur_usd_rate<0.01 THEN RAISE EXCEPTION 'Minimum swap value is EUR 0.01'; END IF;
  IF v_from_value_usd/v_eur_usd_rate>1000000 THEN RAISE EXCEPTION 'Maximum swap value is EUR 1,000,000'; END IF;
  v_to_amount:=trunc((v_from_value_usd/v_to_price)*(1-v_fee_rate),8);
  IF v_to_amount<=0 THEN RAISE EXCEPTION 'Calculated output amount is too small'; END IF;
  IF p_expected_to_amount IS NOT NULL AND p_expected_to_amount>0 AND abs(v_to_amount-p_expected_to_amount)/v_to_amount>0.05 THEN RAISE EXCEPTION 'The quote changed by more than 5%%. Refresh and try again'; END IF;
  SELECT b.usdt_balance,b.usd_balance,b.btc_balance INTO v_eur_ledger,v_usd_balance,v_btc_balance FROM public.balances b WHERE b.user_id=v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet balance not found'; END IF;
  IF v_from_symbol='EUR' THEN
    IF p_from_amount>v_eur_ledger/v_from_price THEN RAISE EXCEPTION 'Insufficient EUR balance'; END IF;
    UPDATE public.balances SET usdt_balance=usdt_balance-v_from_value_usd,updated_at=now() WHERE user_id=v_user_id;
  ELSIF v_from_symbol='USD' THEN
    IF p_from_amount>v_usd_balance THEN RAISE EXCEPTION 'Insufficient USD balance'; END IF;
    UPDATE public.balances SET usd_balance=usd_balance-p_from_amount,updated_at=now() WHERE user_id=v_user_id;
  ELSIF v_from_symbol='BTC' THEN
    IF p_from_amount>v_btc_balance THEN RAISE EXCEPTION 'Insufficient BTC balance'; END IF;
    UPDATE public.balances SET btc_balance=btc_balance-p_from_amount,updated_at=now() WHERE user_id=v_user_id;
  ELSE
    SELECT ua.balance INTO v_from_balance FROM public.user_assets ua WHERE ua.user_id=v_user_id AND ua.asset_symbol=v_from_symbol FOR UPDATE;
    IF COALESCE(v_from_balance,0)<p_from_amount THEN RAISE EXCEPTION 'Insufficient % balance',v_from_symbol; END IF;
    UPDATE public.user_assets SET balance=balance-p_from_amount,updated_at=now() WHERE user_id=v_user_id AND asset_symbol=v_from_symbol;
  END IF;
  IF v_to_symbol='EUR' THEN UPDATE public.balances SET usdt_balance=usdt_balance+(v_to_amount*v_to_price),updated_at=now() WHERE user_id=v_user_id;
  ELSIF v_to_symbol='USD' THEN UPDATE public.balances SET usd_balance=usd_balance+v_to_amount,updated_at=now() WHERE user_id=v_user_id;
  ELSIF v_to_symbol='BTC' THEN UPDATE public.balances SET btc_balance=btc_balance+v_to_amount,updated_at=now() WHERE user_id=v_user_id;
  ELSE INSERT INTO public.user_assets(user_id,asset_symbol,balance) VALUES(v_user_id,v_to_symbol,v_to_amount) ON CONFLICT(user_id,asset_symbol) DO UPDATE SET balance=public.user_assets.balance+EXCLUDED.balance,updated_at=now(); END IF;
  INSERT INTO public.transactions(user_id,type,amount,currency,description,status) VALUES(v_user_id,'trade',-p_from_amount,v_from_symbol,'Swapped '||trim(to_char(p_from_amount,'FM999999999999990.99999999'))||' '||v_from_symbol||' to '||trim(to_char(v_to_amount,'FM999999999999990.99999999'))||' '||v_to_symbol||' (0.1% fee)','completed') RETURNING id INTO v_transaction_id;
  RETURN jsonb_build_object('success',true,'transaction_id',v_transaction_id,'from_symbol',v_from_symbol,'to_symbol',v_to_symbol,'from_amount',p_from_amount,'to_amount',v_to_amount,'from_price_usd',v_from_price,'to_price_usd',v_to_price,'fee_rate',v_fee_rate);
END; $$;
REVOKE ALL ON FUNCTION public.execute_asset_swap(text,text,numeric,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_asset_swap(text,text,numeric,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_users(p_search text DEFAULT NULL,p_limit integer DEFAULT 100,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.require_admin();
  WITH filtered AS (SELECT u.* FROM public.users u WHERE p_search IS NULL OR btrim(p_search)='' OR u.email ILIKE '%'||btrim(p_search)||'%' OR COALESCE(u.first_name,'') ILIKE '%'||btrim(p_search)||'%' OR COALESCE(u.last_name,'') ILIKE '%'||btrim(p_search)||'%' OR u.id::text ILIKE '%'||btrim(p_search)||'%'),
  page AS (SELECT f.* FROM filtered f ORDER BY f.created_at DESC LIMIT LEAST(GREATEST(p_limit,1),250) OFFSET GREATEST(p_offset,0))
  SELECT jsonb_build_object(
    'users',COALESCE((SELECT jsonb_agg((to_jsonb(p)-'is_demo')||jsonb_build_object('usdt_balance',COALESCE(b.usdt_balance,0),'usd_balance',COALESCE(b.usd_balance,0),'btc_balance',COALESCE(b.btc_balance,0),'robot_allocated_balance',COALESCE(r.allocated_balance,0),'robot_active',COALESCE(r.is_active,false)) ORDER BY p.created_at DESC) FROM page p LEFT JOIN public.balances b ON b.user_id=p.id LEFT JOIN public.robot_states r ON r.user_id=p.id),'[]'::jsonb),
    'total',(SELECT count(*) FROM filtered),
    'stats',jsonb_build_object('total_users',(SELECT count(*) FROM public.users),'pending_kyc',(SELECT count(*) FROM public.users WHERE kyc_status='pending'),'active_robots',(SELECT count(*) FROM public.robot_states WHERE is_active=true),'total_usdt',(SELECT COALESCE(sum(usdt_balance),0) FROM public.balances),'total_usd',(SELECT COALESCE(sum(usd_balance),0) FROM public.balances),'total_robot_allocated',(SELECT COALESCE(sum(allocated_balance),0) FROM public.robot_states))
  ) INTO v_result;
  RETURN v_result;
END; $$;

NOTIFY pgrst, 'reload schema';
