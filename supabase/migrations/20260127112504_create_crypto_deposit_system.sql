/*
  # Create Self-Custody Crypto Deposit System

  1. New Tables
    - `crypto_deposit_addresses`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `chain` (text) - blockchain identifier (btc, ltc, doge)
      - `address` (text) - the deposit address
      - `derivation_index` (integer) - HD wallet derivation index
      - `created_at` (timestamptz)
    
    - `crypto_deposits`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `chain` (text) - blockchain identifier
      - `txid` (text) - transaction hash
      - `vout` (integer) - output index in transaction
      - `amount_satoshis` (bigint) - amount in smallest unit
      - `amount_display` (numeric) - human readable amount (BTC)
      - `confirmations` (integer) - current confirmation count
      - `required_confirmations` (integer) - confirmations needed
      - `status` (text) - pending, confirming, confirmed
      - `credited` (boolean) - whether balance was credited
      - `credited_at` (timestamptz) - when balance was credited
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Users can only read their own addresses and deposits
    - No direct inserts/updates from client (handled by edge functions)

  3. Functions
    - `credit_btc_deposit` - atomically credit a confirmed deposit
*/

-- Create crypto_deposit_addresses table
CREATE TABLE IF NOT EXISTS crypto_deposit_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chain text NOT NULL,
  address text NOT NULL,
  derivation_index integer,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, chain),
  UNIQUE(chain, address)
);

-- Create crypto_deposits table
CREATE TABLE IF NOT EXISTS crypto_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chain text NOT NULL,
  txid text NOT NULL,
  vout integer NOT NULL DEFAULT 0,
  amount_satoshis bigint NOT NULL,
  amount_display numeric(20, 8) NOT NULL,
  confirmations integer DEFAULT 0,
  required_confirmations integer DEFAULT 3,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'confirming', 'confirmed')),
  credited boolean DEFAULT false,
  credited_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(chain, txid, vout)
);

-- Enable RLS
ALTER TABLE crypto_deposit_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_deposits ENABLE ROW LEVEL SECURITY;

-- RLS Policies for crypto_deposit_addresses
CREATE POLICY "Users can view own deposit addresses"
  ON crypto_deposit_addresses
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for crypto_deposits
CREATE POLICY "Users can view own deposits"
  ON crypto_deposits
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_crypto_deposit_addresses_user_chain 
  ON crypto_deposit_addresses(user_id, chain);

CREATE INDEX IF NOT EXISTS idx_crypto_deposits_user 
  ON crypto_deposits(user_id);

CREATE INDEX IF NOT EXISTS idx_crypto_deposits_status 
  ON crypto_deposits(status) WHERE credited = false;

CREATE INDEX IF NOT EXISTS idx_crypto_deposits_address_lookup
  ON crypto_deposits(chain, txid);

-- Function to credit a BTC deposit (called by backend)
CREATE OR REPLACE FUNCTION credit_crypto_deposit(
  p_deposit_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deposit crypto_deposits%ROWTYPE;
  v_user_id uuid;
  v_amount numeric;
  v_chain text;
BEGIN
  -- Get the deposit and lock the row
  SELECT * INTO v_deposit
  FROM crypto_deposits
  WHERE id = p_deposit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Deposit not found');
  END IF;

  IF v_deposit.credited THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already credited');
  END IF;

  IF v_deposit.confirmations < v_deposit.required_confirmations THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient confirmations');
  END IF;

  v_user_id := v_deposit.user_id;
  v_amount := v_deposit.amount_display;
  v_chain := v_deposit.chain;

  -- Credit the user's balance (BTC goes to BTC balance)
  IF v_chain = 'btc' THEN
    UPDATE user_balances
    SET btc_balance = btc_balance + v_amount,
        updated_at = now()
    WHERE user_id = v_user_id;
  END IF;

  -- Mark deposit as credited
  UPDATE crypto_deposits
  SET credited = true,
      credited_at = now(),
      status = 'confirmed',
      updated_at = now()
  WHERE id = p_deposit_id;

  -- Create a transaction record
  INSERT INTO transactions (user_id, type, amount, status, description)
  VALUES (
    v_user_id,
    'deposit',
    v_amount,
    'completed',
    'BTC deposit: ' || v_deposit.txid
  );

  RETURN jsonb_build_object(
    'success', true,
    'amount', v_amount,
    'chain', v_chain,
    'txid', v_deposit.txid
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION credit_crypto_deposit(uuid) TO service_role;
