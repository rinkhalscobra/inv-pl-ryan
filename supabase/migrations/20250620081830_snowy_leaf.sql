/*
  # Add News Items Table

  1. New Table
    - `news_items` - Stores news articles fetched from external APIs
    
  2. Security
    - Enable RLS on the new table
    - Add policies for authenticated users to read news items
    - Add policy for service role to manage news items
    
  3. Features
    - Store news title, summary, source, URL, category, and image URL
    - Track publication date and when the item was fetched
    - Add indexes for better performance
*/

-- Create news_items table
CREATE TABLE IF NOT EXISTS news_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  summary text NOT NULL,
  source text NOT NULL,
  published_at timestamptz NOT NULL,
  url text NOT NULL,
  category text NOT NULL CHECK (category IN ('crypto', 'markets', 'economy', 'technology', 'general')),
  image_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE news_items ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
CREATE POLICY "Authenticated users can read news items"
  ON news_items
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage news items"
  ON news_items
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_news_items_category ON news_items(category);
CREATE INDEX IF NOT EXISTS idx_news_items_published_at ON news_items(published_at DESC);

-- Create updated_at trigger
CREATE TRIGGER update_news_items_updated_at
  BEFORE UPDATE ON news_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample news items
INSERT INTO news_items (title, summary, source, published_at, url, category, image_url) VALUES
  ('Bitcoin Surges Past $100,000 as Institutional Adoption Accelerates', 'Bitcoin has reached a new all-time high above $100,000 as major financial institutions continue to increase their cryptocurrency holdings.', 'CryptoNews', now() - interval '2 hours', 'https://example.com/news/1', 'crypto', 'https://images.pexels.com/photos/844124/pexels-photo-844124.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1'),
  ('Federal Reserve Signals Potential Rate Cut in Q3 2025', 'The Federal Reserve has indicated it may consider cutting interest rates in the third quarter of 2025 if inflation continues to moderate.', 'Financial Times', now() - interval '5 hours', 'https://example.com/news/2', 'economy', 'https://images.pexels.com/photos/259132/pexels-photo-259132.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1'),
  ('Ethereum 2.0 Upgrade Completes Final Testnet Phase Successfully', 'The final testnet phase for Ethereum 2.0 has been completed successfully, paving the way for the mainnet upgrade expected next month.', 'BlockchainInsider', now() - interval '1 day', 'https://example.com/news/3', 'crypto', 'https://images.pexels.com/photos/8370752/pexels-photo-8370752.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1'),
  ('New AI-Powered Trading Algorithm Shows 35% Improvement in Backtests', 'A newly developed AI trading algorithm has demonstrated a 35% improvement in performance compared to traditional strategies in extensive backtesting.', 'TechTrader', now() - interval '2 days', 'https://example.com/news/4', 'technology', 'https://images.pexels.com/photos/8386440/pexels-photo-8386440.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1'),
  ('Global Markets Rally as Trade Tensions Ease Between Major Economies', 'Stock markets worldwide are rallying after announcements of reduced trade barriers between the United States, China, and European Union.', 'Market Watch', now() - interval '3 days', 'https://example.com/news/5', 'markets', 'https://images.pexels.com/photos/6801648/pexels-photo-6801648.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1')
ON CONFLICT DO NOTHING;