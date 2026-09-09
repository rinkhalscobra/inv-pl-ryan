/*
  # Add Wheel Spin Tracking to Transactions

  1. Changes
    - Add `wheel_spun` column to transactions table to track if user has spun the wheel for this deposit
    - Add `wheel_winning_percentage` column to store the percentage won from the spin
    - Add `wheel_winning_amount` column to store the actual bonus amount won
    
  2. Security
    - No RLS changes needed as transactions table already has proper policies
    
  3. Notes
    - Only deposit transactions with status 'completed' are eligible for wheel spins
    - Each deposit grants one wheel spin opportunity
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'wheel_spun'
  ) THEN
    ALTER TABLE transactions ADD COLUMN wheel_spun boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'wheel_winning_percentage'
  ) THEN
    ALTER TABLE transactions ADD COLUMN wheel_winning_percentage integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'wheel_winning_amount'
  ) THEN
    ALTER TABLE transactions ADD COLUMN wheel_winning_amount numeric(20, 8);
  END IF;
END $$;