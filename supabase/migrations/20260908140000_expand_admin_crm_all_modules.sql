/* Expand the CRM to every customer-facing module with audited record control. */

CREATE OR REPLACE FUNCTION public.admin_get_user_workspace(p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile jsonb;
BEGIN
  PERFORM public.require_admin();
  SELECT to_jsonb(u) INTO v_profile FROM public.users u WHERE u.id = p_target_user_id;
  IF v_profile IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;

  RETURN jsonb_build_object(
    'profile', v_profile,
    'balance', COALESCE((SELECT to_jsonb(x) FROM public.balances x WHERE x.user_id = p_target_user_id), '{}'::jsonb),
    'robot', COALESCE((SELECT to_jsonb(x) FROM public.robot_states x WHERE x.user_id = p_target_user_id), '{}'::jsonb),
    'bank_details', COALESCE((SELECT to_jsonb(x) FROM public.client_bank_details x WHERE x.user_id = p_target_user_id), '{}'::jsonb),
    'assets', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.asset_symbol) FROM public.user_assets x WHERE x.user_id = p_target_user_id), '[]'::jsonb),
    'transactions', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.transactions WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 250) x), '[]'::jsonb),
    'portfolio_snapshots', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.snapshot_date DESC) FROM (SELECT * FROM public.portfolio_snapshots WHERE user_id = p_target_user_id ORDER BY snapshot_date DESC LIMIT 100) x), '[]'::jsonb),
    'spot_orders', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.spot_orders WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 150) x), '[]'::jsonb),
    'futures_positions', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.futures_positions WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 150) x), '[]'::jsonb),
    'futures_orders', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.futures_orders WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 150) x), '[]'::jsonb),
    'futures_history', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.close_time DESC) FROM (SELECT * FROM public.futures_position_history WHERE user_id = p_target_user_id ORDER BY close_time DESC LIMIT 150) x), '[]'::jsonb),
    'swap_charges', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.position_swap_charges WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 150) x), '[]'::jsonb),
    'binary_trades', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.binary_trades WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 150) x), '[]'::jsonb),
    'stakes', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.user_stakes WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 150) x), '[]'::jsonb),
    'event_bets', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.event_bets WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 150) x), '[]'::jsonb),
    'prop_positions', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.prop_positions WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 150) x), '[]'::jsonb),
    'prop_orders', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.prop_orders WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 150) x), '[]'::jsonb),
    'prop_history', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.close_time DESC) FROM (SELECT * FROM public.prop_position_history WHERE user_id = p_target_user_id ORDER BY close_time DESC LIMIT 150) x), '[]'::jsonb),
    'prop_accounts', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM public.prop_account_balances x WHERE x.user_id = p_target_user_id), '[]'::jsonb),
    'prop_logs', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.prop_logs WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 150) x), '[]'::jsonb),
    'trading_logs', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.trading_logs WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 150) x), '[]'::jsonb),
    'deposit_addresses', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM public.crypto_deposit_addresses x WHERE x.user_id = p_target_user_id), '[]'::jsonb),
    'deposits', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.crypto_deposits WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 150) x), '[]'::jsonb),
    'payment_requests', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.crypto_payment_requests WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 150) x), '[]'::jsonb),
    'sandbox_payments', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.sandbox_payment_transactions WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 150) x), '[]'::jsonb),
    'giveaway_tickets', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM public.giveaway_tickets x WHERE x.user_id = p_target_user_id), '[]'::jsonb),
    'giveaway_entries', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.last_updated DESC) FROM public.giveaway_entries x WHERE x.user_id = p_target_user_id), '[]'::jsonb),
    'giveaway_winners', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM public.giveaway_winners x WHERE x.user_id = p_target_user_id), '[]'::jsonb),
    'referral_earnings', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.referral_earnings WHERE referrer_id = p_target_user_id OR referred_user_id = p_target_user_id ORDER BY created_at DESC LIMIT 150) x), '[]'::jsonb),
    'favorites', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM public.user_favorites x WHERE x.user_id = p_target_user_id), '[]'::jsonb),
    'notifications', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.notifications WHERE user_id = p_target_user_id ORDER BY created_at DESC LIMIT 150) x), '[]'::jsonb),
    'conversations', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.updated_at DESC) FROM public.conversations x WHERE x.user_id = p_target_user_id), '[]'::jsonb),
    'support_messages', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT m.* FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id WHERE c.user_id = p_target_user_id ORDER BY m.created_at DESC LIMIT 250) x), '[]'::jsonb),
    'notes', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM public.user_notes x WHERE x.user_id = p_target_user_id), '[]'::jsonb),
    'audit_logs', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.admin_action_logs WHERE target_user_id = p_target_user_id ORDER BY created_at DESC LIMIT 250) x), '[]'::jsonb)
  );
