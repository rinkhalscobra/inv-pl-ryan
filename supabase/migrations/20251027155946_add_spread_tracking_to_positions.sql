/*
  # Add Spread Tracking to Futures Positions

  1. Changes to Tables
    - Add `spread_cost` column to `futures_positions` table
    - Add `spread_percentage` column to `futures_positions` table
    - Add `spread_cost` column to `futures_position_history` table
    - Add `spread_percentage` column to `futures_position_history` table
    - Add `spread_cost` column to `futures_orders` table
    - Add `spread_percentage` column to `futures_orders` table

  2. Description
    - Track the spread cost applied to each position at entry
    - Store both the absolute spread cost and the percentage used
    - Include spread information in position history for reporting
    - Track spread costs in pending orders
*/

-- Add spread tracking columns to futures_positions
ALTER TABLE futures_positions 
ADD COLUMN IF NOT EXISTS spread_cost numeric(20, 8) DEFAULT 0,
ADD COLUMN IF NOT EXISTS spread_percentage numeric(10, 6) DEFAULT 0;

-- Add spread tracking columns to futures_position_history
ALTER TABLE futures_position_history 
ADD COLUMN IF NOT EXISTS spread_cost numeric(20, 8) DEFAULT 0,
ADD COLUMN IF NOT EXISTS spread_percentage numeric(10, 6) DEFAULT 0;

-- Add spread tracking columns to futures_orders
ALTER TABLE futures_orders 
ADD COLUMN IF NOT EXISTS spread_cost numeric(20, 8) DEFAULT 0,
ADD COLUMN IF NOT EXISTS spread_percentage numeric(10, 6) DEFAULT 0;

-- Create index for spread cost queries
CREATE INDEX IF NOT EXISTS idx_futures_positions_spread_cost ON futures_positions(spread_cost);
CREATE INDEX IF NOT EXISTS idx_futures_position_history_spread_cost ON futures_position_history(spread_cost);
