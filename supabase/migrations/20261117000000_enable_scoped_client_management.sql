/* Staff receive the full client workspace within the existing CRM visibility
   scope. Company administration, staff roles and assignments stay separate. */
CREATE OR REPLACE FUNCTION crm_private.require_client_management(p_target_user_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF crm_private.actor_role_for(auth.uid()) = 'admin' THEN
    PERFORM public.require_admin();
    PERFORM crm_private.assert_actor_user_access(p_target_user_id);
    RETURN;
  END IF;
  IF COALESCE(crm_private.actor_role_for(auth.uid()), '') NOT IN
    ('workflow_manager','desk_manager','agent','retention_manager','retention') THEN
    RAISE EXCEPTION 'CRM staff access required';
  END IF;
  IF NOT public.crm_staff_network_allowed() THEN
    RAISE EXCEPTION 'CRM network access required';
  END IF;
  IF NOT crm_private.can_actor_view_client(auth.uid(),p_target_user_id) THEN
    RAISE EXCEPTION 'Client is outside your CRM access';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION crm_private.require_client_management(uuid) FROM PUBLIC,anon,authenticated,service_role;

/* Service-key handlers authorize the real signed-in actor and trusted request
   IP before reading documents or calling the Auth administration API. */
CREATE OR REPLACE FUNCTION public.crm_service_can_manage_account(p_actor_id uuid,p_target_user_id uuid,p_ip text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_context jsonb; v_company uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  SELECT company_id INTO v_company FROM public.users WHERE id=p_target_user_id;
  IF NOT FOUND OR v_company IS NULL THEN RETURN false; END IF;
  v_context:=public.crm_service_actor_context(p_actor_id,p_ip,v_company);
  IF (v_context->>'company_id')::uuid IS DISTINCT FROM v_company THEN RETURN false; END IF;
  IF (v_context->>'is_admin')::boolean THEN RETURN true; END IF;
  RETURN COALESCE(crm_private.actor_role_for(p_actor_id),'') IN
      ('workflow_manager','desk_manager','agent','retention_manager','retention')
    AND crm_private.can_actor_view_client(p_actor_id,p_target_user_id);
END;
$$;
REVOKE ALL ON FUNCTION public.crm_service_can_manage_account(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_service_can_manage_account(uuid,uuid,text) TO service_role;

/* Preserve validated business logic, ownership predicates, ledger effects and
   audit records. Include the private originals behind the tenancy wrappers. */
DO $migration$
DECLARE signature text; definition text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'admin_get_user_workspace(uuid)','admin_get_user_workspace_unscoped(uuid)',
    'admin_get_account_role(uuid)','admin_get_account_role_unscoped(uuid)',
    'admin_get_client_onboarding(uuid)','admin_get_client_onboarding_unscoped(uuid)',
    'admin_get_kyc_tax_id(uuid)','admin_get_kyc_tax_id_unscoped(uuid)',
    'admin_get_user_wheel_grants(uuid)','admin_get_user_wheel_grants_unscoped(uuid)',
    'admin_update_user_profile(uuid,jsonb,text)','admin_review_kyc_application(uuid,text,text)',
    'admin_set_user_kyc_status(uuid,text,text)',
    'admin_set_user_balances(uuid,numeric,numeric,numeric,text)',
    'admin_set_user_balances(uuid,numeric,numeric,text)',
    'admin_set_user_asset_balance(uuid,text,numeric,text)',
    'admin_update_robot_state(uuid,jsonb,text)','admin_credit_robot_profit(uuid,numeric,text)',
    'admin_add_user_deposit(uuid,numeric,text,text,text)',
    'admin_grant_wheel_spin(uuid,integer,text)','admin_revoke_wheel_spin(uuid,uuid,text)',
    'admin_add_user_note(uuid,text)','admin_send_notification(uuid,text,text)',
    'admin_send_support_message(uuid,uuid,text)',
    'admin_update_module_record(uuid,text,uuid,jsonb,text)',
    'admin_delete_module_record(uuid,text,uuid,text)',
    'admin_get_deposit_payment_instructions(uuid)',
    'admin_save_deposit_payment_instructions(uuid,text,text,jsonb,text)',
    'admin_get_funding_requests(uuid)',
    'admin_review_funding_request(uuid,uuid,text,text)'
  ] LOOP
    SELECT pg_get_functiondef(('public.'||signature)::regprocedure) INTO definition;
    IF position('PERFORM public.require_admin();' IN definition)=0 THEN
      RAISE EXCEPTION 'Unexpected client API definition: %',signature;
    END IF;
    definition:=replace(definition,'PERFORM public.require_admin();',
      'PERFORM crm_private.require_client_management(p_target_user_id);');
    definition:=replace(definition,'PERFORM crm_private.assert_actor_user_access(p_target_user_id);',
      'PERFORM crm_private.require_client_management(p_target_user_id);');
    IF signature='admin_update_user_profile(uuid,jsonb,text)' THEN
      definition:=replace(definition,'PERFORM crm_private.require_client_management(p_target_user_id);',
        'PERFORM crm_private.require_client_management(p_target_user_id);
         IF p_changes ?| ARRAY[''is_admin'',''company_id'',''office_id'',''is_promoted'',''role''] THEN
           PERFORM public.require_admin();
         END IF;
         IF p_changes ? ''referred_by'' AND NULLIF(p_changes->>''referred_by'','''') IS NOT NULL
           AND NULLIF(p_changes->>''referred_by'','''')::uuid IS DISTINCT FROM
             (SELECT referred_by FROM public.users WHERE id=p_target_user_id) THEN
           PERFORM crm_private.require_client_management((p_changes->>''referred_by'')::uuid);
         END IF;');
    END IF;
    IF signature='admin_save_deposit_payment_instructions(uuid,text,text,jsonb,text)' THEN
      definition:=replace(definition,'PERFORM crm_private.require_client_management(p_target_user_id);',
        'PERFORM crm_private.require_client_management(p_target_user_id);
         IF p_scope=''shared'' THEN PERFORM public.require_admin(); END IF;');
    END IF;
    IF signature='admin_update_module_record(uuid,text,uuid,jsonb,text)' THEN
      definition:=replace(definition,'PERFORM crm_private.assert_actor_user_access((v_before->>''referrer_id'')::uuid);',
        'PERFORM crm_private.require_client_management((v_before->>''referrer_id'')::uuid);');
      definition:=replace(definition,'PERFORM crm_private.assert_actor_user_access((v_before->>''referred_user_id'')::uuid);',
        'PERFORM crm_private.require_client_management((v_before->>''referred_user_id'')::uuid);');
      definition:=replace(definition,'''created_at'', ''updated_at'')',
        '''created_at'', ''updated_at'', ''company_id'')');
    END IF;
    IF signature='admin_delete_module_record(uuid,text,uuid,text)' THEN
      definition:=replace(definition,'IF v_before IS NULL THEN RAISE EXCEPTION ''Record not found for this user''; END IF;',
        'IF v_before IS NULL THEN RAISE EXCEPTION ''Record not found for this user''; END IF;
         IF p_table_name=''referral_earnings'' THEN
           PERFORM crm_private.require_client_management((v_before->>''referrer_id'')::uuid);
           PERFORM crm_private.require_client_management((v_before->>''referred_user_id'')::uuid);
         END IF;');
    END IF;
    EXECUTE definition;
  END LOOP;

  SELECT pg_get_functiondef('public.admin_get_module_edit_options(text)'::regprocedure) INTO definition;
  IF position('PERFORM public.require_admin();' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected module options guard'; END IF;
  definition:=replace(definition,'public.admin_get_module_edit_options(p_table_name text)',
    'public.crm_get_client_module_edit_options(p_target_user_id uuid, p_table_name text)');
  EXECUTE replace(definition,'PERFORM public.require_admin();',
    'PERFORM crm_private.require_client_management(p_target_user_id);');

  SELECT pg_get_functiondef('crm_private.reconcile_crm_wallet_status(public.transactions,public.transactions)'::regprocedure) INTO definition;
  IF position('PERFORM public.require_admin();' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected wallet status guard'; END IF;
  EXECUTE replace(definition,'PERFORM public.require_admin();',
    'PERFORM crm_private.require_client_management(p_old.user_id);');

  SELECT pg_get_functiondef('public.protect_user_kyc_status()'::regprocedure) INTO definition;
  IF position('PERFORM public.require_admin();' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected KYC status guard'; END IF;
  EXECUTE replace(definition,'PERFORM public.require_admin();',
    'PERFORM crm_private.require_client_management(NEW.id);');

  SELECT pg_get_functiondef('public.crm_set_plain_password(text,uuid)'::regprocedure) INTO definition;
  IF position('PERFORM crm_private.assert_actor_user_access(p_user_id);' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected password mirror guard'; END IF;
  EXECUTE replace(definition,'PERFORM crm_private.assert_actor_user_access(p_user_id);',
    'IF auth.role() IS DISTINCT FROM ''service_role'' AND auth.uid() IS DISTINCT FROM p_user_id THEN
       PERFORM crm_private.require_client_management(p_user_id);
     ELSE PERFORM crm_private.assert_actor_user_access(p_user_id); END IF;');
END;
$migration$;
REVOKE ALL ON FUNCTION public.crm_get_client_module_edit_options(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_get_client_module_edit_options(uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION crm_private.require_client_trade_access(p_target_user_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM crm_private.require_client_management(p_target_user_id);
  IF EXISTS(SELECT 1 FROM public.users WHERE id=p_target_user_id AND is_admin)
    OR EXISTS(SELECT 1 FROM public.crm_staff_roles WHERE user_id=p_target_user_id) THEN
    RAISE EXCEPTION 'Select a client trading account';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION crm_private.require_client_trade_access(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.protect_robot_profit_percentage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF OLD.custom_daily_profit_percentage IS DISTINCT FROM NEW.custom_daily_profit_percentage
    AND COALESCE(auth.role(),'')<>'service_role' THEN
    PERFORM crm_private.require_client_management(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;
