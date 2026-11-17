/* Isolated hosted regression. Every company, account, quote, position and audit
   created below is rolled back. No existing client's positions are changed. */
BEGIN;
SET LOCAL statement_timeout='60s';
SET LOCAL lock_timeout='10s';
CREATE TEMP TABLE crm_order_regression_result(passed boolean,positions_verified integer) ON COMMIT DROP;
DO $$
DECLARE
  v_owner uuid; v_platform_ip text;
  v_company uuid:=gen_random_uuid(); v_other_company uuid:=gen_random_uuid();
  v_admin uuid:=gen_random_uuid(); v_client uuid:=gen_random_uuid(); v_other_client uuid:=gen_random_uuid();
  v_key uuid:=gen_random_uuid(); v_result jsonb; v_retry jsonb; v_cfd jsonb;
  v_position public.futures_positions%ROWTYPE;
  v_context jsonb; v_cash numeric; v_margin numeric; v_count integer;
  v_suffix text:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
BEGIN
  SELECT id INTO v_owner FROM public.users WHERE is_admin AND company_id IS NULL
    ORDER BY CASE WHEN lower(email)='admin@gmail.com' THEN 0 ELSE 1 END,created_at LIMIT 1;
  SELECT host(address) INTO v_platform_ip FROM crm_private.admin_ip_allowlist WHERE access_scope='platform' LIMIT 1;
  IF v_owner IS NULL OR v_platform_ip IS NULL THEN RAISE EXCEPTION 'A platform administrator and approved platform network are required for this test'; END IF;

  PERFORM set_config('request.jwt.claim.role','service_role',true);
  INSERT INTO public.crm_companies(id,name,code,created_by) VALUES
    (v_company,'CRM order regression A '||v_suffix,'CRM_A_'||v_suffix,v_owner),
    (v_other_company,'CRM order regression B '||v_suffix,'CRM_B_'||v_suffix,v_owner);
  INSERT INTO public.users(id,email,first_name,is_admin,company_id) VALUES
    (v_admin,'crm-order-admin-'||v_suffix||'@example.invalid','Order test admin',true,v_company),
    (v_client,'crm-order-client-'||v_suffix||'@example.invalid','Order test client',false,v_company),
    (v_other_client,'crm-order-other-'||v_suffix||'@example.invalid','Other test client',false,v_other_company);
  INSERT INTO public.balances(user_id,usdt_balance) VALUES(v_client,100000),(v_other_client,100000);
  INSERT INTO crm_private.admin_ip_allowlist(address,label,access_scope,company_id,created_by)
    VALUES('192.0.2.241','Temporary CRM order regression','company',v_company,v_owner);

  -- Distinct test symbols avoid touching any existing market quote.
  INSERT INTO crm_private.client_trade_markets(symbol,market,instrument_type,contract_size)
    VALUES('CRMTESTUSDT','futures','crypto',1),('QAA/USD','cfd','forex',100000);
  INSERT INTO public.crypto_market_quotes(symbol,provider_symbol,price,price_usd,timestamp)
    VALUES('CRMTESTUSDT','CRMTEST/USD',50000,50000,now());
  INSERT INTO public.cfd_market_quotes(symbol,provider_symbol,price,timestamp)
    VALUES('QAA/USD','QAA/USD',1.2,now());

  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',v_owner::text,true);
  PERFORM set_config('request.headers',jsonb_build_object('cf-connecting-ip',v_platform_ip)::text,true);
  v_context:=public.crm_get_client_trade_context(v_client,'futures');
  IF (v_context->>'client_id')::uuid<>v_client OR (v_context->>'available_margin')::numeric<>100000 THEN
    RAISE EXCEPTION 'Trade context does not belong to the selected client';
  END IF;
  v_result:=public.crm_open_client_position(v_client,'futures','CRMTESTUSDT','long',0.01,10,'isolated',v_key,'CRM order regression',49000,51000);
  SELECT * INTO v_position FROM public.futures_positions WHERE id=(v_result->>'id')::uuid;
  IF v_position.user_id<>v_client OR v_position.side<>'long' OR NOT v_position.is_open
    OR v_position.amount<>0.01 OR v_position.entry_price<>50000 OR v_position.margin<>50
    OR v_position.sl_price<>49000 OR v_position.tp_price<>51000 OR v_position.liquidation_price<=0 THEN
    RAISE EXCEPTION 'Futures execution, ownership, risk prices or margin is incorrect';
  END IF;
  v_retry:=public.crm_open_client_position(v_client,'futures','CRMTESTUSDT','long',0.01,10,'isolated',v_key,'CRM order regression',49000,51000);
  IF v_retry IS DISTINCT FROM v_result THEN RAISE EXCEPTION 'Retry did not return the original position'; END IF;
  BEGIN
    PERFORM public.crm_open_client_position(v_client,'futures','CRMTESTUSDT','long',0.02,10,'isolated',v_key,'CRM order regression',49000,51000);
    RAISE EXCEPTION 'Changed retry unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%different order%' THEN RAISE; END IF;
  END;

  v_cfd:=public.crm_open_client_position(v_client,'cfd','QAA/USD','short',0.01,10,'isolated',gen_random_uuid(),'CRM CFD regression',1.3,1.1);
  SELECT * INTO v_position FROM public.futures_positions WHERE id=(v_cfd->>'id')::uuid;
  IF v_position.user_id<>v_client OR v_position.side<>'short' OR v_position.amount<>1000
    OR v_position.entry_price<>1.2 OR v_position.margin<>120 OR v_position.sl_price<>1.3 OR v_position.tp_price<>1.1 THEN
    RAISE EXCEPTION 'CFD lot conversion, ownership, margin or risk prices is incorrect';
  END IF;
  SELECT usdt_balance INTO v_cash FROM public.balances WHERE user_id=v_client;
  v_context:=public.crm_get_client_trade_context(v_client,'cfd');
  IF v_cash<>100000 OR (v_context->>'available_margin')::numeric<>99830 THEN
    RAISE EXCEPTION 'Opening positions incorrectly debited cash or reserved margin twice';
  END IF;
  SELECT count(*) INTO v_count FROM public.admin_action_logs WHERE target_user_id=v_client AND action='crm_client_position_opened' AND company_id=v_company;
  IF v_count<>2 THEN RAISE EXCEPTION 'Actor/client/company audit is missing or duplicated'; END IF;

  PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
  PERFORM set_config('request.headers','{"cf-connecting-ip":"192.0.2.241"}',true);
  BEGIN
    PERFORM public.crm_open_client_position(v_other_client,'futures','CRMTESTUSDT','long',0.01,10,'isolated',gen_random_uuid(),'Cross-company denial');
    RAISE EXCEPTION 'Cross-company order unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%another company%' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claim.sub',v_client::text,true);
  BEGIN
    PERFORM public.crm_open_client_position(v_client,'futures','CRMTESTUSDT','long',0.01,10,'isolated',gen_random_uuid(),'Client denial');
    RAISE EXCEPTION 'Client order through CRM unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%CRM staff access required%' THEN RAISE; END IF;
  END;
  IF has_function_privilege('authenticated','public.place_derivative_order(uuid,text,text,numeric,integer,text,text,numeric,numeric,numeric,numeric)','EXECUTE')
    OR has_function_privilege('anon','public.crm_open_client_position(uuid,text,text,text,numeric,integer,text,uuid,text,numeric,numeric)','EXECUTE') THEN
    RAISE EXCEPTION 'Browser or anonymous access to a protected entry point was granted';
  END IF;
  SELECT count(*) INTO v_count FROM public.futures_positions WHERE user_id IN(v_client,v_other_client);
  IF v_count<>2 THEN RAISE EXCEPTION 'Unexpected duplicate or wrong-client position'; END IF;
  INSERT INTO crm_order_regression_result VALUES(true,v_count);
END;
$$;
SELECT passed,positions_verified,true AS rolled_back_after_check FROM crm_order_regression_result;
ROLLBACK;
