/*
  # Create user favorites table

  1. New Tables
    - `user_favorites`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to users table)
      - `symbol` (text, trading pair symbol like 'BTCUSDT', 'EURUSD')
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `user_favorites` table
    - Add policy for users to manage their own favorites
    - Add unique constraint to prevent duplicate favorites per user

  3. Indexes
    - Add index on user_id for efficient queries
    - Add unique constraint on (user_id, symbol)
*/

CREATE TABLE IF NOT EXISTS user_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Add unique constraint to prevent duplicate favorites
ALTER TABLE user_favorites ADD CONSTRAINT user_favorites_user_symbol_unique UNIQUE (user_id, symbol);

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites (user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_symbol ON user_favorites (symbol);

-- Enable Row Level Security
ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;

-- Create policy for users to manage their own favorites
CREATE POLICY "Users can manage own favorites"
  ON user_favorites
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create policy for service role to manage all favorites
CREATE POLICY "Service role can manage all favorites"
  ON user_favorites
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);