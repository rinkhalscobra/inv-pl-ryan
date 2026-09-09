/*
  # Create Referral Earnings Table and Function

  1. New Tables
    - `referral_earnings`
      - `id` (uuid, primary key)
      - `referrer_id` (uuid, references users) - User who gets the commission
      - `referred_user_id` (uuid, references users) - User who generated the PnL
      - `position_id` (uuid) - The position that generated the commission
      - `commission_amount` (numeric) - Amount of commission earned (1% of PnL)
      - `position_pnl` (numeric) - Original position PnL
      - `position_symbol` (text) - Trading pair symbol
      - `position_side` (text) - Position side (long/short)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on referral_earnings table
    - Users can only view their own referral earnings

  3. Indexes
    - Index on referrer_id for fast lookups
    - Index on referred_user_id for tracking
    - Index on created_at for time-based queries
*/

-- Create referral_earnings table
CREATE TABLE IF NOT EXISTS referral_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  referred_user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  position_id uuid NOT NULL,
  commission_amount numeric(20,8) NOT NULL,
  position_pnl numeric(20,8) NOT NULL,
  position_symbol text NOT NULL,
  position_side text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE referral_earnings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for referral_earnings
DROP POLICY IF EXISTS "Users can view own referral earnings" ON referral_earnings;
CREATE POLICY "Users can view own referral earnings"
  ON referral_earnings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = referrer_id);

DROP POLICY IF EXISTS "Service role can manage all referral earnings" ON referral_earnings;
CREATE POLICY "Service role can manage all referral earnings"
  ON referral_earnings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_referral_earnings_referrer_id ON referral_earnings(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_earnings_referred_user_id ON referral_earnings(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_referral_earnings_created_at ON referral_earnings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_earnings_position_id ON referral_earnings(position_id);

-- Create function to process referral commission
CREATE OR REPLACE FUNCTION process_referral_commission(
  p_referred_user_id uuid,
  p_position_id uuid,
  p_position_pnl numeric,
  p_position_symbol text,
  p_position_side text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_referrer_id uuid;
  v_commission_rate numeric(4,4);
  v_commission_amount numeric(20,8);
BEGIN
  -- Only process commission for winning positions (positive PnL)
  IF p_position_pnl <= 0 THEN
    RETURN;
  END IF;

  -- Get the referrer information
  SELECT referred_by, COALESCE(referral_commission_rate, 0.01)
  INTO v_referrer_id, v_commission_rate
  FROM users
  WHERE id = p_referred_user_id;

  -- Check if user has a referrer
  IF v_referrer_id IS NULL THEN
    RETURN;
  END IF;

  -- Calculate commission (default 1% of winning PnL)
  v_commission_amount := p_position_pnl * v_commission_rate;

  -- Ensure commission is positive
  IF v_commission_amount <= 0 THEN
    RETURN;
  END IF;

  -- Add commission to referrer's balance
  UPDATE balances
  SET usdt_balance = usdt_balance + v_commission_amount,
      updated_at = now()
  WHERE user_id = v_referrer_id;

  -- Update referrer's total earnings
  UPDATE users
  SET total_referral_earnings = COALESCE(total_referral_earnings, 0) + v_commission_amount,
      updated_at = now()
  WHERE id = v_referrer_id;

  -- Record the referral earning
  INSERT INTO referral_earnings (
    referrer_id,
    referred_user_id,
    position_id,
    commission_amount,
    position_pnl,
    position_symbol,
    position_side
  ) VALUES (
    v_referrer_id,
    p_referred_user_id,
    p_position_id,
    v_commission_amount,
    p_position_pnl,
    p_position_symbol,
    p_position_side
  );

  -- Add transaction record for the referrer
  INSERT INTO transactions (
    user_id,
    type,
    amount,
    description,
    status
  ) VALUES (
    v_referrer_id,
    'trade',
    v_commission_amount,
    'Referral commission from ' || p_position_symbol || ' ' || p_position_side || ' position (+' || ROUND(p_position_pnl::numeric, 2) || ' USDT PnL)',
    'completed'
  );

  -- Log the commission payment if system_logs table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_logs') THEN
    INSERT INTO system_logs (action, details)
    VALUES (
      'referral_commission_paid',
      format(
        'Referrer: %s, Referred User: %s, Position: %s, PnL: %s, Commission: %s',
        v_referrer_id,
        p_referred_user_id,
        p_position_id,
        p_position_pnl,
        v_commission_amount
      )
    );
  END IF;
END;
$$;
