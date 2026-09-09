import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface NewsItem {
  title: string;
  summary: string;
  source: string;
  published_at: string;
  url: string;
  category: 'crypto' | 'markets' | 'economy' | 'technology' | 'general';
  image_url?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // In a real implementation, we would fetch news from an external API
    // For this example, we'll simulate fetching news by generating mock data
    console.log("Simulating news fetch from external API...");
    
    const mockNews: NewsItem[] = [
      {
        title: "Bitcoin Surges Past $100,000 as Institutional Adoption Accelerates",
        summary: "Bitcoin has reached a new all-time high above $100,000 as major financial institutions continue to increase their cryptocurrency holdings.",
        source: "CryptoNews",
        published_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        url: "https://example.com/news/1",
        category: "crypto",
        image_url: "https://images.pexels.com/photos/844124/pexels-photo-844124.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1"
      },
      {
        title: "Federal Reserve Signals Potential Rate Cut in Q3 2025",
        summary: "The Federal Reserve has indicated it may consider cutting interest rates in the third quarter of 2025 if inflation continues to moderate.",
        source: "Financial Times",
        published_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
        url: "https://example.com/news/2",
        category: "economy",
        image_url: "https://images.pexels.com/photos/259132/pexels-photo-259132.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1"
      },
      {
        title: "Ethereum 2.0 Upgrade Completes Final Testnet Phase Successfully",
        summary: "The final testnet phase for Ethereum 2.0 has been completed successfully, paving the way for the mainnet upgrade expected next month.",
        source: "BlockchainInsider",
        published_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
        url: "https://example.com/news/3",
        category: "crypto",
        image_url: "https://images.pexels.com/photos/8370752/pexels-photo-8370752.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1"
      },
      {
        title: "New AI-Powered Trading Algorithm Shows 35% Improvement in Backtests",
        summary: "A newly developed AI trading algorithm has demonstrated a 35% improvement in performance compared to traditional strategies in extensive backtesting.",
        source: "TechTrader",
        published_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
        url: "https://example.com/news/4",
        category: "technology",
        image_url: "https://images.pexels.com/photos/8386440/pexels-photo-8386440.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1"
      },
      {
        title: "Global Markets Rally as Trade Tensions Ease Between Major Economies",
        summary: "Stock markets worldwide are rallying after announcements of reduced trade barriers between the United States, China, and European Union.",
        source: "Market Watch",
        published_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
        url: "https://example.com/news/5",
        category: "markets",
        image_url: "https://images.pexels.com/photos/6801648/pexels-photo-6801648.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1"
      },
      {
        title: "DeFi Protocol TVL Reaches New All-Time High of $150 Billion",
        summary: "The total value locked in decentralized finance protocols has surpassed $150 billion for the first time, marking a significant milestone for the DeFi ecosystem.",
        source: "DeFi Pulse",
        published_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
        url: "https://example.com/news/6",
        category: "crypto",
        image_url: "https://images.pexels.com/photos/7788009/pexels-photo-7788009.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1"
      },
      {
        title: "SEC Approves New Batch of Crypto ETFs, Market Responds Positively",
        summary: "The Securities and Exchange Commission has approved several new cryptocurrency ETFs, leading to a positive response from the market and increased institutional interest.",
        source: "Crypto Briefing",
        published_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), // 12 hours ago
        url: "https://example.com/news/7",
        category: "crypto",
        image_url: "https://images.pexels.com/photos/6771900/pexels-photo-6771900.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1"
      },
      {
        title: "Major Tech Companies Announce Joint AI Safety Initiative",
        summary: "Leading technology companies have announced a collaborative initiative focused on ensuring the safe development and deployment of advanced artificial intelligence systems.",
        source: "Tech Insider",
        published_at: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(), // 36 hours ago
        url: "https://example.com/news/8",
        category: "technology",
        image_url: "https://images.pexels.com/photos/8386434/pexels-photo-8386434.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1"
      },
      {
        title: "Central Banks Worldwide Explore CBDC Implementation Strategies",
        summary: "Central banks from major economies are actively exploring various strategies for implementing Central Bank Digital Currencies (CBDCs) to modernize financial systems.",
        source: "Global Finance",
        published_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days ago
        url: "https://example.com/news/9",
        category: "economy",
        image_url: "https://images.pexels.com/photos/4386158/pexels-photo-4386158.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1"
      },
      {
        title: "Renewable Energy Investments in Crypto Mining Reach Record Levels",
        summary: "Cryptocurrency mining operations are increasingly turning to renewable energy sources, with investments in green mining infrastructure reaching unprecedented levels.",
        source: "Green Tech Journal",
        published_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
        url: "https://example.com/news/10",
        category: "crypto",
        image_url: "https://images.pexels.com/photos/1036936/pexels-photo-1036936.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1"
      }
    ];

    // Upsert news items to the database
    console.log(`Upserting ${mockNews.length} news items to the database...`);
    
    // Generate a unique ID for each news item based on its URL
    const newsItemsWithIds = mockNews.map(item => ({
      ...item,
      id: crypto.randomUUID(), // Use a random UUID for each item
    }));
    
    const { data, error } = await supabase
      .from('news_items')
      .upsert(newsItemsWithIds, {
        onConflict: 'url', // Assuming URL is unique for each news item
        ignoreDuplicates: false
      });
      
    if (error) {
      console.error("Error upserting news items:", error);
      throw error;
    }
    
    // Get the latest news items from the database
    const { data: latestNews, error: fetchError } = await supabase
      .from('news_items')
      .select('*')
      .order('published_at', { ascending: false })
      .limit(10);
      
    if (fetchError) {
      console.error("Error fetching latest news:", fetchError);
      throw fetchError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully fetched and stored ${mockNews.length} news items`,
        data: latestNews,
        timestamp: new Date().toISOString()
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in fetch-news function:", error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 500,
      }
    );
  }
});