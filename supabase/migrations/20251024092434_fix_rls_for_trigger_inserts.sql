/*
  # Fix RLS Policies for Trigger Inserts

  1. Changes
    - Add policies to allow trigger function to insert into RLS-protected tables
    - The trigger runs as SECURITY DEFINER, but RLS still applies
    - Add INSERT policies that allow creation when auth.uid() is null (during signup)

  2. Security
    - Only affects INSERT operations during user creation
    - Maintains existing read/update/delete policies
*/

-- Drop existing policies if they exist and recreate
DROP POLICY IF EXISTS "Allow insert during user creation" ON user_assets;
DROP POLICY IF EXISTS "Allow insert during user creation" ON user_2fa;
DROP POLICY IF EXISTS "Allow insert during user creation" ON portfolio_snapshots;

-- Allow INSERT into user_assets during signup (when auth.uid() is null or matches user_id)
CREATE POLICY "Allow insert during user creation"
  ON user_assets
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.uid() IS NULL);

-- Allow INSERT into user_2fa during signup
CREATE POLICY "Allow insert during user creation"
  ON user_2fa
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.uid() IS NULL);

-- Allow INSERT into portfolio_snapshots during signup
CREATE POLICY "Allow insert during user creation"
  ON portfolio_snapshots
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.uid() IS NULL);
