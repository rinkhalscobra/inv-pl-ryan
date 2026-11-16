/* Hosted regression: all fixtures and financial operations are rolled back. */
BEGIN;
SET LOCAL statement_timeout='90s';
SET LOCAL lock_timeout='10s';
CREATE TEMP TABLE scoped_client_result(roles_verified integer,positions_verified integer,scope_denials_verified integer) ON COMMIT DROP;
DO $$
DECLARE
  v_owner uuid; v_company uuid:=gen_random_uuid(); v_other_company uuid:=gen_random_uuid();
  v_office uuid:=gen_random_uuid(); v_other_office uuid:=gen_random_uuid();
  v_workflow uuid:=gen_random_uuid(); v_desk uuid:=gen_random_uuid(); v_agent uuid:=gen_random_uuid();
  v_manager uuid:=gen_random_uuid(); v_retention uuid:=gen_random_uuid();
  v_sales uuid:=gen_random_uuid(); v_promoted uuid:=gen_random_uuid(); v_foreign uuid:=gen_random_uuid();
  v_outside uuid:=gen_random_uuid(); v_actor uuid; v_target uuid; v_denied uuid;
  v_role text; v_sql text; v_tx uuid; v_grant jsonb; v_before numeric; v_after numeric;
  v_response jsonb; v_denials integer:=0; v_positions integer;
  v_suffix text:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
