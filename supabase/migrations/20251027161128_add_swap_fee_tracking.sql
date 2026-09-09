/*
  # Add Daily Swap Fee Tracking System

  1. New Tables
    - `position_swap_charges` - Daily log of swap fees applied to positions
      - `id` (uuid, primary key)
      - `position_id` (uuid, references futures_positions)
      - `user_id` (uuid, references users)
      - `symbol` (text)
      - `swap_amount` (numeric) - Daily swap cost charged
      - `position_size` (numeric) - Position size at time of swap
      - `leverage` (integer) - Position leverage
      - `swap_rate` (numeric) - Daily swap rate applied
      - `charge_date` (date) - Date swap was charged
      - `created_at` (timestamptz)

  2. Changes to Existing Tables
    - Add `accumulated_swap_cost` column to `futures_positions`
    - Add `accumulated_swap_cost` column to `futures_position_history`
    - Add `last_swap_charge_date` column to `futures_positions`
    - Add `total_swap_days` column to `futures_position_history`

  3. Security
    - Enable RLS on `position_swap_charges` table
    - Add policies for authenticated users to read their own swap charges
    - Only service role can insert swap charges (via edge function)

  4. Indexes
    - Index on position_id for fast lookup
    - Index on user_id for user-specific queries
    - Index on charge_date for date-based queries
    - Composite index on user_id and charge_date for dashboard queries

  5. Important Notes
    - Swap fees represent overnight financing costs
    - Applied daily at midnight UTC for positions held overnight
    - Rates are based on instrument type (crypto, forex, commodities, etc.)
    - Accumulated swap costs are deducted from final PnL when position closes
*/

-- Add swap tracking columns to futures_positions
ALTER TABLE futures_positions 
ADD COLUMN IF NOT EXISTS accumulated_swap_cost numeric(20, 8) DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_swap_charge_date date DEFAULT NULL;

-- Add swap tracking columns to futures_position_history
ALTER TABLE futures_position_history 
ADD COLUMN IF NOT EXISTS accumulated_swap_cost numeric(20, 8) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_swap_days integer DEFAULT 0;

-- Create position_swap_charges table
CREATE TABLE IF NOT EXISTS position_swap_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  swap_amount numeric(20, 8) NOT NULL,
  position_size numeric(20, 8) NOT NULL,
  leverage integer NOT NULL,
  swap_rate numeric(10, 6) NOT NULL,
  charge_date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on position_swap_charges
ALTER TABLE position_swap_charges ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for position_swap_charges
CREATE POLICY "Users can read own swap charges"
  ON position_swap_charges
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert swap charges"
  ON position_swap_charges
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can manage all swap charges"
  ON position_swap_charges
  FOR ALL
  TO service_role
  USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_position_swap_charges_position_id ON position_swap_charges(position_id);
CREATE INDEX IF NOT EXISTS idx_position_swap_charges_user_id ON position_swap_charges(user_id);
CREATE INDEX IF NOT EXISTS idx_position_swap_charges_charge_date ON position_swap_charges(charge_date DESC);
CREATE INDEX IF NOT EXISTS idx_position_swap_charges_user_date ON position_swap_charges(user_id, charge_date DESC);
CREATE INDEX IF NOT EXISTS idx_futures_positions_last_swap_date ON futures_positions(last_swap_charge_date);

-- Create helper function to calculate position holding days
CREATE OR REPLACE FUNCTION get_position_holding_days(position_created_at timestamptz)
RETURNS integer AS $$
BEGIN
  RETURN EXTRACT(DAY FROM (now() - position_created_at))::integer;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_position_holding_days(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION get_position_holding_days(timestamptz) TO service_role;
