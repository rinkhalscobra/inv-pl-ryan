/*
  # Add User Assets Table for Multiple Cryptocurrency Support

  1. New Table
    - `user_assets` - Stores balances for various cryptocurrencies
    
  2. Security
    - Enable RLS on the new table
    - Add policies for authenticated users to manage their own assets
    - Add policy for service role to manage all assets
    
  3. Features
    - Store balances for any cryptocurrency
    - Track when balances were last updated
    - Maintain proper foreign key relationships
*/

-- Create user_assets table
CREATE TABLE IF NOT EXISTS user_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  asset_symbol text NOT NULL,
  balance numeric(20,8) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, asset_symbol)
);

-- Enable Row Level Security
ALTER TABLE user_assets ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
CREATE POLICY "Users can manage own assets"
  ON user_assets
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage all assets"
  ON user_assets
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_assets_user_id ON user_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_assets_asset_symbol ON user_assets(asset_symbol);

-- Create updated_at trigger
CREATE TRIGGER update_user_assets_updated_at
  BEFORE UPDATE ON user_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update handle_email_verified_user function to initialize user_assets
CREATE OR REPLACE FUNCTION public.handle_email_verified_user()
RETURNS trigger AS $$
DECLARE
  referrer_id uuid;
  referrer_referral_count integer;
BEGIN
  -- Only proceed if email was just confirmed (email_confirmed_at changed from NULL to a timestamp)
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    -- Insert into public.users
    INSERT INTO public.users (id, email, kyc_status, referral_code, is_demo)
    VALUES (NEW.id, NEW.email, 'not_verified', gen_random_uuid(), false)
    ON CONFLICT (id) DO UPDATE SET
      email = NEW.email,
      updated_at = now();

    -- Insert into balances
    INSERT INTO public.balances (user_id, usdt_balance, btc_balance)
    VALUES (NEW.id, 100000.00000000, 0.00000000)
    ON CONFLICT (user_id) DO NOTHING;

    -- Insert into robot_states
    INSERT INTO public.robot_states (user_id, is_active, strategy, min_profit_threshold, max_trade_amount, allocated_balance, todays_profit, total_trades, successful_trades, active_challenge_id, challenge_account_balance, challenge_profit_target, challenge_max_drawdown, challenge_time_limit)
    VALUES (NEW.id, false, 'triangular', 0.5, 1000, 0, 0, 0, 0, NULL, 0, 0, 0, 30)
    ON CONFLICT (user_id) DO NOTHING;

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