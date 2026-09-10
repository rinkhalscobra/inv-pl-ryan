/* Remove account modes and ensure every new user starts with zero funds. */

DROP TRIGGER IF EXISTS reset_demo_account_on_deposit_trigger ON public.transactions;
DROP FUNCTION IF EXISTS public.handle_demo_user_deposit();
DROP FUNCTION IF EXISTS public.reset_demo_user_account(uuid, numeric);

ALTER TABLE public.balances
  ALTER COLUMN usdt_balance SET DEFAULT 0,
  ALTER COLUMN btc_balance SET DEFAULT 0;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_code text;
  referrer_id uuid;
BEGIN
  LOOP
    new_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 10));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.users WHERE referral_code = new_code);
  END LOOP;

  INSERT INTO public.users (
    id, email, first_name, last_name, country, kyc_status, referral_code, is_admin
  )
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(trim(NEW.raw_user_meta_data->>'first_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'last_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'country'), ''),
    'not_verified',
    new_code,
    false
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = COALESCE(EXCLUDED.first_name, public.users.first_name),
    last_name = COALESCE(EXCLUDED.last_name, public.users.last_name),
    country = COALESCE(EXCLUDED.country, public.users.country);

  INSERT INTO public.balances (user_id, usdt_balance, btc_balance)
  VALUES (NEW.id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.robot_states (
    user_id, is_active, strategy, min_profit_threshold, max_trade_amount,
    allocated_balance, todays_profit, total_trades, successful_trades,
    active_challenge_id, challenge_account_balance, challenge_profit_target,
    challenge_max_drawdown, challenge_time_limit
  )
  VALUES (NEW.id, false, 'triangular', 0.5, 1000, 0, 0, 0, 0, NULL, 0, 0, 0, 30)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_assets (user_id, asset_symbol, balance)
  VALUES (NEW.id, 'USDT', 0), (NEW.id, 'BTC', 0)
  ON CONFLICT (user_id, asset_symbol) DO NOTHING;

  INSERT INTO public.portfolio_snapshots (
    user_id, snapshot_date, total_value, usdt_balance, btc_balance, btc_price
  )
  VALUES (
    NEW.id, CURRENT_DATE, 0, 0, 0,
    COALESCE((
      SELECT price FROM public.market_data
      WHERE symbol = 'BTCUSDT'
      ORDER BY timestamp DESC LIMIT 1
    ), 0)
  )
  ON CONFLICT (user_id, snapshot_date) DO NOTHING;

  IF NULLIF(trim(NEW.raw_user_meta_data->>'referral_code'), '') IS NOT NULL THEN
    SELECT id INTO referrer_id
    FROM public.users
    WHERE referral_code = upper(trim(NEW.raw_user_meta_data->>'referral_code'))
      AND id <> NEW.id;

    IF referrer_id IS NOT NULL THEN
      UPDATE public.users SET referred_by = referrer_id WHERE id = NEW.id;
      UPDATE public.users
      SET referral_count = COALESCE(referral_count, 0) + 1
      WHERE id = referrer_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.initialize_new_user(referral_code_param text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  user_id uuid := auth.uid();
  user_email text;
  new_code text;
  referrer_id uuid;
BEGIN
  IF user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT email INTO user_email FROM auth.users WHERE id = user_id;

  IF EXISTS (SELECT 1 FROM public.users WHERE id = user_id) THEN
    RETURN json_build_object('success', true, 'message', 'User already initialized');
  END IF;

  LOOP
    new_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 10));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.users WHERE referral_code = new_code);
  END LOOP;

  INSERT INTO public.users (id, email, kyc_status, referral_code, is_admin)
  VALUES (user_id, user_email, 'not_verified', new_code, false);

  INSERT INTO public.balances (user_id, usdt_balance, btc_balance)
  VALUES (user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.robot_states (
    user_id, is_active, strategy, min_profit_threshold, max_trade_amount,
    allocated_balance, todays_profit, total_trades, successful_trades,
    active_challenge_id, challenge_account_balance, challenge_profit_target,
    challenge_max_drawdown, challenge_time_limit
  )
  VALUES (user_id, false, 'triangular', 0.5, 1000, 0, 0, 0, 0, NULL, 0, 0, 0, 30)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_assets (user_id, asset_symbol, balance)
  VALUES (user_id, 'USDT', 0), (user_id, 'BTC', 0)
  ON CONFLICT (user_id, asset_symbol) DO NOTHING;

  INSERT INTO public.portfolio_snapshots (
    user_id, snapshot_date, total_value, usdt_balance, btc_balance, btc_price
  )
  VALUES (
    user_id, CURRENT_DATE, 0, 0, 0,
    COALESCE((
      SELECT price FROM public.market_data
      WHERE symbol = 'BTCUSDT'
      ORDER BY timestamp DESC LIMIT 1
    ), 0)
  )
  ON CONFLICT (user_id, snapshot_date) DO NOTHING;

  IF NULLIF(trim(referral_code_param), '') IS NOT NULL THEN
    SELECT id INTO referrer_id
    FROM public.users
    WHERE referral_code = upper(trim(referral_code_param))
      AND id <> user_id;

    IF referrer_id IS NOT NULL THEN
      UPDATE public.users SET referred_by = referrer_id WHERE id = user_id;
      UPDATE public.users
      SET referral_count = COALESCE(referral_count, 0) + 1
      WHERE id = referrer_id;
    END IF;
  END IF;

  RETURN json_build_object('success', true, 'user_id', user_id);
END;
$$;

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
      is_admin = CASE WHEN p_changes ? 'is_admin' THEN (p_changes->>'is_admin')::boolean ELSE is_admin END,
      document_id_url = CASE WHEN p_changes ? 'document_id_url' THEN NULLIF(btrim(p_changes->>'document_id_url'), '') ELSE document_id_url END,
      document_selfie_url = CASE WHEN p_changes ? 'document_selfie_url' THEN NULLIF(btrim(p_changes->>'document_selfie_url'), '') ELSE document_selfie_url END,
      referral_code = CASE WHEN p_changes ? 'referral_code' THEN NULLIF(upper(btrim(p_changes->>'referral_code')), '') ELSE referral_code END,
      referred_by = CASE WHEN p_changes ? 'referred_by' THEN NULLIF(p_changes->>'referred_by', '')::uuid ELSE referred_by END,
      referral_count = CASE WHEN p_changes ? 'referral_count' THEN COALESCE(NULLIF(p_changes->>'referral_count', '')::integer, 0) ELSE referral_count END,
      total_referral_earnings = CASE WHEN p_changes ? 'total_referral_earnings' THEN COALESCE(NULLIF(p_changes->>'total_referral_earnings', '')::numeric, 0) ELSE total_referral_earnings END,
      referral_commission_rate = CASE WHEN p_changes ? 'referral_commission_rate' THEN COALESCE(NULLIF(p_changes->>'referral_commission_rate', '')::numeric, 0) ELSE referral_commission_rate END,
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

UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) - 'is_demo'
WHERE COALESCE(raw_user_meta_data, '{}'::jsonb) ? 'is_demo';

DROP INDEX IF EXISTS public.idx_users_is_demo;
ALTER TABLE public.users DROP COLUMN IF EXISTS is_demo;

GRANT EXECUTE ON FUNCTION public.initialize_new_user(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_profile(uuid, jsonb, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
