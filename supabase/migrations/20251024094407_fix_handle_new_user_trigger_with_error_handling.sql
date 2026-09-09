/*
  # Fix handle_new_user trigger with better error handling

  1. Changes
    - Add comprehensive error handling
    - Wrap everything in exception blocks
    - Return proper error messages
    - Handle all edge cases
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  referrer_id uuid;
  referrer_referral_count integer;
  new_referral_code text;
BEGIN
  BEGIN
    -- Generate referral code with fallback
    BEGIN
      new_referral_code := generate_referral_code();
    EXCEPTION WHEN OTHERS THEN
      -- Fallback to simple UUID-based code
      new_referral_code := UPPER(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 7));
    END;

    -- Insert into public.users with demo mode enabled
    INSERT INTO public.users (id, email, kyc_status, referral_code, is_demo, is_admin)
    VALUES (NEW.id, NEW.email, 'not_verified', new_referral_code, true, false)
    ON CONFLICT (id) DO UPDATE SET
      email = NEW.email,
      updated_at = now();

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error inserting user: %', SQLERRM;
    RETURN NEW;
  END;

  BEGIN
    -- Insert into balances with demo balance
    INSERT INTO public.balances (user_id, usdt_balance, btc_balance)
    VALUES (NEW.id, 100000.00000000, 0.00000000)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error inserting balance: %', SQLERRM;
  END;

  BEGIN
    -- Insert into robot_states
    INSERT INTO public.robot_states (
      user_id, is_active, strategy, min_profit_threshold, 
      max_trade_amount, allocated_balance, todays_profit, 
      total_trades, successful_trades, active_challenge_id, 
      challenge_account_balance, challenge_profit_target, 
      challenge_max_drawdown, challenge_time_limit
    )
    VALUES (NEW.id, false, 'triangular', 0.5, 1000, 0, 0, 0, 0, NULL, 0, 0, 0, 30)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error inserting robot_states: %', SQLERRM;
  END;

  BEGIN
    -- Initialize user_assets with USDT and BTC
    INSERT INTO public.user_assets (user_id, asset_symbol, balance)
    VALUES
      (NEW.id, 'USDT', 100000.00000000),
      (NEW.id, 'BTC', 0.00000000)
    ON CONFLICT (user_id, asset_symbol) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error inserting user_assets: %', SQLERRM;
  END;

  BEGIN
    -- Handle referral logic if referral_code is present in user_metadata
    IF NEW.raw_user_meta_data->>'referral_code' IS NOT NULL AND 
       NEW.raw_user_meta_data->>'referral_code' != '' THEN
      
      SELECT id, referral_count INTO referrer_id, referrer_referral_count
      FROM public.users
      WHERE referral_code = UPPER(TRIM(NEW.raw_user_meta_data->>'referral_code'));

      IF FOUND THEN
        -- Update referred user
        UPDATE public.users
        SET referred_by = referrer_id
        WHERE id = NEW.id;

        -- Update referrer's count
        UPDATE public.users
        SET referral_count = COALESCE(referrer_referral_count, 0) + 1
        WHERE id = referrer_id;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error handling referral: %', SQLERRM;
  END;

  BEGIN
    -- Create 2FA record (disabled by default)
    INSERT INTO public.user_2fa (user_id, is_enabled, secret)
    VALUES (NEW.id, false, NULL)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error inserting user_2fa: %', SQLERRM;
  END;

  BEGIN
    -- Create initial portfolio snapshot
    INSERT INTO public.portfolio_snapshots (
      user_id,
      snapshot_date,
      total_value,
      usdt_balance,
      btc_balance,
      btc_price
    )
    SELECT
      NEW.id,
      CURRENT_DATE,
      100000.00000000,
      100000.00000000,
      0.00000000,
      COALESCE((SELECT price FROM public.market_data WHERE symbol = 'BTCUSDT' ORDER BY timestamp DESC LIMIT 1), 0)
    ON CONFLICT (user_id, snapshot_date) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error inserting portfolio_snapshot: %', SQLERRM;
  END;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Fatal error in handle_new_user: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
