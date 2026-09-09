/* Remove the legacy application-level 2FA feature and its active dependencies. */

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
    id, email, first_name, last_name, country, kyc_status, referral_code, is_demo, is_admin
  )
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(trim(NEW.raw_user_meta_data->>'first_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'last_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'country'), ''),
    'not_verified',
    new_code,
    true,
    false
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = COALESCE(EXCLUDED.first_name, public.users.first_name),
    last_name = COALESCE(EXCLUDED.last_name, public.users.last_name),
    country = COALESCE(EXCLUDED.country, public.users.country);

  INSERT INTO public.balances (user_id, usdt_balance, btc_balance)
  VALUES (NEW.id, 100000.00000000, 0.00000000)
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
  VALUES (NEW.id, 'USDT', 100000.00000000), (NEW.id, 'BTC', 0.00000000)
  ON CONFLICT (user_id, asset_symbol) DO NOTHING;

  INSERT INTO public.portfolio_snapshots (
    user_id, snapshot_date, total_value, usdt_balance, btc_balance, btc_price
  )
  VALUES (
    NEW.id, CURRENT_DATE, 100000.00000000, 100000.00000000, 0.00000000,
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

/* Preserve generic legacy helpers while removing their obsolete 2FA statements. */
DO $$
DECLARE
  function_definition text;
  block_start integer;
  block_end integer;
BEGIN
  IF to_regprocedure('public.initialize_new_user(text)') IS NOT NULL THEN
    SELECT pg_get_functiondef('public.initialize_new_user(text)'::regprocedure)
    INTO function_definition;
    block_start := strpos(function_definition, '-- Create 2FA record');
    block_end := strpos(function_definition, '-- Create initial portfolio snapshot');
    IF block_start = 0 OR block_end <= block_start THEN
      RAISE EXCEPTION 'Could not safely remove 2FA from initialize_new_user';
    END IF;
    function_definition := left(function_definition, block_start - 1)
      || substring(function_definition FROM block_end);
    EXECUTE function_definition;
  END IF;

  IF to_regprocedure('public.reset_demo_user_account(uuid,numeric)') IS NOT NULL THEN
    SELECT pg_get_functiondef('public.reset_demo_user_account(uuid,numeric)'::regprocedure)
    INTO function_definition;
    block_start := strpos(function_definition, '-- 2FA data');
    block_end := strpos(function_definition, '-- User notes');
    IF block_start = 0 OR block_end <= block_start THEN
      RAISE EXCEPTION 'Could not safely remove 2FA from reset_demo_user_account';
    END IF;
    function_definition := left(function_definition, block_start - 1)
      || substring(function_definition FROM block_end);
    EXECUTE function_definition;
  END IF;

  IF to_regprocedure('public.handle_demo_user_deposit()') IS NOT NULL THEN
    SELECT pg_get_functiondef('public.handle_demo_user_deposit()'::regprocedure)
    INTO function_definition;
    IF strpos(function_definition, 'user_2fa') > 0 THEN
      block_start := strpos(function_definition, '-- Delete from user_2fa');
      block_end := strpos(function_definition, '-- Delete from trading_logs');
      IF block_start = 0 OR block_end <= block_start THEN
        RAISE EXCEPTION 'Could not safely remove 2FA from handle_demo_user_deposit';
      END IF;
      function_definition := left(function_definition, block_start - 1)
        || substring(function_definition FROM block_end);
      EXECUTE function_definition;
    END IF;
  END IF;
END;
$$;

DROP INDEX IF EXISTS public.idx_users_two_factor_required;
ALTER TABLE public.users DROP COLUMN IF EXISTS two_factor_required;
DROP TABLE IF EXISTS public.user_2fa;
