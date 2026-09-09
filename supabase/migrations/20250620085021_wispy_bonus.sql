/*
  # Add unique constraint to news_items url column

  1. Changes
    - Add unique constraint to the `url` column in the `news_items` table
    - This enables upsert operations with onConflict: 'url'
  
  2. Security
    - No changes to existing RLS policies
*/

-- Add unique constraint to url column in news_items table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'news_items_url_key' 
    AND table_name = 'news_items'
  ) THEN
    ALTER TABLE news_items ADD CONSTRAINT news_items_url_key UNIQUE (url);
  END IF;
END $$;

-- Create index for url lookups
CREATE INDEX IF NOT EXISTS idx_news_items_url ON news_items(url);