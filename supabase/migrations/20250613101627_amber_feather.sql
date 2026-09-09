/*
  # Add Polymarket Integration Fields

  1. Schema Updates
    - Add polymarket_id column to events table for syncing with Polymarket API
    - Add volume column to events table for market volume data
    - Add polymarket_id column to event_outcomes table for outcome syncing
    - Add unique constraints to prevent duplicate Polymarket entries

  2. Data Integrity
    - Ensure proper indexing for performance
    - Maintain foreign key relationships
    - Add constraints for data validation
*/

-- Add polymarket_id and volume to events table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'polymarket_id'
  ) THEN
    ALTER TABLE events ADD COLUMN polymarket_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'volume'
  ) THEN
    ALTER TABLE events ADD COLUMN volume numeric(20,8) DEFAULT 0;
  END IF;
END $$;

-- Add polymarket_id to event_outcomes table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_outcomes' AND column_name = 'polymarket_id'
  ) THEN
    ALTER TABLE event_outcomes ADD COLUMN polymarket_id text;
  END IF;
END $$;

-- Add unique constraints for polymarket_id fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'events_polymarket_id_key' 
    AND table_name = 'events'
  ) THEN
    ALTER TABLE events ADD CONSTRAINT events_polymarket_id_key UNIQUE (polymarket_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'event_outcomes_polymarket_id_key' 
    AND table_name = 'event_outcomes'
  ) THEN
    ALTER TABLE event_outcomes ADD CONSTRAINT event_outcomes_polymarket_id_key UNIQUE (polymarket_id);
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_polymarket_id ON events(polymarket_id) WHERE polymarket_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_outcomes_polymarket_id ON event_outcomes(polymarket_id) WHERE polymarket_id IS NOT NULL;

-- Update sample events with polymarket_id and volume
UPDATE events SET 
  polymarket_id = 'pm_' || id::text,
  volume = CASE 
    WHEN question LIKE '%Bitcoin%' THEN 2500000
    WHEN question LIKE '%Federal Reserve%' THEN 1800000
    WHEN question LIKE '%Tesla%' THEN 950000
    WHEN question LIKE '%recession%' THEN 3200000
    WHEN question LIKE '%Ethereum%' THEN 1400000
    ELSE 1000000
  END
WHERE polymarket_id IS NULL;

-- Update sample outcomes with polymarket_id
UPDATE event_outcomes SET 
  polymarket_id = 'pm_outcome_' || id::text
WHERE polymarket_id IS NULL;