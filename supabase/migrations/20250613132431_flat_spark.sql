/*
  # Add leverage support to event bets

  1. Schema Updates
    - Add leverage column to event_bets table
    - Set default leverage to 1 for existing bets

  2. Data Integrity
    - Ensure leverage is always a positive integer
    - Add constraint to limit maximum leverage
*/

-- Add leverage column to event_bets table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_bets' AND column_name = 'leverage'
  ) THEN
    ALTER TABLE event_bets ADD COLUMN leverage integer DEFAULT 1 CHECK (leverage >= 1 AND leverage <= 10);
  END IF;
END $$;

-- Update existing bets to have default leverage of 1
UPDATE event_bets SET leverage = 1 WHERE leverage IS NULL;

-- Add index for leverage queries
CREATE INDEX IF NOT EXISTS idx_event_bets_leverage ON event_bets(leverage) WHERE leverage > 1;