/*
  # Add reserved margin columns to orders tables

  1. New Columns
    - `futures_orders.reserved_margin` (numeric(20,8), default 0)
    - `prop_orders.reserved_margin` (numeric(20,8), default 0)
  
  2. Purpose
    - Track margin reserved for open orders
    - Enable proper available balance calculations
    - Align with real trading platform behavior
*/

-- Add reserved_margin column to futures_orders table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'futures_orders' AND column_name = 'reserved_margin'
  ) THEN
    ALTER TABLE futures_orders ADD COLUMN reserved_margin numeric(20,8) DEFAULT 0;
  END IF;
END $$;

-- Add reserved_margin column to prop_orders table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prop_orders' AND column_name = 'reserved_margin'
  ) THEN
    ALTER TABLE prop_orders ADD COLUMN reserved_margin numeric(20,8) DEFAULT 0;
  END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_futures_orders_reserved_margin ON futures_orders(reserved_margin) WHERE reserved_margin > 0;
CREATE INDEX IF NOT EXISTS idx_prop_orders_reserved_margin ON prop_orders(reserved_margin) WHERE reserved_margin > 0;