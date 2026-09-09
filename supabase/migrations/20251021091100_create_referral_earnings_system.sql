/*
  # Referral Earnings System

  1. New Tables
    - `referral_earnings`
      - `id` (uuid, primary key)
      - `referrer_id` (uuid, references users) - User who gets the commission
      - `referred_user_id` (uuid, references users) - User who generated the PnL
      - `position_id` (uuid) - The position that generated the commission
      - `commission_amount` (numeric) - Amount of commission earned (1% of PnL)
      - `position_pnl` (numeric) - Original position PnL
      - `position_symbol` (text) - Trading pair symbol
      - `created_at` (timestamptz)

  2. Schema Updates
    - Add `total_referral_earnings` column to users table
    - Add `referral_commission_rate` column to users table (default 0.01 = 1%)

  3. Security
    - Enable RLS on referral_earnings table
    - Users can only view their own referral earnings
    - Add policies for referrer access

  4. Indexes
    - Index on referrer_id for fast lookups
    - Index on referred_user_id for tracking
    - Index on created_at for time-based queries
*/

-- Add referral earnings columns to users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'total_referral_earnings'
  ) THEN
    ALTER TABLE users ADD COLUMN total_referral_earnings numeric(20,8) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'referral_commission_rate'
  ) THEN
    ALTER TABLE users ADD COLUMN referral_commission_rate numeric(4,4) DEFAULT 0.01;
  END IF;
END $$;

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
  SELECT referred_by, referral_commission_rate
  INTO v_referrer_id, v_commission_rate
  FROM users
  WHERE id = p_referred_user_id;

  -- Check if user has a referrer
  IF v_referrer_id IS NULL THEN
    RETURN;
  END IF;

  -- Calculate commission (default 1% of winning PnL)
  v_commission_rate := COALESCE(v_commission_rate, 0.01);
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

  -- Log the commission payment
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
END;
$$;

-- Update close_futures_position to include referral commission
DROP FUNCTION IF EXISTS close_futures_position(uuid, numeric);

CREATE OR REPLACE FUNCTION close_futures_position(
  position_id uuid,
  exit_price numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  position_rec record;
  pnl numeric(20,8);
  roi numeric(10,4);
  total_return numeric(20,8);
BEGIN
  -- Get position details
  SELECT * INTO position_rec
  FROM futures_positions
  WHERE id = position_id AND is_open = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Position not found or already closed';
  END IF;

  -- Calculate PnL based on position side
  IF position_rec.side = 'long' THEN
    pnl := (exit_price - position_rec.entry_price) * position_rec.amount * position_rec.leverage;
  ELSE
    pnl := (position_rec.entry_price - exit_price) * position_rec.amount * position_rec.leverage;
  END IF;

  -- Calculate ROI
  IF position_rec.margin > 0 THEN
    roi := (pnl / position_rec.margin) * 100;
  ELSE
    roi := 0;
  END IF;

  -- Calculate total return (margin + PnL)
  total_return := position_rec.margin + pnl;

  -- Record position in history
  INSERT INTO futures_position_history (
    user_id,
    symbol,
    side,
    entry_price,
    exit_price,
    amount,
    leverage,
    margin,
    pnl,
    roi,
    open_time,
    close_time,
    duration_seconds
  ) VALUES (
    position_rec.user_id,
    position_rec.symbol,
    position_rec.side,
    position_rec.entry_price,
    exit_price,
    position_rec.amount,
    position_rec.leverage,
    position_rec.margin,
    pnl,
    roi,
    position_rec.created_at,
    now(),
    EXTRACT(EPOCH FROM (now() - position_rec.created_at))::integer
  );

  -- Return margin + PnL to user's balance
  UPDATE balances
  SET usdt_balance = usdt_balance + total_return,
      updated_at = now()
  WHERE user_id = position_rec.user_id;

  -- Mark position as closed
  UPDATE futures_positions
  SET is_open = false,
      updated_at = now()
  WHERE id = position_id;

  -- Add transaction record
  INSERT INTO transactions (
    user_id,
    type,
    amount,
    description,
    status
  ) VALUES (
    position_rec.user_id,
    'trade',
    pnl,
    'Closed ' || position_rec.side || ' position for ' || position_rec.symbol ||
      ' at ' || exit_price || ' (' ||
      CASE WHEN pnl >= 0 THEN 'profit' ELSE 'loss' END ||
      ' of ' || ABS(pnl) || ' USDT)',
    'completed'
  );

  -- Process referral commission if this was a winning position
  IF pnl > 0 THEN
    PERFORM process_referral_commission(
      position_rec.user_id,
      position_id,
      pnl,
      position_rec.symbol,
      position_rec.side
    );
  END IF;
END;
$$;
