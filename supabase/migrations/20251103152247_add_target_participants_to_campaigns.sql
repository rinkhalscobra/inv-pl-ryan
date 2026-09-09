/*
  # Add Target Participants to Giveaway Campaigns

  1. Changes
    - Add target_participants column to giveaway_campaigns table
    - This is used for client-side participant count animation
    - Avoids database bloat while showing realistic participant growth

  2. Security
    - No RLS changes needed
*/

-- Add target_participants column
ALTER TABLE giveaway_campaigns
ADD COLUMN IF NOT EXISTS target_participants INTEGER NOT NULL DEFAULT 0;

-- Update existing campaigns with realistic target numbers based on prize pool
UPDATE giveaway_campaigns
SET target_participants = CASE
  WHEN total_prize_pool >= 200000 THEN 300000 + (RANDOM() * 100000)::INTEGER
  WHEN total_prize_pool >= 100000 THEN 150000 + (RANDOM() * 50000)::INTEGER
  WHEN total_prize_pool >= 50000 THEN 75000 + (RANDOM() * 25000)::INTEGER
  WHEN total_prize_pool >= 10000 THEN 30000 + (RANDOM() * 10000)::INTEGER
  ELSE 10000 + (RANDOM() * 5000)::INTEGER
END
WHERE target_participants = 0;
