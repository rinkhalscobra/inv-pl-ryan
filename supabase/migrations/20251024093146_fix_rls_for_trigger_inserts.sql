/*
  # Fix RLS Policies for Trigger Inserts

  1. Changes
    - Add INSERT policies for users, balances, and robot_states tables
    - Allow trigger to insert during user creation when auth.uid() IS NULL
    
  2. Security
    - Policies only allow INSERT when auth.uid() matches user_id OR auth.uid() IS NULL (during trigger execution)
    - Maintains all existing security policies
*/

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow insert during user creation" ON public.users;
DROP POLICY IF EXISTS "Allow insert during user creation" ON public.balances;
DROP POLICY IF EXISTS "Allow insert during user creation" ON public.robot_states;

-- Allow insert into users during user creation
CREATE POLICY "Allow insert during user creation"
  ON public.users
  FOR INSERT
  TO public
  WITH CHECK (auth.uid() = id OR auth.uid() IS NULL);

-- Allow insert into balances during user creation
CREATE POLICY "Allow insert during user creation"
  ON public.balances
  FOR INSERT
  TO public
  WITH CHECK (auth.uid() = user_id OR auth.uid() IS NULL);

-- Allow insert into robot_states during user creation
CREATE POLICY "Allow insert during user creation"
  ON public.robot_states
  FOR INSERT
  TO public
  WITH CHECK (auth.uid() = user_id OR auth.uid() IS NULL);
