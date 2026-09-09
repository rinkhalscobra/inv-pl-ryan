import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

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

    // Create the cached_crypto_pairs table if it doesn't exist
    const { error: createTableError } = await supabase.rpc('create_cached_crypto_pairs_table_if_not_exists');
    
    if (createTableError) {
      console.error("Error creating table via RPC:", createTableError);
      throw new Error(`Failed to create cached_crypto_pairs table: ${createTableError.message}`);
    }

    // Insert initial data if table is empty
    const { count, error: countError } = await supabase
      .from('cached_crypto_pairs')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.error("Error checking table count:", countError);
      throw new Error(`Failed to check table count: ${countError.message}`);
    }

    if (count === 0) {
      console.log("Table is empty, inserting initial data...");
      
      // Initial set of common crypto pairs
      const initialPairs = [
        { symbol: 'BTCUSDT', name: 'BTC/USDT', base: 'BTC', quote: 'USDT' },
        { symbol: 'ETHUSDT', name: 'ETH/USDT', base: 'ETH', quote: 'USDT' },
        { symbol: 'BNBUSDT', name: 'BNB/USDT', base: 'BNB', quote: 'USDT' },
        { symbol: 'XRPUSDT', name: 'XRP/USDT', base: 'XRP', quote: 'USDT' },
        { symbol: 'SOLUSDT', name: 'SOL/USDT', base: 'SOL', quote: 'USDT' },
        { symbol: 'ADAUSDT', name: 'ADA/USDT', base: 'ADA', quote: 'USDT' },
        { symbol: 'DOGEUSDT', name: 'DOGE/USDT', base: 'DOGE', quote: 'USDT' },
        { symbol: 'MATICUSDT', name: 'MATIC/USDT', base: 'MATIC', quote: 'USDT' },
        { symbol: 'DOTUSDT', name: 'DOT/USDT', base: 'DOT', quote: 'USDT' },
        { symbol: 'AVAXUSDT', name: 'AVAX/USDT', base: 'AVAX', quote: 'USDT' },
        { symbol: 'LINKUSDT', name: 'LINK/USDT', base: 'LINK', quote: 'USDT' },
        { symbol: 'UNIUSDT', name: 'UNI/USDT', base: 'UNI', quote: 'USDT' },
        { symbol: 'SHIBUSDT', name: 'SHIB/USDT', base: 'SHIB', quote: 'USDT' },
        { symbol: 'LTCUSDT', name: 'LTC/USDT', base: 'LTC', quote: 'USDT' },
        { symbol: 'ATOMUSDT', name: 'ATOM/USDT', base: 'ATOM', quote: 'USDT' }
      ].map(pair => ({
        ...pair,
        last_updated_at: new Date().toISOString()
      }));
      
      const { error: insertError } = await supabase
        .from('cached_crypto_pairs')
        .upsert(initialPairs, {
          onConflict: 'symbol',
          ignoreDuplicates: false
        });
      
      if (insertError) {
        console.error("Error inserting initial data:", insertError);
        throw new Error(`Failed to insert initial data: ${insertError.message}`);
      }
      
      console.log(`Successfully inserted ${initialPairs.length} initial pairs`);
    } else {
      console.log(`Table already contains data (${count} rows), skipping initial data insertion`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Cached crypto pairs table created and initialized successfully",
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
    console.error("Error in create-cached-crypto-pairs-table function:", error);
    
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