/*
  # Add challenge_status column to robot_states table

  1. Changes
    - Add challenge_status column to robot_states table
    - Set default value to 'inactive'
    - Add check constraint to ensure valid status values
    - Update handle_email_verified_user function to initialize with 'inactive'
    
  2. Purpose
    - Enable the UI to correctly display challenge outcomes
    - Ensure consistent status tracking between prop_account_balances and robot_states
    - Fix issue where challenge completion/failure is not reflected in the UI
*/

-- Add challenge_status column to robot_states table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'robot_states' AND column_name = 'challenge_status'
  ) THEN
    ALTER TABLE robot_states ADD COLUMN challenge_status text DEFAULT 'inactive';
    
    -- Add constraint to ensure valid status values
    ALTER TABLE robot_states ADD CONSTRAINT robot_states_challenge_status_check 
    CHECK (challenge_status IN ('active', 'completed', 'failed', 'expired', 'cancelled', 'inactive'));
  END IF;
END $$;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_robot_states_challenge_status ON robot_states(challenge_status);

-- Update handle_email_verified_user function to initialize challenge_status
CREATE OR REPLACE FUNCTION public.handle_email_verified_user()
RETURNS trigger AS $$
DECLARE
  referrer_id uuid;
  referrer_referral_count integer;
BEGIN
  -- Only proceed if email was just confirmed (email_confirmed_at changed from NULL to a timestamp)
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    -- Insert into public.users
    INSERT INTO public.users (id, email, kyc_status, referral_code, is_demo, is_admin)
    VALUES (NEW.id, NEW.email, 'not_verified', gen_random_uuid(), false, false)
    ON CONFLICT (id) DO UPDATE SET
      email = NEW.email,
      updated_at = now();

    -- Insert into balances
    INSERT INTO public.balances (user_id, usdt_balance, btc_balance)
    VALUES (NEW.id, 100000.00000000, 0.00000000)
    ON CONFLICT (user_id) DO NOTHING;

    -- Insert into robot_states with challenge_status
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
      challenge_time_limit,
      challenge_status
    )
    VALUES (
      NEW.id, 
      false, 
      'triangular', 
      0.5, 
      1000, 
      0, 
      0, 
      0, 
      0, 
      NULL, 
      0, 
      0, 
      0, 
      30,
      'inactive'
    )
    ON CONFLICT (user_id) DO NOTHING;

    -- Initialize user_assets with USDT and BTC
    INSERT INTO public.user_assets (user_id, asset_symbol, balance)
    VALUES 
      (NEW.id, 'USDT', 100000.00000000),
      (NEW.id, 'BTC', 0.00000000)
    ON CONFLICT (user_id, asset_symbol) DO NOTHING;

    -- Handle referral logic if referral_code is present in user_metadata
    IF NEW.raw_user_meta_data->>'referral_code' IS NOT NULL THEN
      SELECT id, referral_count INTO referrer_id, referrer_referral_count
      FROM public.users
      WHERE referral_code = NEW.raw_user_meta_data->>'referral_code';

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

    -- Create 2FA record (disabled by default)
    INSERT INTO public.user_2fa (user_id, is_enabled, secret)
    VALUES (NEW.id, false, NULL)
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
      NEW.id,
      CURRENT_DATE,
      100000.00000000,
      100000.00000000,
      0.00000000,
      COALESCE((SELECT price FROM public.market_data WHERE symbol = 'BTCUSDT' ORDER BY timestamp DESC LIMIT 1), 0)
    ON CONFLICT (user_id, snapshot_date) DO NOTHING;

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update initialize_prop_challenge function to set challenge_status to 'active'
CREATE OR REPLACE FUNCTION initialize_prop_challenge(
  p_user_id uuid,
  p_challenge_id text,
  p_starting_balance numeric,
  p_target_profit numeric,
  p_max_drawdown numeric,
  p_duration_days integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account_id uuid;
BEGIN
  -- Check if user already has an active challenge of this type
  IF EXISTS (
    SELECT 1 FROM prop_account_balances
    WHERE user_id = p_user_id
      AND challenge_id = p_challenge_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'User already has an active % challenge', p_challenge_id;
  END IF;
  
  -- Create prop account balance
  INSERT INTO prop_account_balances (
    user_id,
    challenge_id,
    starting_balance,
    current_balance,
    max_balance,
    max_drawdown,
    max_drawdown_reached,
    target_profit,
    start_date,
    end_date,
    status
  ) VALUES (
    p_user_id,
    p_challenge_id,
    p_starting_balance,
    p_starting_balance,
    p_starting_balance,
    p_max_drawdown,
    0,
    p_target_profit,
    now(),
    now() + (p_duration_days || ' days')::interval,
    'active'
  )
  RETURNING id INTO v_account_id;
  
  -- Update robot_states to set challenge_status to 'active'
  UPDATE robot_states
  SET 
    active_challenge_id = p_challenge_id,
    challenge_account_balance = p_starting_balance,
    challenge_profit_target = p_target_profit,
    challenge_max_drawdown = p_max_drawdown,
    challenge_time_limit = p_duration_days,
    challenge_status = 'active'
  WHERE user_id = p_user_id;
  
  -- Log challenge initialization
  INSERT INTO prop_logs (
    user_id,
    challenge_id,
    action,
    details
  ) VALUES (
    p_user_id,
    p_challenge_id,
    'challenge_initialized',
    jsonb_build_object(
      'account_id', v_account_id,
      'starting_balance', p_starting_balance,
      'target_profit', p_target_profit,
      'max_drawdown', p_max_drawdown,
      'duration_days', p_duration_days
    )
  );
  
  RETURN v_account_id;
END;
$$;

-- Update cancel_prop_challenge function to set challenge_status to 'cancelled'
CREATE OR REPLACE FUNCTION cancel_prop_challenge(
  p_user_id uuid,
  p_challenge_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account_balance record;
  position_record record;
BEGIN
  -- Get the challenge account
  SELECT * INTO v_account_balance
  FROM prop_account_balances
  WHERE user_id = p_user_id
    AND challenge_id = p_challenge_id
    AND status = 'active';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active % challenge found for this user', p_challenge_id;
  END IF;
  
  -- Close all open positions
  FOR position_record IN
    SELECT id, current_price
    FROM prop_positions
    WHERE user_id = p_user_id
      AND challenge_id = p_challenge_id
      AND is_open = true
  LOOP
    PERFORM close_prop_position(position_record.id, position_record.current_price);
  END LOOP;
  
  -- Cancel all open orders
  UPDATE prop_orders
  SET status = 'cancelled'
  WHERE user_id = p_user_id
    AND challenge_id = p_challenge_id
    AND status = 'open';
  
  -- Mark challenge as completed
  UPDATE prop_account_balances
  SET 
    status = 'completed',
    updated_at = now()
  WHERE user_id = p_user_id
    AND challenge_id = p_challenge_id;
  
  -- Update robot_states to set challenge_status to 'cancelled'
  UPDATE robot_states
  SET 
    active_challenge_id = null,
    challenge_account_balance = 0,
    challenge_profit_target = 0,
    challenge_max_drawdown = 0,
    challenge_time_limit = null,
    challenge_status = 'cancelled'
  WHERE user_id = p_user_id;
  
  -- Log challenge cancellation
  INSERT INTO prop_logs (
    user_id,
    challenge_id,
    action,
    details
  ) VALUES (
    p_user_id,
    p_challenge_id,
    'challenge_cancelled',
    jsonb_build_object(
      'account_id', v_account_balance.id,
      'starting_balance', v_account_balance.starting_balance,
      'final_balance', v_account_balance.current_balance,
      'profit_loss', v_account_balance.current_balance - v_account_balance.starting_balance,
      'max_drawdown_reached', v_account_balance.max_drawdown_reached
    )
  );
  
  RETURN true;
END;
$$;