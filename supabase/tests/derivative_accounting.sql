/* All fixture companies, clients, quotes, orders, positions and payouts roll back.
   The worker clone below is restricted to these fixtures at every root query. */
BEGIN;
SET LOCAL statement_timeout='90s';
SET LOCAL lock_timeout='10s';
CREATE TEMP TABLE derivative_audit_users(user_id uuid PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE derivative_audit_result(market_side_cases integer,worker_checks integer,ledger_checks integer) ON COMMIT DROP;
DO $clone$
DECLARE v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.process_futures_engine()'::regprocedure) INTO v_definition;
  IF position('WHERE status = ''open'' AND type = ''limit''' IN v_definition)=0
    OR position('WHERE is_open' IN v_definition)=0
    OR position('WHERE fp.is_open = true AND fp.margin_type = ''cross''' IN v_definition)=0 THEN
    RAISE EXCEPTION 'Unexpected worker definition; refusing to run an unscoped financial test';
  END IF;
  v_definition:=replace(v_definition,'FUNCTION public.process_futures_engine()','FUNCTION pg_temp.run_derivative_audit_engine()');
  v_definition:=replace(v_definition,'WHERE status = ''open'' AND type = ''limit''',
    'WHERE user_id IN(SELECT user_id FROM pg_temp.derivative_audit_users) AND status = ''open'' AND type = ''limit''');
  v_definition:=replace(v_definition,'WHERE is_open',
    'WHERE user_id IN(SELECT user_id FROM pg_temp.derivative_audit_users) AND is_open');
  v_definition:=replace(v_definition,'WHERE fp.is_open = true AND fp.margin_type = ''cross''',
    'WHERE fp.user_id IN(SELECT user_id FROM pg_temp.derivative_audit_users) AND fp.is_open = true AND fp.margin_type = ''cross''');
  EXECUTE v_definition;
END;
$clone$;

DO $audit$
DECLARE
  v_owner uuid; v_company uuid:=gen_random_uuid(); v_other_company uuid:=gen_random_uuid();
  v_admin uuid:=gen_random_uuid(); v_client uuid:=gen_random_uuid(); v_other_client uuid:=gen_random_uuid(); v_referrer uuid:=gen_random_uuid();
  v_suffix text:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  v_crypto text:='AUDITTESTUSDT'; v_forex text:='QFA/QFB'; v_gold text:='AUDITGOLD'; v_stock text:='AUDITSTOCK';
  v_symbol text; v_market text; v_entry numeric; v_mark numeric; v_quantity numeric; v_units numeric;
  v_request uuid; v_result jsonb; v_values jsonb; v_retry jsonb; v_process jsonb;
  v_position public.futures_positions; v_history public.futures_position_history;
  v_side text; v_before numeric; v_after numeric; v_pnl numeric; v_cases integer:=0;
  v_cross uuid; v_isolated uuid; v_limit uuid; v_legacy uuid; v_count integer;
BEGIN
  SELECT id INTO v_owner FROM public.users WHERE is_admin AND company_id IS NULL ORDER BY created_at LIMIT 1;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Platform fixture owner required'; END IF;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  INSERT INTO public.crm_companies(id,name,code,created_by) VALUES
    (v_company,'Derivative audit '||v_suffix,'PNL_A_'||v_suffix,v_owner),
    (v_other_company,'Other derivative audit '||v_suffix,'PNL_B_'||v_suffix,v_owner);
  INSERT INTO public.users(id,email,is_admin,company_id) VALUES
    (v_admin,'pnl-admin-'||v_suffix||'@example.invalid',true,v_company),
    (v_client,'pnl-client-'||v_suffix||'@example.invalid',false,v_company),
    (v_other_client,'pnl-other-'||v_suffix||'@example.invalid',false,v_other_company),
    (v_referrer,'pnl-referrer-'||v_suffix||'@example.invalid',false,v_company);
  UPDATE public.users SET referred_by=v_referrer WHERE id=v_client;
  INSERT INTO public.balances(user_id,usdt_balance) VALUES(v_client,100000),(v_other_client,2000),(v_referrer,0);
  INSERT INTO pg_temp.derivative_audit_users VALUES(v_client),(v_other_client),(v_referrer);
  INSERT INTO crm_private.admin_ip_allowlist(address,label,access_scope,company_id,created_by)
    VALUES('192.0.2.237','Temporary derivative audit','company',v_company,v_owner);
  INSERT INTO crm_private.client_trade_markets(symbol,market,instrument_type,contract_size) VALUES
    (v_crypto,'futures','crypto',1),(v_forex,'cfd','forex',100000),
    (v_gold,'cfd','commodity',100),(v_stock,'cfd','stock',100);
  INSERT INTO public.instrument_spreads(symbol,instrument_type,spread_percentage,min_spread_value,max_spread_value) VALUES
    (v_crypto,'crypto',0.00005,0.5,2),(v_forex,'forex',0.00009,0.00009,0.00012),
    (v_gold,'commodity',0.00015,0.2,0.5),(v_stock,'stock',0.0001,0.01,0.03);
  INSERT INTO public.crypto_market_quotes(symbol,provider_symbol,price,price_usd,timestamp)
    VALUES(v_crypto,'AUDITTEST/USD',50000,50000,now());
  INSERT INTO public.cfd_market_quotes(symbol,provider_symbol,price,timestamp) VALUES
    (v_forex,v_forex,0.88,now()),('QFB/USD','QFB/USD',1.25,now()),
    (v_gold,v_gold,2300,now()),(v_stock,v_stock,200,now());

  FOR v_symbol,v_market,v_entry,v_mark,v_quantity,v_units IN SELECT * FROM (VALUES
    (v_crypto,'futures',50000::numeric,51000::numeric,0.01::numeric,0.01::numeric),
    (v_forex,'cfd',0.88,0.89,0.01,1000),
    (v_gold,'cfd',2300,2310,0.01,1),
    (v_stock,'cfd',200,201,0.01,1)
  ) cases(symbol,market,entry,mark,quantity,units) LOOP
    FOREACH v_side IN ARRAY ARRAY['long','short'] LOOP
      PERFORM set_config('request.jwt.claim.role','service_role',true);
      IF v_market='futures' THEN UPDATE public.crypto_market_quotes SET price=v_entry,timestamp=now() WHERE symbol=v_symbol;
      ELSE UPDATE public.cfd_market_quotes SET price=v_entry,timestamp=now() WHERE symbol=v_symbol; END IF;
      SELECT usdt_balance INTO v_before FROM public.balances WHERE user_id=v_client;
      PERFORM set_config('request.jwt.claim.role','authenticated',true);
      PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
      PERFORM set_config('request.headers','{"cf-connecting-ip":"192.0.2.237"}',true);
      v_request:=gen_random_uuid();
      v_result:=public.crm_open_client_position(v_client,v_market,v_symbol,v_side,v_quantity,10,'isolated',v_request,'Accounting audit',NULL,NULL);
      v_retry:=public.crm_open_client_position(v_client,v_market,v_symbol,v_side,v_quantity,10,'isolated',v_request,'Accounting audit',NULL,NULL);
      IF v_result IS DISTINCT FROM v_retry THEN RAISE EXCEPTION 'CRM retry created a different order'; END IF;
      SELECT * INTO v_position FROM public.futures_positions WHERE id=(v_result->>'id')::uuid;
      IF v_position.user_id<>v_client OR v_position.amount<>v_units THEN RAISE EXCEPTION 'CRM client ownership or CFD contract size is wrong'; END IF;
      SELECT usdt_balance INTO v_after FROM public.balances WHERE user_id=v_client;
      IF v_after<>v_before THEN RAISE EXCEPTION 'Opening debited cash instead of reserving margin'; END IF;
      PERFORM set_config('request.jwt.claim.role','service_role',true);
      UPDATE public.futures_positions SET accumulated_swap_cost=1.5,swap_accrued_at=now()-interval '12 hours' WHERE id=v_position.id;
      IF v_market='futures' THEN UPDATE public.crypto_market_quotes SET price=v_mark,timestamp=now() WHERE symbol=v_symbol;
      ELSE UPDATE public.cfd_market_quotes SET price=v_mark,timestamp=now() WHERE symbol=v_symbol; END IF;
      PERFORM set_config('request.jwt.claim.role','authenticated',true);
      PERFORM set_config('request.jwt.claim.sub',v_client::text,true);
      v_values:=public.get_my_derivative_positions()->0;
      IF (v_values->>'id')::uuid<>v_position.id OR (v_values->>'valuation_available')::boolean IS DISTINCT FROM true
        OR (v_values->>'current_price')::numeric<>v_mark THEN RAISE EXCEPTION 'Client snapshot does not match the authoritative quote'; END IF;
      IF abs((v_values->>'gross_unrealized_pnl')::numeric
        -(v_mark-v_entry)*v_units*(CASE WHEN v_side='long' THEN 1 ELSE -1 END)*(CASE WHEN v_symbol=v_forex THEN 1.25 ELSE 1 END))>0.0000001 THEN
        RAISE EXCEPTION 'Gross P&L or FX conversion is incorrect for % %',v_symbol,v_side;
      END IF;
      v_pnl:=public.close_futures_position(v_position.id,v_mark);
      SELECT usdt_balance INTO v_after FROM public.balances WHERE user_id=v_client;
      IF abs(v_pnl-(v_values->>'unrealized_pnl')::numeric)>0.0000001 OR abs((v_after-v_before)-v_pnl)>0.0000001 THEN
        RAISE EXCEPTION 'Displayed net P&L and actual closing wallet delta disagree'; END IF;
      SELECT * INTO v_history FROM public.futures_position_history WHERE id=v_position.id;
      IF v_history.exit_price<>v_mark OR abs(v_history.pnl-v_pnl)>0.0000001
        OR abs(v_history.accumulated_swap_cost-(v_values->>'estimated_swap_cost')::numeric)>0.0000001 THEN
        RAISE EXCEPTION 'History, financing checkpoint or closing fees disagree'; END IF;
      BEGIN
        PERFORM public.close_futures_position(v_position.id,v_mark);
        RAISE EXCEPTION 'Duplicate close unexpectedly succeeded';
      EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Open position not found%' THEN RAISE; END IF; END;
      PERFORM set_config('request.jwt.claim.sub',v_other_client::text,true);
      IF public.get_my_derivative_positions()<>'[]'::jsonb THEN RAISE EXCEPTION 'Client snapshot leaked another client'; END IF;
      v_cases:=v_cases+1;
    END LOOP;
  END LOOP;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  SELECT count(*) INTO v_count FROM public.referral_earnings WHERE referred_user_id=v_client;
  IF v_count=0 OR (SELECT usdt_balance FROM public.balances WHERE user_id=v_referrer)<=0 THEN
    RAISE EXCEPTION 'Profitable closes did not post referral commissions'; END IF;
  UPDATE public.users SET referred_by=NULL WHERE id=v_client;
  UPDATE public.balances SET usdt_balance=2000 WHERE user_id=v_client;
  UPDATE public.crypto_market_quotes SET price=50000,timestamp=now() WHERE symbol=v_crypto;

  /* Client retry identity and actual limit-fill price improvement. */
  v_request:=gen_random_uuid();
  v_result:=public.place_client_derivative_order(v_client,v_crypto,'long',0.01,10,'isolated','limit',50000,49000,NULL,NULL,v_request);
  v_retry:=public.place_client_derivative_order(v_client,v_crypto,'long',0.01,10,'isolated','limit',50000,49000,NULL,NULL,v_request);
  IF v_result IS DISTINCT FROM v_retry THEN RAISE EXCEPTION 'Client retry created a duplicate'; END IF;
  v_limit:=(v_result->>'id')::uuid;
  v_process:=pg_temp.run_derivative_audit_engine();
  IF (v_process->>'filled')::integer<>0 THEN RAISE EXCEPTION 'Uncrossed limit order filled early'; END IF;
  UPDATE public.crypto_market_quotes SET price=48000,timestamp=now() WHERE symbol=v_crypto;
  v_process:=pg_temp.run_derivative_audit_engine();
  IF (v_process->>'filled')::integer<>1 THEN RAISE EXCEPTION 'Executable limit order was not filled'; END IF;
  SELECT p.* INTO v_position FROM public.futures_positions p JOIN public.futures_orders o ON o.position_id=p.id WHERE o.id=v_limit;
  IF v_position.entry_price<>48000 OR v_position.margin<>48 THEN RAISE EXCEPTION 'Limit execution ignored price improvement or margin recalculation'; END IF;
  PERFORM public.close_futures_position(v_position.id,48000);

  /* TP and maintenance exits run without a browser or client session. */
  UPDATE public.crypto_market_quotes SET price=50000,timestamp=now() WHERE symbol=v_crypto;
  v_result:=public.place_derivative_order(v_client,v_crypto,'long',0.01,10,'isolated','market',50000,NULL,NULL,51000);
  UPDATE public.crypto_market_quotes SET price=51001,timestamp=now() WHERE symbol=v_crypto;
  v_process:=pg_temp.run_derivative_audit_engine();
  IF (v_process->>'closed')::integer<>1 THEN RAISE EXCEPTION 'Server TP did not close the position'; END IF;
  UPDATE public.crypto_market_quotes SET price=50000,timestamp=now() WHERE symbol=v_crypto;
  v_result:=public.place_derivative_order(v_client,v_crypto,'long',0.01,10,'isolated','market',50000);
  v_legacy:=(v_result->>'id')::uuid;
  UPDATE public.futures_positions SET maintenance_model=1 WHERE id=v_legacy;
  v_result:=public.place_derivative_order(v_client,v_crypto,'long',0.01,10,'isolated','market',50000);
  IF (SELECT maintenance_model FROM public.futures_positions WHERE id=(v_result->>'id')::uuid)<>2 THEN
    RAISE EXCEPTION 'New positions did not receive the corrected maintenance model'; END IF;
  UPDATE public.crypto_market_quotes SET price=45300,timestamp=now() WHERE symbol=v_crypto;
  v_process:=pg_temp.run_derivative_audit_engine();
  IF (v_process->>'closed')::integer<>1 THEN RAISE EXCEPTION 'Server maintenance liquidation did not close the position'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.futures_positions WHERE id=v_legacy AND is_open) THEN
    RAISE EXCEPTION 'Maintenance rule changed the legacy liquidation threshold'; END IF;
  UPDATE public.crypto_market_quotes SET price=44000,timestamp=now() WHERE symbol=v_crypto;
  v_process:=pg_temp.run_derivative_audit_engine();
  IF (v_process->>'closed')::integer<>1 THEN RAISE EXCEPTION 'Legacy full-loss threshold did not close the position'; END IF;

  /* Cross drawdown exceeds initial margin, but preserves isolated collateral. */
  UPDATE public.balances SET usdt_balance=200 WHERE user_id=v_client;
  UPDATE public.crypto_market_quotes SET price=50000,timestamp=now() WHERE symbol=v_crypto;
  v_result:=public.place_derivative_order(v_client,v_crypto,'long',0.01,10,'isolated','market',50000); v_isolated:=(v_result->>'id')::uuid;
  v_result:=public.place_derivative_order(v_client,v_crypto,'long',0.01,10,'cross','market',50000); v_cross:=(v_result->>'id')::uuid;
  UPDATE public.crypto_market_quotes SET price=30000,timestamp=now() WHERE symbol=v_crypto;
  v_pnl:=public.close_futures_position(v_cross,30000);
  IF v_pnl<>-150 OR (SELECT usdt_balance FROM public.balances WHERE user_id=v_client)<>50 THEN
    RAISE EXCEPTION 'Cross drawdown was capped at initial margin or consumed isolated collateral'; END IF;
  PERFORM public.close_futures_position(v_isolated,30000);

  IF has_function_privilege('anon','public.get_my_derivative_positions()','EXECUTE')
    OR has_function_privilege('authenticated','public.process_referral_commission(uuid,uuid,numeric,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.place_client_derivative_order(uuid,text,text,numeric,integer,text,text,numeric,numeric,numeric,numeric,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'An internal trading function was exposed'; END IF;
  INSERT INTO derivative_audit_result VALUES(v_cases,5,v_cases+6);
END;
$audit$;
SELECT *,true AS all_test_data_rolled_back FROM derivative_audit_result;
ROLLBACK;
