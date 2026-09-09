/*
  # Create Sandbox Payment System

  ## Overview
  This migration creates the complete database infrastructure for a sandbox payment gateway system
  that simulates the GaliaPay payment API for testing purposes.

  ## New Tables
  
  ### `sandbox_payment_transactions`
  Stores all sandbox payment transaction records with complete customer and payment details
  - `id` (uuid, primary key) - Internal database ID
  - `transaction_uuid` (uuid, unique) - External transaction UUID exposed to API
  - `user_id` (uuid, foreign key) - Links to auth.users
  - `reference_no` (text) - Merchant's unique reference number
  - `amount` (bigint) - Payment amount in cents (e.g., 5000 = $50.00)
  - `currency` (text) - Three-letter ISO 4217 currency code
  - `status` (text) - Transaction status: PENDING, WAITING, APPROVED, DECLINED, ERROR
  - `payment_method` (text) - Payment method: 'card', 'hosted', null
  - `card_number_masked` (text) - Masked card number (e.g., 401288******1881)
  - `return_url` (text) - URL to redirect customer after payment
  - `redirect_url` (text) - Checkout or 3DS redirect URL
  - `requires_3ds` (boolean) - Whether 3D Secure authentication is required
  - `billing_info` (jsonb) - Complete billing address and contact information
  - `shipping_info` (jsonb) - Complete shipping address and contact information
  - `customer_email` (text) - Customer email for notifications
  - `customer_ip` (text) - Customer IP address
  - `customer_birthday` (text) - Customer date of birth
  - `webhook_url` (text) - URL to send IPN notifications
  - `webhook_delivered` (boolean) - Whether webhook was successfully delivered
  - `webhook_attempts` (integer) - Number of webhook delivery attempts
  - `webhook_last_attempt` (timestamptz) - Timestamp of last webhook attempt
  - `error_message` (text) - Error message if transaction failed
  - `created_at` (timestamptz) - Transaction creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp
  
  ### `sandbox_allowed_cards`
  Stores whitelisted card BIN ranges for merchants
  - `id` (uuid, primary key) - Internal database ID
  - `user_id` (uuid, foreign key) - Links to auth.users (merchant)
  - `first_six` (text) - First 6 digits of card number (BIN)
  - `last_four` (text) - Last 4 digits of card number
  - `created_at` (timestamptz) - Record creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### `sandbox_webhook_logs`
  Tracks all webhook delivery attempts for debugging
  - `id` (uuid, primary key) - Internal database ID
  - `transaction_id` (uuid, foreign key) - Links to sandbox_payment_transactions
  - `webhook_url` (text) - Target webhook URL
  - `payload` (jsonb) - Complete webhook payload sent
  - `signature` (text) - HMAC-SHA256 signature
  - `request_id` (uuid) - Unique request ID (UUID v7)
  - `timestamp` (bigint) - Unix timestamp
  - `response_status` (integer) - HTTP response status code
  - `response_body` (text) - Response body from webhook endpoint
  - `delivered` (boolean) - Whether delivery was successful
  - `created_at` (timestamptz) - Log creation timestamp

  ## Security
  - Enable RLS on all tables
  - Users can only access their own sandbox transactions and cards
  - Webhook logs are only accessible to transaction owner

  ## Indexes
  - Index on transaction_uuid for fast lookups
  - Index on reference_no for merchant queries
  - Index on user_id for filtering user transactions
  - Index on status for status-based queries
  - Composite index on (first_six, last_four) for card lookups
*/

-- Create sandbox_payment_transactions table
CREATE TABLE IF NOT EXISTS sandbox_payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_uuid uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  reference_no text NOT NULL,
  amount bigint NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'PENDING',
  payment_method text,
  card_number_masked text,
  return_url text NOT NULL,
  redirect_url text,
  requires_3ds boolean DEFAULT false,
  billing_info jsonb NOT NULL DEFAULT '{}',
  shipping_info jsonb DEFAULT '{}',
  customer_email text NOT NULL,
  customer_ip text,
  customer_birthday text,
  webhook_url text,
  webhook_delivered boolean DEFAULT false,
  webhook_attempts integer DEFAULT 0,
  webhook_last_attempt timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create sandbox_allowed_cards table
CREATE TABLE IF NOT EXISTS sandbox_allowed_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  first_six text NOT NULL,
  last_four text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, first_six, last_four)
);

-- Create sandbox_webhook_logs table
CREATE TABLE IF NOT EXISTS sandbox_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES sandbox_payment_transactions(id) ON DELETE CASCADE,
  webhook_url text NOT NULL,
  payload jsonb NOT NULL,
  signature text NOT NULL,
  request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  timestamp bigint NOT NULL,
  response_status integer,
  response_body text,
  delivered boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sandbox_transactions_uuid ON sandbox_payment_transactions(transaction_uuid);
CREATE INDEX IF NOT EXISTS idx_sandbox_transactions_reference ON sandbox_payment_transactions(reference_no);
CREATE INDEX IF NOT EXISTS idx_sandbox_transactions_user ON sandbox_payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_sandbox_transactions_status ON sandbox_payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_sandbox_allowed_cards_user ON sandbox_allowed_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_sandbox_allowed_cards_bins ON sandbox_allowed_cards(first_six, last_four);
CREATE INDEX IF NOT EXISTS idx_sandbox_webhook_logs_transaction ON sandbox_webhook_logs(transaction_id);

-- Enable Row Level Security
ALTER TABLE sandbox_payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sandbox_allowed_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE sandbox_webhook_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sandbox_payment_transactions
CREATE POLICY "Users can view own sandbox transactions"
  ON sandbox_payment_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own sandbox transactions"
  ON sandbox_payment_transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sandbox transactions"
  ON sandbox_payment_transactions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for sandbox_allowed_cards
CREATE POLICY "Users can view own allowed cards"
  ON sandbox_allowed_cards FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add allowed cards"
  ON sandbox_allowed_cards FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own allowed cards"
  ON sandbox_allowed_cards FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for sandbox_webhook_logs
CREATE POLICY "Users can view webhook logs for own transactions"
  ON sandbox_webhook_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sandbox_payment_transactions
      WHERE sandbox_payment_transactions.id = sandbox_webhook_logs.transaction_id
      AND sandbox_payment_transactions.user_id = auth.uid()
    )
  );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_sandbox_transaction_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update timestamp on sandbox_payment_transactions
CREATE TRIGGER update_sandbox_transaction_timestamp
  BEFORE UPDATE ON sandbox_payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_sandbox_transaction_timestamp();

-- Trigger to update timestamp on sandbox_allowed_cards
CREATE TRIGGER update_sandbox_allowed_cards_timestamp
  BEFORE UPDATE ON sandbox_allowed_cards
  FOR EACH ROW
  EXECUTE FUNCTION update_sandbox_transaction_timestamp();