END;
$$;

/* Include the account controls used outside the original Profile form. */
CREATE OR REPLACE FUNCTION public.admin_update_user_profile(
  p_target_user_id uuid,
  p_changes jsonb,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_kyc text;
BEGIN
  PERFORM public.require_admin();
  IF btrim(COALESCE(p_reason, '')) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT to_jsonb(u) INTO v_before FROM public.users u WHERE u.id = p_target_user_id FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;

  IF p_changes ? 'kyc_status' THEN
    v_kyc := p_changes->>'kyc_status';
    IF v_kyc NOT IN ('not_verified', 'pending', 'verified') THEN RAISE EXCEPTION 'Invalid KYC status'; END IF;
  END IF;
  IF p_changes ? 'is_admin'
     AND p_target_user_id = auth.uid()
     AND (p_changes->>'is_admin')::boolean IS DISTINCT FROM (v_before->>'is_admin')::boolean THEN
    RAISE EXCEPTION 'You cannot change your own administrator status';
  END IF;
  IF COALESCE(NULLIF(p_changes->>'referral_count', '')::integer, 0) < 0 THEN RAISE EXCEPTION 'Referral count cannot be negative'; END IF;
  IF COALESCE(NULLIF(p_changes->>'referral_commission_rate', '')::numeric, 0) NOT BETWEEN 0 AND 1 THEN RAISE EXCEPTION 'Referral commission rate must be between 0 and 1'; END IF;

  UPDATE public.users
  SET first_name = CASE WHEN p_changes ? 'first_name' THEN NULLIF(btrim(p_changes->>'first_name'), '') ELSE first_name END,
      last_name = CASE WHEN p_changes ? 'last_name' THEN NULLIF(btrim(p_changes->>'last_name'), '') ELSE last_name END,
      country = CASE WHEN p_changes ? 'country' THEN NULLIF(btrim(p_changes->>'country'), '') ELSE country END,
      phone_number = CASE WHEN p_changes ? 'phone_number' THEN NULLIF(btrim(p_changes->>'phone_number'), '') ELSE phone_number END,
      kyc_status = CASE WHEN p_changes ? 'kyc_status' THEN p_changes->>'kyc_status' ELSE kyc_status END,
      is_demo = CASE WHEN p_changes ? 'is_demo' THEN (p_changes->>'is_demo')::boolean ELSE is_demo END,
      is_admin = CASE WHEN p_changes ? 'is_admin' THEN (p_changes->>'is_admin')::boolean ELSE is_admin END,
      document_id_url = CASE WHEN p_changes ? 'document_id_url' THEN NULLIF(btrim(p_changes->>'document_id_url'), '') ELSE document_id_url END,
      document_selfie_url = CASE WHEN p_changes ? 'document_selfie_url' THEN NULLIF(btrim(p_changes->>'document_selfie_url'), '') ELSE document_selfie_url END,
      referral_code = CASE WHEN p_changes ? 'referral_code' THEN NULLIF(upper(btrim(p_changes->>'referral_code')), '') ELSE referral_code END,
      referred_by = CASE WHEN p_changes ? 'referred_by' THEN NULLIF(p_changes->>'referred_by', '')::uuid ELSE referred_by END,
      referral_count = CASE WHEN p_changes ? 'referral_count' THEN COALESCE(NULLIF(p_changes->>'referral_count', '')::integer, 0) ELSE referral_count END,
      total_referral_earnings = CASE WHEN p_changes ? 'total_referral_earnings' THEN COALESCE(NULLIF(p_changes->>'total_referral_earnings', '')::numeric, 0) ELSE total_referral_earnings END,
      referral_commission_rate = CASE WHEN p_changes ? 'referral_commission_rate' THEN COALESCE(NULLIF(p_changes->>'referral_commission_rate', '')::numeric, 0) ELSE referral_commission_rate END,
      two_factor_required = CASE WHEN p_changes ? 'two_factor_required' THEN (p_changes->>'two_factor_required')::boolean ELSE two_factor_required END,
      max_leverage_forex = CASE WHEN p_changes ? 'max_leverage_forex' THEN NULLIF(p_changes->>'max_leverage_forex', '')::integer ELSE max_leverage_forex END,
      min_leverage_forex = CASE WHEN p_changes ? 'min_leverage_forex' THEN NULLIF(p_changes->>'min_leverage_forex', '')::integer ELSE min_leverage_forex END,
      max_leverage_commodities = CASE WHEN p_changes ? 'max_leverage_commodities' THEN NULLIF(p_changes->>'max_leverage_commodities', '')::integer ELSE max_leverage_commodities END,
      min_leverage_commodities = CASE WHEN p_changes ? 'min_leverage_commodities' THEN NULLIF(p_changes->>'min_leverage_commodities', '')::integer ELSE min_leverage_commodities END,
      max_leverage_stocks = CASE WHEN p_changes ? 'max_leverage_stocks' THEN NULLIF(p_changes->>'max_leverage_stocks', '')::integer ELSE max_leverage_stocks END,
      min_leverage_stocks = CASE WHEN p_changes ? 'min_leverage_stocks' THEN NULLIF(p_changes->>'min_leverage_stocks', '')::integer ELSE min_leverage_stocks END,
      max_leverage_futures = CASE WHEN p_changes ? 'max_leverage_futures' THEN NULLIF(p_changes->>'max_leverage_futures', '')::integer ELSE max_leverage_futures END,
      min_leverage_futures = CASE WHEN p_changes ? 'min_leverage_futures' THEN NULLIF(p_changes->>'min_leverage_futures', '')::integer ELSE min_leverage_futures END,
      updated_at = now()
  WHERE id = p_target_user_id
  RETURNING to_jsonb(users.*) INTO v_after;

  INSERT INTO public.admin_action_logs(admin_user_id, target_user_id, action, before_data, after_data, reason)
  VALUES (auth.uid(), p_target_user_id, 'update_profile', v_before, v_after, p_reason);
  RETURN v_after;
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
  v_allowed_tables constant text[] := ARRAY[
    'user_assets', 'transactions', 'portfolio_snapshots', 'spot_orders', 'futures_positions',
    'futures_orders', 'futures_position_history', 'position_swap_charges',
    'binary_trades', 'user_stakes', 'event_bets', 'prop_positions', 'prop_orders',
    'prop_position_history', 'prop_account_balances', 'prop_logs', 'trading_logs',
    'crypto_deposit_addresses', 'crypto_deposits', 'crypto_payment_requests',
    'sandbox_payment_transactions', 'giveaway_tickets', 'giveaway_entries',
    'giveaway_winners', 'user_favorites', 'notifications', 'conversations',
    'client_bank_details', 'referral_earnings'
  ];
  v_owner_predicate text;
  v_columns text;
  v_patched_columns text;
  v_before jsonb;
  v_after jsonb;
BEGIN
  PERFORM public.require_admin();
  IF p_table_name <> ALL(v_allowed_tables) THEN RAISE EXCEPTION 'This CRM table is not editable'; END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;

  v_owner_predicate := CASE WHEN p_table_name = 'referral_earnings'
    THEN '(target.referrer_id = $2 OR target.referred_user_id = $2)'
    ELSE 'target.user_id = $2' END;

  EXECUTE format('SELECT to_jsonb(target) FROM public.%I target WHERE target.id = $1 AND %s FOR UPDATE', p_table_name, v_owner_predicate)
    INTO v_before USING p_record_id, p_target_user_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Record not found for this user'; END IF;

  SELECT
    string_agg(format('%I', c.column_name), ', ' ORDER BY c.ordinal_position),
    string_agg(format('patched.%I', c.column_name), ', ' ORDER BY c.ordinal_position)
  INTO v_columns, v_patched_columns
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = p_table_name
    AND c.column_name IN (SELECT jsonb_object_keys(COALESCE(p_changes, '{}'::jsonb)))
    AND c.column_name NOT IN ('id', 'user_id', 'referrer_id', 'referred_user_id', 'created_at', 'updated_at');

  IF v_columns IS NULL THEN RAISE EXCEPTION 'No editable fields supplied'; END IF;

  EXECUTE format(
    'UPDATE public.%1$I AS target SET (%2$s) = (SELECT %3$s FROM jsonb_populate_record(target, $1) AS patched) WHERE target.id = $2 AND %4$s RETURNING to_jsonb(target)',
    p_table_name, v_columns, v_patched_columns, replace(v_owner_predicate, '$2', '$3')
  ) INTO v_after USING p_changes, p_record_id, p_target_user_id;

  INSERT INTO public.admin_action_logs(admin_user_id, target_user_id, action, before_data, after_data, reason)
  VALUES (auth.uid(), p_target_user_id, 'update_' || p_table_name, v_before, v_after, p_reason);
  RETURN v_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_module_record(
  p_target_user_id uuid,
  p_table_name text,
  p_record_id uuid,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_allowed_tables constant text[] := ARRAY[
    'user_assets', 'transactions', 'portfolio_snapshots', 'spot_orders', 'futures_positions',
    'futures_orders', 'futures_position_history', 'position_swap_charges',
    'binary_trades', 'user_stakes', 'event_bets', 'prop_positions', 'prop_orders',
    'prop_position_history', 'prop_account_balances', 'prop_logs', 'trading_logs',
    'crypto_deposit_addresses', 'crypto_deposits', 'crypto_payment_requests',
    'sandbox_payment_transactions', 'giveaway_tickets', 'giveaway_entries',
    'giveaway_winners', 'user_favorites', 'notifications', 'conversations',
    'referral_earnings'
  ];
  v_owner_predicate text;
  v_before jsonb;
BEGIN
  PERFORM public.require_admin();
  IF p_table_name <> ALL(v_allowed_tables) THEN RAISE EXCEPTION 'This CRM table is not removable'; END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  v_owner_predicate := CASE WHEN p_table_name = 'referral_earnings'
    THEN '(target.referrer_id = $2 OR target.referred_user_id = $2)'
    ELSE 'target.user_id = $2' END;

  EXECUTE format('DELETE FROM public.%I target WHERE target.id = $1 AND %s RETURNING to_jsonb(target)', p_table_name, v_owner_predicate)
    INTO v_before USING p_record_id, p_target_user_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Record not found for this user'; END IF;
  INSERT INTO public.admin_action_logs(admin_user_id, target_user_id, action, before_data, reason)
  VALUES (auth.uid(), p_target_user_id, 'delete_' || p_table_name, v_before, p_reason);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_send_support_message(
  p_target_user_id uuid,
  p_conversation_id uuid,
  p_content text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_message public.messages%ROWTYPE;
BEGIN
  PERFORM public.require_admin();
  IF NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = p_conversation_id AND user_id = p_target_user_id) THEN
    RAISE EXCEPTION 'Conversation not found for this user';
  END IF;
  IF btrim(COALESCE(p_content, '')) = '' THEN RAISE EXCEPTION 'Message is required'; END IF;
  INSERT INTO public.messages(conversation_id, sender_id, content, is_read, is_admin_message)
  VALUES (p_conversation_id, auth.uid(), btrim(p_content), false, true) RETURNING * INTO v_message;
  UPDATE public.conversations SET status = 'pending', updated_at = now() WHERE id = p_conversation_id;
  INSERT INTO public.admin_action_logs(admin_user_id, target_user_id, action, after_data)
  VALUES (auth.uid(), p_target_user_id, 'support_reply', to_jsonb(v_message));
  RETURN to_jsonb(v_message);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_module_record(uuid, text, uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_module_record(uuid, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_send_support_message(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_module_record(uuid, text, uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_module_record(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_send_support_message(uuid, uuid, text) TO authenticated;
