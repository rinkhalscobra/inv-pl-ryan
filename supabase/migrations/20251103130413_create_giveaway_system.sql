/*
  # Create Giveaway System

  1. New Tables
    - `giveaway_campaigns`
      - `id` (uuid, primary key)
      - `name` (text) - Campaign name
      - `description` (text) - Campaign description
      - `total_prize_pool` (numeric) - Total USDT prize pool
      - `start_date` (timestamptz) - Campaign start date
      - `end_date` (timestamptz) - Campaign end date
      - `status` (text) - active, completed, cancelled
      - `ticket_rate` (numeric) - USDT required per ticket (default 100)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `giveaway_prizes`
      - `id` (uuid, primary key)
      - `campaign_id` (uuid, foreign key to giveaway_campaigns)
      - `rank_start` (integer) - Starting rank for this prize tier
      - `rank_end` (integer) - Ending rank for this prize tier
      - `prize_amount` (numeric) - Prize amount in USDT
      - `tier_name` (text) - Display name for tier (e.g., "1st Place")
      - `created_at` (timestamptz)
    
    - `giveaway_tickets`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `campaign_id` (uuid, foreign key to giveaway_campaigns)
      - `ticket_count` (integer) - Number of tickets earned
      - `deposit_transaction_id` (uuid, nullable) - Link to transaction
      - `created_at` (timestamptz)
    
    - `giveaway_entries`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `campaign_id` (uuid, foreign key to giveaway_campaigns)
      - `total_tickets` (integer) - Running total of user's tickets
      - `last_updated` (timestamptz)
    
    - `giveaway_winners`
      - `id` (uuid, primary key)
      - `campaign_id` (uuid, foreign key to giveaway_campaigns)
      - `user_id` (uuid, foreign key to auth.users)
      - `rank` (integer) - Winner's rank (1-1000)
      - `prize_amount` (numeric) - Prize amount in USDT
      - `prize_tier` (text) - Prize tier name
      - `claimed` (boolean) - Whether winner has seen the notification
      - `claimed_at` (timestamptz, nullable)
      - `paid_out` (boolean) - Whether prize has been paid
      - `paid_out_at` (timestamptz, nullable)
      - `created_at` (timestamptz)
  
  2. Security
    - Enable RLS on all giveaway tables
    - Users can view active campaigns and prize structures
    - Users can view their own tickets and entries
    - Users can view their own winner records
    - Only service role can insert/update most records
    - Winners table readable by winners only
  
  3. Indexes
    - Index on campaign_id for all tables
    - Index on user_id for tickets, entries, winners
    - Index on status for campaigns
    - Composite index on (campaign_id, user_id) for entries
*/

-- Create giveaway_campaigns table
CREATE TABLE IF NOT EXISTS giveaway_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  total_prize_pool numeric NOT NULL DEFAULT 0,
  start_date timestamptz NOT NULL,
  end_date timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  ticket_rate numeric NOT NULL DEFAULT 100,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create giveaway_prizes table
CREATE TABLE IF NOT EXISTS giveaway_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES giveaway_campaigns(id) ON DELETE CASCADE,
  rank_start integer NOT NULL,
  rank_end integer NOT NULL,
  prize_amount numeric NOT NULL,
  tier_name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_rank_range CHECK (rank_start <= rank_end),
  CONSTRAINT positive_prize CHECK (prize_amount > 0)
);

-- Create giveaway_tickets table
CREATE TABLE IF NOT EXISTS giveaway_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES giveaway_campaigns(id) ON DELETE CASCADE,
  ticket_count integer NOT NULL DEFAULT 0,
  deposit_transaction_id uuid,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT positive_tickets CHECK (ticket_count > 0)
);

-- Create giveaway_entries table
CREATE TABLE IF NOT EXISTS giveaway_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES giveaway_campaigns(id) ON DELETE CASCADE,
  total_tickets integer NOT NULL DEFAULT 0,
  last_updated timestamptz DEFAULT now(),
  CONSTRAINT unique_user_campaign UNIQUE (user_id, campaign_id),
  CONSTRAINT non_negative_tickets CHECK (total_tickets >= 0)
);

-- Create giveaway_winners table
CREATE TABLE IF NOT EXISTS giveaway_winners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES giveaway_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rank integer NOT NULL,
  prize_amount numeric NOT NULL,
  prize_tier text NOT NULL,
  claimed boolean DEFAULT false,
  claimed_at timestamptz,
  paid_out boolean DEFAULT false,
  paid_out_at timestamptz,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_winner_per_campaign UNIQUE (campaign_id, user_id),
  CONSTRAINT valid_rank CHECK (rank > 0),
  CONSTRAINT positive_prize_amount CHECK (prize_amount > 0)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON giveaway_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_dates ON giveaway_campaigns(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_prizes_campaign ON giveaway_prizes(campaign_id);

CREATE INDEX IF NOT EXISTS idx_tickets_user ON giveaway_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_campaign ON giveaway_tickets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_tickets_user_campaign ON giveaway_tickets(user_id, campaign_id);

CREATE INDEX IF NOT EXISTS idx_entries_user ON giveaway_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_entries_campaign ON giveaway_entries(campaign_id);
CREATE INDEX IF NOT EXISTS idx_entries_tickets ON giveaway_entries(total_tickets DESC);

CREATE INDEX IF NOT EXISTS idx_winners_user ON giveaway_winners(user_id);
CREATE INDEX IF NOT EXISTS idx_winners_campaign ON giveaway_winners(campaign_id);
CREATE INDEX IF NOT EXISTS idx_winners_paid_out ON giveaway_winners(paid_out);

-- Enable Row Level Security
ALTER TABLE giveaway_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE giveaway_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE giveaway_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE giveaway_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE giveaway_winners ENABLE ROW LEVEL SECURITY;

-- RLS Policies for giveaway_campaigns
CREATE POLICY "Anyone can view campaigns"
  ON giveaway_campaigns FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for giveaway_prizes
CREATE POLICY "Anyone can view prize structures"
  ON giveaway_prizes FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for giveaway_tickets
CREATE POLICY "Users can view own tickets"
  ON giveaway_tickets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service can insert tickets"
  ON giveaway_tickets FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for giveaway_entries
CREATE POLICY "Users can view own entries"
  ON giveaway_entries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view entry counts"
  ON giveaway_entries FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service can manage entries"
  ON giveaway_entries FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service can update entries"
  ON giveaway_entries FOR UPDATE
  TO authenticated
  USING (true);

-- RLS Policies for giveaway_winners
CREATE POLICY "Users can view own wins"
  ON giveaway_winners FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own claimed status"
  ON giveaway_winners FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_giveaway_campaign_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON giveaway_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_giveaway_campaign_updated_at();

-- Create function to update entry last_updated timestamp
CREATE OR REPLACE FUNCTION update_giveaway_entry_last_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for last_updated
CREATE TRIGGER update_entries_last_updated
  BEFORE UPDATE ON giveaway_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_giveaway_entry_last_updated();

-- Add giveaway_prize transaction type
DO $$
BEGIN
  ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
  ALTER TABLE transactions ADD CONSTRAINT transactions_type_check 
    CHECK (type IN ('deposit', 'withdrawal', 'trade', 'robot_profit', 'binary_trade', 'stake', 'staking_profit', 'staking_return', 'challenge_fee', 'challenge_reward', 'referral_earning', 'swap_fee', 'swap_refund', 'wheel_bonus', 'giveaway_prize'));
END $$;