/*
  # Fix RLS Policies for Database Operations

  1. Security Updates
    - Fix RLS policies across all tables to allow proper operations
    - Add service role policies for system operations (Manifold sync, user setup)
    - Ensure authenticated users can access their own data
    - Allow proper user creation and setup flow

  2. Policy Changes
    - Drop and recreate problematic policies
    - Add service role access where needed
    - Maintain security while enabling necessary operations
*/

-- Enable RLS on users table if not already enabled
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies that might be causing issues
DROP POLICY IF EXISTS "Users can insert own data" ON users;
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Service role can manage users" ON users;

-- Create new user policies
CREATE POLICY "Users can insert own data"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Add service role policy for users (needed for user creation)
CREATE POLICY "Service role can manage users"
  ON users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Fix events table policies
DROP POLICY IF EXISTS "Users can create events" ON events;
DROP POLICY IF EXISTS "Users can update own events" ON events;
DROP POLICY IF EXISTS "Users can view all open events" ON events;
DROP POLICY IF EXISTS "Users can create own events" ON events;
DROP POLICY IF EXISTS "Users can view events" ON events;
DROP POLICY IF EXISTS "Service role can manage events" ON events;

-- Allow service role to manage events (for Manifold sync)
CREATE POLICY "Service role can manage events"
  ON events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to create their own events
CREATE POLICY "Users can create own events"
  ON events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to update their own events
CREATE POLICY "Users can update own events"
  ON events
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to read all open events and their own events
CREATE POLICY "Users can view events"
  ON events
  FOR SELECT
  TO authenticated
  USING (status = 'open' OR auth.uid() = user_id);

-- Fix event_outcomes policies
DROP POLICY IF EXISTS "Users can create outcomes for own events" ON event_outcomes;
DROP POLICY IF EXISTS "Users can update outcomes for own events" ON event_outcomes;
DROP POLICY IF EXISTS "Users can view all event outcomes" ON event_outcomes;
DROP POLICY IF EXISTS "Service role can manage event outcomes" ON event_outcomes;

-- Allow service role to manage event outcomes (for Manifold sync)
CREATE POLICY "Service role can manage event outcomes"
  ON event_outcomes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to create outcomes for their own events
CREATE POLICY "Users can create outcomes for own events"
  ON event_outcomes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events 
      WHERE events.id = event_outcomes.event_id 
      AND events.user_id = auth.uid()
    )
  );

-- Allow authenticated users to update outcomes for their own events
CREATE POLICY "Users can update outcomes for own events"
  ON event_outcomes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events 
      WHERE events.id = event_outcomes.event_id 
      AND events.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events 
      WHERE events.id = event_outcomes.event_id 
      AND events.user_id = auth.uid()
    )
  );

-- Allow authenticated users to view all event outcomes
CREATE POLICY "Users can view all event outcomes"
  ON event_outcomes
  FOR SELECT
  TO authenticated
  USING (true);

-- Fix balances table policies
DROP POLICY IF EXISTS "Users can read own balances" ON balances;
DROP POLICY IF EXISTS "Users can update own balances" ON balances;
DROP POLICY IF EXISTS "Users can manage own balances" ON balances;
DROP POLICY IF EXISTS "Service role can manage balances" ON balances;

-- Allow authenticated users to manage their own balances
CREATE POLICY "Users can manage own balances"
  ON balances
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add service role policy for balances (needed for user setup)
CREATE POLICY "Service role can manage balances"
  ON balances
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Fix robot_states table policies
DROP POLICY IF EXISTS "Users can manage own robot state" ON robot_states;
DROP POLICY IF EXISTS "Service role can manage robot states" ON robot_states;

-- Allow authenticated users to manage their own robot state
CREATE POLICY "Users can manage own robot state"
  ON robot_states
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add service role policy for robot_states (needed for user setup)
CREATE POLICY "Service role can manage robot states"
  ON robot_states
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Fix market_data policies
DROP POLICY IF EXISTS "Service role can manage market data" ON market_data;

-- Ensure market_data policies allow service role access
CREATE POLICY "Service role can manage market data"
  ON market_data
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Fix price_data policies
DROP POLICY IF EXISTS "Service role can manage price data" ON price_data;

-- Ensure price_data policies allow service role access
CREATE POLICY "Service role can manage price data"
  ON price_data
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);