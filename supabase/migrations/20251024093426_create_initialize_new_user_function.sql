/*
  # Create Function to Initialize New User Data

  1. Changes
    - Create a public function that can be called after user signup
    - This function initializes all user data (users, balances, robot_states, etc.)
    - Can be called from the frontend or an edge function
    
  2. Security
    - Function uses SECURITY DEFINER to bypass RLS
    - Only allows initializing data for the authenticated user
*/

CREATE OR REPLACE FUNCTION public.initialize_new_user(
  referral_code_param text DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  user_id uuid;
  user_email text;
  referrer_id uuid;
  referrer_referral_count integer;
  new_code text;
  result json;
BEGIN
  -- Get the current user
  user_id := auth.uid();
  
  IF user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Get user email from auth.users
  SELECT email INTO user_email FROM auth.users WHERE id = user_id;
  
  -- Check if user already initialized
  IF EXISTS(SELECT 1 FROM public.users WHERE id = user_id) THEN
    RETURN json_build_object('success', true, 'message', 'User already initialized');
  END IF;
  
  -- Generate referral code
  new_code := generate_referral_code();
  
  -- Insert into public.users
  INSERT INTO public.users (id, email, kyc_status, referral_code, is_demo, is_admin)
  VALUES (user_id, user_email, 'not_verified', new_code, true, false);

  -- Insert into balances
  INSERT INTO public.balances (user_id, usdt_balance, btc_balance)
  VALUES (user_id, 100000.00000000, 0.00000000)
  ON CONFLICT (user_id) DO NOTHING;

  -- Insert into robot_states
  INSERT INTO public.robot_states (user_id, is_active, strategy, min_profit_threshold, max_trade_amount, allocated_balance, todays_profit, total_trades, successful_trades)
  VALUES (user_id, false, 'triangular', 0.5, 1000, 0, 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Initialize user_assets with USDT and BTC
  INSERT INTO public.user_assets (user_id, asset_symbol, balance)
  VALUES
    (user_id, 'USDT', 100000.00000000),
    (user_id, 'BTC', 0.00000000)
  ON CONFLICT (user_id, asset_symbol) DO NOTHING;

  -- Handle referral logic if referral_code is provided
  IF referral_code_param IS NOT NULL AND referral_code_param != '' THEN
    SELECT id, referral_count INTO referrer_id, referrer_referral_count
    FROM public.users
    WHERE referral_code = UPPER(TRIM(referral_code_param));

    IF FOUND THEN
      -- Update referred user
      UPDATE public.users
      SET referred_by = referrer_id
      WHERE id = user_id;

      -- Update referrer's count
      UPDATE public.users
      SET referral_count = COALESCE(referrer_referral_count, 0) + 1
      WHERE id = referrer_id;
    END IF;
  END IF;

  -- Create 2FA record (disabled by default)
  INSERT INTO public.user_2fa (user_id, is_enabled, secret)
  VALUES (user_id, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;

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
    user_id,
    CURRENT_DATE,
    100000.00000000,
    100000.00000000,
    0.00000000,
    COALESCE((SELECT price FROM public.market_data WHERE symbol = 'BTCUSDT' ORDER BY timestamp DESC LIMIT 1), 0)
  ON CONFLICT (user_id, snapshot_date) DO NOTHING;

  RETURN json_build_object('success', true, 'message', 'User initialized successfully');
  
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.initialize_new_user(text) TO authenticated;
