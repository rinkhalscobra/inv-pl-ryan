/*
  # Add tickets_processed flag to transactions

  1. Changes
    - Add `tickets_processed` boolean column to transactions table
    - Default to false for new transactions
    - Set existing transactions to false

  2. Purpose
    - Track which deposits have had giveaway tickets distributed
    - Enable batch processing of deposits via cron job
    - Prevent duplicate ticket distribution
*/

-- Add tickets_processed column to transactions table
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS tickets_processed boolean DEFAULT false;

-- Set all existing transactions to false (unprocessed)
UPDATE transactions 
SET tickets_processed = false 
WHERE tickets_processed IS NULL;

-- Create index for faster queries on unprocessed deposits
CREATE INDEX IF NOT EXISTS idx_transactions_tickets_processed 
ON transactions(tickets_processed, created_at) 
WHERE type = 'deposit' AND tickets_processed = false;