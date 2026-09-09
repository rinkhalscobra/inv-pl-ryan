/*
  # Fix foreign key constraint and missing robot_states columns

  1. Fixes
    - Ensure users table is properly populated from auth.users
    - Add missing challenge-related columns to robot_states table
    - Create proper triggers and policies with existence checks

  2. Security
    - Maintain RLS policies with proper checks
    - Ensure data integrity with constraints
*/

-- First, ensure the users table exists with proper structure
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create policy for users to read their own data (with existence check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'users' AND policyname = 'Users can read own data'
  ) THEN
    CREATE POLICY "Users can read own data"
      ON users
      FOR SELECT
      TO authenticated
      USING (auth.uid() = id);
  END IF;
END $$;

-- Create function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (new.id, new.email)
  ON CONFLICT (id) DO UPDATE SET
    email = new.email,
    updated_at = now();
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create user record (with existence check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT OR UPDATE ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- Backfill any missing users from auth.users
INSERT INTO public.users (id, email)
SELECT id, email
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.users)
ON CONFLICT (id) DO NOTHING;

-- Add missing columns to robot_states table
DO $$
BEGIN
  -- Add active_challenge_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'robot_states' AND column_name = 'active_challenge_id'
  ) THEN
    ALTER TABLE robot_states ADD COLUMN active_challenge_id uuid DEFAULT NULL;
  END IF;

  -- Add challenge_account_balance column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'robot_states' AND column_name = 'challenge_account_balance'
  ) THEN
    ALTER TABLE robot_states ADD COLUMN challenge_account_balance decimal(20,8) DEFAULT 0;
  END IF;

  -- Add challenge_profit_target column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'robot_states' AND column_name = 'challenge_profit_target'
  ) THEN
    ALTER TABLE robot_states ADD COLUMN challenge_profit_target decimal(20,8) DEFAULT 0;
  END IF;

  -- Add challenge_max_drawdown column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'robot_states' AND column_name = 'challenge_max_drawdown'
  ) THEN
    ALTER TABLE robot_states ADD COLUMN challenge_max_drawdown decimal(20,8) DEFAULT 0;
  END IF;

  -- Add challenge_time_limit column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'robot_states' AND column_name = 'challenge_time_limit'
  ) THEN
    ALTER TABLE robot_states ADD COLUMN challenge_time_limit integer DEFAULT NULL;
  END IF;
END $$;

-- Add constraints for challenge-related columns (with existence checks)
DO $$
BEGIN
  -- Ensure challenge amounts are non-negative
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'robot_states_challenge_account_balance_check'
  ) THEN
    ALTER TABLE robot_states ADD CONSTRAINT robot_states_challenge_account_balance_check 
    CHECK (challenge_account_balance >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'robot_states_challenge_profit_target_check'
  ) THEN
    ALTER TABLE robot_states ADD CONSTRAINT robot_states_challenge_profit_target_check 
    CHECK (challenge_profit_target >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'robot_states_challenge_max_drawdown_check'
  ) THEN
    ALTER TABLE robot_states ADD CONSTRAINT robot_states_challenge_max_drawdown_check 
    CHECK (challenge_max_drawdown >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'robot_states_challenge_time_limit_check'
  ) THEN
    ALTER TABLE robot_states ADD CONSTRAINT robot_states_challenge_time_limit_check 
    CHECK (challenge_time_limit IS NULL OR challenge_time_limit > 0);
  END IF;
END $$;

-- Create indexes for better performance (with existence checks)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_robot_states_active_challenge'
  ) THEN
    CREATE INDEX idx_robot_states_active_challenge ON robot_states(active_challenge_id) WHERE active_challenge_id IS NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_users_email'
  ) THEN
    CREATE INDEX idx_users_email ON users(email);
  END IF;
END $$;