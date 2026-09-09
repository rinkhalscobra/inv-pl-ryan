/*
  # Recreate simple and reliable trigger

  1. Changes
    - Drop existing trigger
    - Create a simpler, more reliable trigger
    - Remove complex error handling that might be causing silent failures
*/

-- Drop existing trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create simple, reliable function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_code text;
  referrer_id uuid;
  referrer_count integer;
BEGIN
  -- Generate referral code (simple version)
  new_code := UPPER(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 7));
  
  -- Insert user
  INSERT INTO public.users (id, email, kyc_status, referral_code, is_demo, is_admin)
  VALUES (NEW.id, NEW.email, 'not_verified', new_code, true, false)
  ON CONFLICT (id) DO UPDATE SET email = NEW.email;
  
  -- Insert balance
  INSERT INTO public.balances (user_id, usdt_balance, btc_balance)
  VALUES (NEW.id, 100000.00000000, 0.00000000)
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Insert robot_states
  INSERT INTO public.robot_states (
    user_id, is_active, strategy, min_profit_threshold, max_trade_amount,
    allocated_balance, todays_profit, total_trades, successful_trades,
    active_challenge_id, challenge_account_balance, challenge_profit_target,
    challenge_max_drawdown, challenge_time_limit
  )
  VALUES (NEW.id, false, 'triangular', 0.5, 1000, 0, 0, 0, 0, NULL, 0, 0, 0, 30)
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Insert user_assets
  INSERT INTO public.user_assets (user_id, asset_symbol, balance)
  VALUES (NEW.id, 'USDT', 100000.00000000), (NEW.id, 'BTC', 0.00000000)
  ON CONFLICT (user_id, asset_symbol) DO NOTHING;
  
  -- Handle referral
  IF NEW.raw_user_meta_data->>'referral_code' IS NOT NULL THEN
    SELECT id, referral_count INTO referrer_id, referrer_count
    FROM public.users
    WHERE referral_code = UPPER(TRIM(NEW.raw_user_meta_data->>'referral_code'));
    
    IF FOUND THEN
      UPDATE public.users SET referred_by = referrer_id WHERE id = NEW.id;
      UPDATE public.users SET referral_count = COALESCE(referrer_count, 0) + 1 WHERE id = referrer_id;
    END IF;
  END IF;
  
  -- Insert 2FA
  INSERT INTO public.user_2fa (user_id, is_enabled, secret)
  VALUES (NEW.id, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Insert portfolio snapshot
  INSERT INTO public.portfolio_snapshots (
    user_id, snapshot_date, total_value, usdt_balance, btc_balance, btc_price
  )
  VALUES (
    NEW.id, CURRENT_DATE, 100000.00000000, 100000.00000000, 0.00000000,
    COALESCE((SELECT price FROM public.market_data WHERE symbol = 'BTCUSDT' ORDER BY timestamp DESC LIMIT 1), 0)
  )
  ON CONFLICT (user_id, snapshot_date) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();
