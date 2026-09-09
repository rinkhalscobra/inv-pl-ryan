/*
  Initialize every direct Supabase Auth signup atomically.
  A signup must never succeed without its required application records.
*/

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
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.users WHERE referral_code = new_code
    );
  END LOOP;

  INSERT INTO public.users (
    id,
    email,
    first_name,
    last_name,
    country,
    kyc_status,
    referral_code,
    is_demo,
    is_admin
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
    user_id,
    is_active,
    strategy,
    min_profit_threshold,
    max_trade_amount,
    allocated_balance,
    todays_profit,
    total_trades,
    successful_trades,
    active_challenge_id,
    challenge_account_balance,
    challenge_profit_target,
    challenge_max_drawdown,
    challenge_time_limit
  )
  VALUES (
    NEW.id, false, 'triangular', 0.5, 1000,
    0, 0, 0, 0, NULL, 0, 0, 0, 30
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_assets (user_id, asset_symbol, balance)
  VALUES
    (NEW.id, 'USDT', 100000.00000000),
    (NEW.id, 'BTC', 0.00000000)
  ON CONFLICT (user_id, asset_symbol) DO NOTHING;

  INSERT INTO public.user_2fa (user_id, is_enabled, secret)
  VALUES (NEW.id, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.portfolio_snapshots (
    user_id,
    snapshot_date,
    total_value,
    usdt_balance,
    btc_balance,
    btc_price
  )
  VALUES (
    NEW.id,
    CURRENT_DATE,
    100000.00000000,
    100000.00000000,
    0.00000000,
    COALESCE((
      SELECT price
      FROM public.market_data
      WHERE symbol = 'BTCUSDT'
      ORDER BY timestamp DESC
      LIMIT 1
    ), 0)
  )
  ON CONFLICT (user_id, snapshot_date) DO NOTHING;

  IF NULLIF(trim(NEW.raw_user_meta_data->>'referral_code'), '') IS NOT NULL THEN
    SELECT id
    INTO referrer_id
    FROM public.users
    WHERE referral_code = upper(trim(NEW.raw_user_meta_data->>'referral_code'))
      AND id <> NEW.id;

    IF referrer_id IS NOT NULL THEN
      UPDATE public.users
      SET referred_by = referrer_id
      WHERE id = NEW.id;

      UPDATE public.users
      SET referral_count = COALESCE(referral_count, 0) + 1
      WHERE id = referrer_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();
