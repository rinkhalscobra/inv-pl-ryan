/*
  # Add Pending Status to Giveaway Campaigns

  1. Changes
    - Modify giveaway_campaigns status constraint to include 'pending'
    - Allows campaigns to be created with 'pending' status for upcoming giveaways

  2. Security
    - No RLS changes needed
*/

-- Drop the existing constraint
ALTER TABLE giveaway_campaigns 
DROP CONSTRAINT IF EXISTS giveaway_campaigns_status_check;

-- Add the new constraint with 'pending' included
ALTER TABLE giveaway_campaigns
ADD CONSTRAINT giveaway_campaigns_status_check 
CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'completed'::text, 'cancelled'::text]));