BEGIN
  SELECT id INTO v_owner FROM public.users WHERE is_admin AND company_id IS NULL ORDER BY created_at LIMIT 1;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Platform administrator fixture owner is required'; END IF;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  INSERT INTO public.crm_companies(id,name,code,created_by) VALUES
    (v_company,'Scoped access regression '||v_suffix,'SCOPE_A_'||v_suffix,v_owner),
    (v_other_company,'Foreign scope regression '||v_suffix,'SCOPE_B_'||v_suffix,v_owner);
  INSERT INTO public.crm_offices(id,name,code,company_id,created_by) VALUES
    (v_office,'Test desk','SCOPE_'||v_suffix,v_company,v_owner),
    (v_other_office,'Other desk','OTHER_'||v_suffix,v_company,v_owner);
  INSERT INTO public.users(id,email,company_id,office_id,is_promoted) VALUES
    (v_workflow,'scope-workflow-'||v_suffix||'@example.invalid',v_company,v_office,false),
    (v_desk,'scope-desk-'||v_suffix||'@example.invalid',v_company,v_office,false),
    (v_agent,'scope-agent-'||v_suffix||'@example.invalid',v_company,v_office,false),
    (v_manager,'scope-manager-'||v_suffix||'@example.invalid',v_company,v_office,false),
    (v_retention,'scope-retention-'||v_suffix||'@example.invalid',v_company,v_office,false),
    (v_sales,'scope-sales-'||v_suffix||'@example.invalid',v_company,v_office,false),
    (v_promoted,'scope-client-'||v_suffix||'@example.invalid',v_company,v_office,true),
    (v_outside,'scope-outside-'||v_suffix||'@example.invalid',v_company,v_other_office,false),
    (v_foreign,'scope-foreign-'||v_suffix||'@example.invalid',v_other_company,NULL,false);
  INSERT INTO public.crm_staff_roles(user_id,role) VALUES
    (v_workflow,'workflow_manager'),(v_desk,'desk_manager'),(v_agent,'agent'),
    (v_manager,'retention_manager'),(v_retention,'retention');
  INSERT INTO public.crm_workflow_desk_assignments(desk_manager_id,workflow_manager_id) VALUES(v_desk,v_workflow);
  INSERT INTO public.crm_agent_desk_assignments(agent_id,desk_manager_id) VALUES(v_agent,v_desk);
  INSERT INTO public.crm_retention_manager_assignments(retention_id,retention_manager_id) VALUES(v_retention,v_manager);
  INSERT INTO public.crm_client_agent_assignments(client_id,agent_id) VALUES(v_sales,v_agent);
  INSERT INTO public.crm_client_retention_assignments(client_id,retention_id) VALUES(v_promoted,v_retention);
  INSERT INTO public.balances(user_id,usdt_balance,usd_balance,btc_balance) VALUES
    (v_sales,100000,1000,1),(v_promoted,100000,1000,1);
  INSERT INTO public.robot_states(user_id) VALUES(v_sales),(v_promoted);
  INSERT INTO crm_private.admin_ip_allowlist(address,label,access_scope,company_id,created_by)
    VALUES('192.0.2.239','Scoped client regression','company',v_company,v_owner);
  INSERT INTO crm_private.client_trade_markets(symbol,market,instrument_type,contract_size)
    VALUES('SCOPE_TESTUSDT','futures','crypto',1),('QSC/USD','cfd','forex',100000);
  INSERT INTO public.crypto_market_quotes(symbol,provider_symbol,price,price_usd,timestamp)
    VALUES('SCOPE_TESTUSDT','SCOPE_TEST/USD',50000,50000,now());
  INSERT INTO public.cfd_market_quotes(symbol,provider_symbol,price,timestamp)
    VALUES('QSC/USD','QSC/USD',1.2,now());

  FOR v_actor,v_role IN SELECT user_id,role FROM public.crm_staff_roles
    WHERE user_id IN(v_workflow,v_desk,v_agent,v_manager,v_retention)
  LOOP
    v_target:=CASE WHEN v_role IN('retention_manager','retention') THEN v_promoted ELSE v_sales END;
    v_denied:=CASE WHEN v_target=v_sales THEN v_promoted ELSE v_sales END;
    PERFORM set_config('request.jwt.claim.role','authenticated',true);
    PERFORM set_config('request.jwt.claim.sub',v_actor::text,true);
    PERFORM set_config('request.headers','{"cf-connecting-ip":"192.0.2.239"}',true);

    v_response:=public.admin_get_user_workspace(v_target);
    IF (v_response->'profile'->>'id')::uuid<>v_target THEN RAISE EXCEPTION 'Wrong workspace for %',v_role; END IF;
    PERFORM public.admin_get_kyc_tax_id(v_target);
    PERFORM public.admin_get_client_onboarding(v_target);
    PERFORM public.admin_get_user_wheel_grants(v_target);
    IF public.admin_get_account_role(v_target)<>'client' THEN RAISE EXCEPTION 'Wrong target role'; END IF;
    PERFORM public.crm_get_client_module_edit_options(v_target,'transactions');
    PERFORM public.admin_update_user_profile(v_target,jsonb_build_object('first_name',v_role),'Scoped profile edit');
    PERFORM public.admin_set_user_balances(v_target,100000,1000,1,'Scoped wallet edit');
    PERFORM public.admin_set_user_asset_balance(v_target,'ETH',2,'Scoped asset edit');
    PERFORM public.admin_update_robot_state(v_target,'{"custom_daily_profit_percentage":0.5}'::jsonb,'Scoped robot edit');
    PERFORM public.admin_credit_robot_profit(v_target,5,'Scoped robot credit');
    PERFORM public.admin_set_user_kyc_status(v_target,'verified','Scoped KYC status');
    PERFORM public.admin_set_user_kyc_status(v_target,'not_verified','Scoped KYC status');
    PERFORM public.admin_add_user_note(v_target,'Scoped note');
    PERFORM public.admin_send_notification(v_target,'Scoped notification','admin');
    PERFORM public.admin_save_deposit_payment_instructions(v_target,'btc','client','{"wallet_address":"test-only"}'::jsonb,'Scoped payment details');
    PERFORM public.admin_get_deposit_payment_instructions(v_target);
    PERFORM public.admin_get_funding_requests(v_target);
    PERFORM public.crm_set_plain_password('Test mirror only',v_target);
    PERFORM public.admin_add_user_deposit(v_target,10,'USD','Scope test','Scoped deposit');
    v_grant:=public.admin_grant_wheel_spin(v_target,5,'Scoped wheel grant');
    PERFORM public.admin_revoke_wheel_spin(v_target,(v_grant->>'id')::uuid,'Scoped wheel revoke');

    SELECT btc_balance INTO v_before FROM public.balances WHERE user_id=v_target;
    INSERT INTO public.transactions(user_id,type,amount,currency,status,description)
      VALUES(v_target,'deposit',0.01,'BTC','pending','Scope regression deposit') RETURNING id INTO v_tx;
    PERFORM public.admin_review_funding_request(v_target,v_tx,'approve','Scoped funding review');
    PERFORM public.admin_review_funding_request(v_target,v_tx,'approve','Idempotent review');
    SELECT btc_balance INTO v_after FROM public.balances WHERE user_id=v_target;
    IF v_after<>v_before+0.01 THEN RAISE EXCEPTION 'Deposit approval credited incorrectly for %',v_role; END IF;
    SELECT usd_balance INTO v_before FROM public.balances WHERE user_id=v_target;
    INSERT INTO public.transactions(user_id,type,amount,currency,status,description)
      VALUES(v_target,'withdrawal',10,'USD','pending','Scope regression withdrawal') RETURNING id INTO v_tx;
    PERFORM public.admin_review_funding_request(v_target,v_tx,'reject','Scoped withdrawal rejection');
    PERFORM public.admin_review_funding_request(v_target,v_tx,'reject','Idempotent rejection');
    SELECT usd_balance INTO v_after FROM public.balances WHERE user_id=v_target;
    IF v_after<>v_before THEN RAISE EXCEPTION 'Withdrawal refund incorrect for %',v_role; END IF;

    PERFORM public.crm_open_client_position(v_target,'futures','SCOPE_TESTUSDT','long',0.01,10,'isolated',gen_random_uuid(),'Scoped futures position');
    PERFORM public.crm_open_client_position(v_target,'cfd','QSC/USD','short',0.01,10,'isolated',gen_random_uuid(),'Scoped CFD position');

    FOREACH v_sql IN ARRAY ARRAY[
      'SELECT public.admin_get_user_workspace($1)',
      'SELECT public.admin_update_user_profile($1,''{"first_name":"denied"}''::jsonb,''Scope denial'')',
      'SELECT public.admin_set_user_balances($1,1,1,1,''Scope denial'')',
      'SELECT public.admin_get_funding_requests($1)',
      'SELECT public.crm_get_client_trade_context($1,''futures'')',
      'SELECT public.crm_set_plain_password(''denied'',$1)'
    ] LOOP
      BEGIN
        EXECUTE v_sql USING v_foreign;
        RAISE EXCEPTION 'Cross-company action unexpectedly succeeded: %',v_sql;
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%outside your CRM access%' THEN RAISE; END IF;
        v_denials:=v_denials+1;
      END;
      BEGIN
        EXECUTE v_sql USING v_denied;
        RAISE EXCEPTION 'Wrong-stage action unexpectedly succeeded: %',v_sql;
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%outside your CRM access%' THEN RAISE; END IF;
        v_denials:=v_denials+1;
      END;
    END LOOP;
    IF v_role IN('agent','desk_manager') THEN
      BEGIN
        PERFORM public.admin_get_user_workspace(v_outside);
        RAISE EXCEPTION 'Other Office workspace unexpectedly available';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%outside your CRM access%' THEN RAISE; END IF;
        v_denials:=v_denials+1;
      END;
    END IF;
    BEGIN
      PERFORM public.admin_update_user_profile(v_target,'{"is_admin":true}'::jsonb,'Privilege escalation denial');
      RAISE EXCEPTION 'Administrator privilege escalation succeeded';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Administrator access required%' THEN RAISE; END IF;
      v_denials:=v_denials+1;
    END;
    BEGIN
      PERFORM public.admin_save_deposit_payment_instructions(v_target,'btc','shared','{}'::jsonb,'Shared settings denial');
      RAISE EXCEPTION 'Company-wide payment mutation succeeded';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Administrator access required%' THEN RAISE; END IF;
      v_denials:=v_denials+1;
    END;
    PERFORM set_config('request.headers','{"cf-connecting-ip":"192.0.2.240"}',true);
    BEGIN
      PERFORM public.admin_get_user_workspace(v_target);
      RAISE EXCEPTION 'Unapproved network accepted';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%CRM network access required%' THEN RAISE; END IF;
      v_denials:=v_denials+1;
    END;

    PERFORM set_config('request.jwt.claim.role','service_role',true);
    IF NOT public.crm_service_can_manage_account(v_actor,v_target,'192.0.2.239')
      OR public.crm_service_can_manage_account(v_actor,v_denied,'192.0.2.239')
      OR public.crm_service_can_manage_account(v_actor,v_foreign,'192.0.2.239')
      OR public.crm_service_can_manage_account(v_actor,v_desk,'192.0.2.239') THEN
      RAISE EXCEPTION 'Service actor authorization incorrect for %',v_role;
    END IF;
  END LOOP;

  DELETE FROM public.crm_client_agent_assignments WHERE client_id=v_sales;
  DELETE FROM public.crm_client_retention_assignments WHERE client_id=v_promoted;
  FOR v_actor,v_target IN SELECT v_agent,v_sales UNION ALL SELECT v_retention,v_promoted LOOP
    PERFORM set_config('request.jwt.claim.role','authenticated',true);
    PERFORM set_config('request.jwt.claim.sub',v_actor::text,true);
    PERFORM set_config('request.headers','{"cf-connecting-ip":"192.0.2.239"}',true);
    BEGIN
      PERFORM public.admin_get_user_workspace(v_target);
      RAISE EXCEPTION 'Removed assignment still has access';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%outside your CRM access%' THEN RAISE; END IF;
      v_denials:=v_denials+1;
    END;
  END LOOP;
  SELECT count(*) INTO v_positions FROM public.futures_positions WHERE user_id IN(v_sales,v_promoted);
  IF v_positions<>10 THEN RAISE EXCEPTION 'Wrong scoped trading count'; END IF;
  IF EXISTS(SELECT 1 FROM public.users WHERE id IN(v_workflow,v_desk,v_agent,v_manager,v_retention,v_sales,v_promoted) AND is_admin) THEN
    RAISE EXCEPTION 'Scoped management granted global administrator access';
  END IF;
  IF has_function_privilege('authenticated','public.crm_service_can_manage_account(uuid,uuid,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.admin_get_user_workspace_unscoped(uuid)','EXECUTE')
    OR has_function_privilege('anon','public.admin_get_user_workspace(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Private or service-only API exposed';
  END IF;
  INSERT INTO scoped_client_result VALUES(5,v_positions,v_denials);
END;
$$;
SELECT *,true AS all_changes_rolled_back FROM scoped_client_result;
ROLLBACK;
