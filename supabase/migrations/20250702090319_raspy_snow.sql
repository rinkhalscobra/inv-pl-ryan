/*
  # Fix RLS policies for external events and outcomes

  1. Policy Updates
    - Combine "create own" and "insert external" policies for events table
    - Combine "update own" and "update external" policies for events table  
    - Combine "create outcomes for own" and "insert external outcomes" policies for event_outcomes table
    - Combine "update outcomes for own" and "update external outcomes" policies for event_outcomes table

  2. Security
    - Maintain RLS protection while allowing external data sync
    - Allow authenticated users to manage their own events OR external events (user_id IS NULL AND polymarket_id IS NOT NULL)
    - Allow authenticated users to manage outcomes for their own events OR external outcomes (polymarket_id IS NOT NULL)
*/

-- Fix events table policies by combining own and external policies
DROP POLICY IF EXISTS "Users can create own events" ON events;
DROP POLICY IF EXISTS "Authenticated users can insert external events" ON events;
DROP POLICY IF EXISTS "Users can update own events" ON events;
DROP POLICY IF EXISTS "Authenticated users can update external events" ON events;

-- Combined policy for creating events (own events OR external events)
CREATE POLICY "Users can create events"
  ON events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id OR 
    (polymarket_id IS NOT NULL AND user_id IS NULL)
  );

-- Combined policy for updating events (own events OR external events)
CREATE POLICY "Users can update events"
  ON events
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id OR 
    (polymarket_id IS NOT NULL AND user_id IS NULL)
  )
  WITH CHECK (
    auth.uid() = user_id OR 
    (polymarket_id IS NOT NULL AND user_id IS NULL)
  );

-- Fix event_outcomes table policies by combining own and external policies
DROP POLICY IF EXISTS "Users can create outcomes for own events" ON event_outcomes;
DROP POLICY IF EXISTS "Authenticated users can insert external outcomes" ON event_outcomes;
DROP POLICY IF EXISTS "Users can update outcomes for own events" ON event_outcomes;
DROP POLICY IF EXISTS "Authenticated users can update external outcomes" ON event_outcomes;

-- Combined policy for creating event outcomes (own event outcomes OR external outcomes)
CREATE POLICY "Users can create event outcomes"
  ON event_outcomes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events 
      WHERE events.id = event_outcomes.event_id 
      AND events.user_id = auth.uid()
    ) OR
    polymarket_id IS NOT NULL
  );

-- Combined policy for updating event outcomes (own event outcomes OR external outcomes)
CREATE POLICY "Users can update event outcomes"
  ON event_outcomes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events 
      WHERE events.id = event_outcomes.event_id 
      AND events.user_id = auth.uid()
    ) OR
    polymarket_id IS NOT NULL
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events 
      WHERE events.id = event_outcomes.event_id 
      AND events.user_id = auth.uid()
    ) OR
    polymarket_id IS NOT NULL
  );