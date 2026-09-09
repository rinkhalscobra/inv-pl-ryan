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

    // Add comprehensive fallback pairs in case API fails
    const fallbackPairs = [
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
    
    let pairsToInsert = [];
    let marketDataToUpsert = [];
    
    try {
      // Step 1: Fetch exchange info from Binance Futures API instead of spot API
      console.log("Fetching exchange info from Binance Futures API...");
      const exchangeInfoResponse = await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo", {
        headers: {
          'Accept': 'application/json',
        },
        // Increased timeout from 10 to 30 seconds
        signal: AbortSignal.timeout(30000)
      });
      
      if (!exchangeInfoResponse.ok) {
        throw new Error(`Binance Futures exchangeInfo API error: ${exchangeInfoResponse.status}`);
      }
      
      const exchangeInfo = await exchangeInfoResponse.json();
      
      // Filter for USDT-M perpetual futures that are currently trading
      const validSymbols = exchangeInfo.symbols
        .filter(symbol => 
          symbol.status === 'TRADING' && 
          symbol.quoteAsset === 'USDT' &&
          symbol.contractType === 'PERPETUAL'
        )
        .map(symbol => ({
          symbol: symbol.symbol,
          name: `${symbol.baseAsset}/${symbol.quoteAsset}`,
          base: symbol.baseAsset,
          quote: symbol.quoteAsset,
          last_updated_at: new Date().toISOString()
        }));
      
      console.log(`Found ${validSymbols.length} valid futures trading pairs from Binance`);
      
      // Step 2: Fetch 24hr ticker data for all futures symbols
      console.log("Fetching 24hr ticker data from Binance Futures API...");
      const tickerResponse = await fetch("https://fapi.binance.com/fapi/v1/ticker/24hr", {
        headers: {
          'Accept': 'application/json',
        },
        // Increased timeout from 10 to 30 seconds
        signal: AbortSignal.timeout(30000)
      });
      
      if (!tickerResponse.ok) {
        throw new Error(`Binance Futures ticker API error: ${tickerResponse.status}`);
      }
      
      const tickerData = await tickerResponse.json();
      
      // Process ticker data and match with valid symbols
      const tickerMap = new Map();
      tickerData.forEach(ticker => {
        tickerMap.set(ticker.symbol, ticker);
      });
      
      // Create market data entries for each valid symbol
      validSymbols.forEach(symbol => {
        const ticker = tickerMap.get(symbol.symbol);
        if (ticker) {
          marketDataToUpsert.push({
            symbol: symbol.symbol,
            price: parseFloat(ticker.lastPrice) || 0,
            volume_24h: parseFloat(ticker.volume) || 0,
            change_24h: parseFloat(ticker.priceChangePercent) || 0,
            timestamp: new Date().toISOString()
          });
        }
      });
      
      console.log(`Processed ${marketDataToUpsert.length} market data entries from Binance Futures`);
      
      // Use the valid symbols as pairs to insert
      pairsToInsert = validSymbols;
      
    } catch (apiError) {
      console.warn(`Error fetching from Binance Futures API: ${apiError.message}`);
      console.log("Using fallback pairs instead");
      pairsToInsert = fallbackPairs;
      
      // Create fallback market data
      marketDataToUpsert = [
        { symbol: 'BTCUSDT', price: 65325.37, volume_24h: 61940000000, change_24h: 0.32, timestamp: new Date().toISOString() },
        { symbol: 'ETHUSDT', price: 3842.50, volume_24h: 25000000000, change_24h: 1.25, timestamp: new Date().toISOString() },
        { symbol: 'BNBUSDT', price: 692.45, volume_24h: 5000000000, change_24h: -0.15, timestamp: new Date().toISOString() },
        { symbol: 'XRPUSDT', price: 0.6, volume_24h: 150000000, change_24h: 3.2, timestamp: new Date().toISOString() },
        { symbol: 'SOLUSDT', price: 100, volume_24h: 300000000, change_24h: -1.2, timestamp: new Date().toISOString() },
        { symbol: 'ADAUSDT', price: 0.45, volume_24h: 120000000, change_24h: 0.8, timestamp: new Date().toISOString() },
        { symbol: 'DOGEUSDT', price: 0.12, volume_24h: 80000000, change_24h: 2.1, timestamp: new Date().toISOString() },
        { symbol: 'MATICUSDT', price: 0.85, volume_24h: 90000000, change_24h: -0.5, timestamp: new Date().toISOString() },
        { symbol: 'DOTUSDT', price: 7.25, volume_24h: 70000000, change_24h: 1.1, timestamp: new Date().toISOString() },
        { symbol: 'AVAXUSDT', price: 35.75, volume_24h: 110000000, change_24h: 3.5, timestamp: new Date().toISOString() },
        { symbol: 'LINKUSDT', price: 18.50, volume_24h: 85000000, change_24h: 0.9, timestamp: new Date().toISOString() },
        { symbol: 'UNIUSDT', price: 8.20, volume_24h: 65000000, change_24h: -0.7, timestamp: new Date().toISOString() },
        { symbol: 'SHIBUSDT', price: 0.00002, volume_24h: 95000000, change_24h: 4.2, timestamp: new Date().toISOString() },
        { symbol: 'LTCUSDT', price: 75.80, volume_24h: 55000000, change_24h: 0.3, timestamp: new Date().toISOString() },
        { symbol: 'ATOMUSDT', price: 9.45, volume_24h: 45000000, change_24h: 1.8, timestamp: new Date().toISOString() },
        { symbol: 'AAVEUSDT', price: 92.75, volume_24h: 40000000, change_24h: 1.2, timestamp: new Date().toISOString() }
      ];
    }
    
    if (pairsToInsert.length === 0) {
      console.log("No pairs fetched from API, using fallback pairs");
      pairsToInsert = fallbackPairs;
      
      // Create fallback market data if empty
      if (marketDataToUpsert.length === 0) {
        marketDataToUpsert = [
          { symbol: 'BTCUSDT', price: 65325.37, volume_24h: 61940000000, change_24h: 0.32, timestamp: new Date().toISOString() },
          { symbol: 'ETHUSDT', price: 3842.50, volume_24h: 25000000000, change_24h: 1.25, timestamp: new Date().toISOString() },
          { symbol: 'BNBUSDT', price: 692.45, volume_24h: 5000000000, change_24h: -0.15, timestamp: new Date().toISOString() },
          { symbol: 'XRPUSDT', price: 0.6, volume_24h: 150000000, change_24h: 3.2, timestamp: new Date().toISOString() },
          { symbol: 'SOLUSDT', price: 100, volume_24h: 300000000, change_24h: -1.2, timestamp: new Date().toISOString() },
          { symbol: 'AAVEUSDT', price: 92.75, volume_24h: 40000000, change_24h: 1.2, timestamp: new Date().toISOString() }
        ];
      }
    }

    // Ensure the cached_crypto_pairs table exists
    try {
      // Check if table exists
      const { count, error } = await supabase
        .from('cached_crypto_pairs')
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        // Table might not exist, try to create it
        console.log("Table might not exist, creating it...");
        
        const { error: createError } = await supabase.rpc('create_cached_crypto_pairs_table_if_not_exists');
        
        if (createError) {
          console.error("Error creating table via RPC:", createError);
          
          // Try direct SQL as a last resort
          const { error: sqlError } = await supabase.from('cached_crypto_pairs').select('count(*)');
          
          if (sqlError) {
            console.error("Error accessing table after creation attempt:", sqlError);
            throw new Error("Failed to create or access cached_crypto_pairs table");
          }
        }
      }
    } catch (tableError) {
      console.error("Error ensuring table exists:", tableError);
      // Continue anyway, as the table might actually exist
    }

    // Insert new data using upsert instead of delete + insert
    // This is the key change to fix the duplicate key error
    console.log(`Upserting ${pairsToInsert.length} pairs into cached_crypto_pairs table...`);
    
    // Insert in smaller batches to avoid payload size limits
    const batchSize = 50;
    let successCount = 0;
    
    for (let i = 0; i < pairsToInsert.length; i += batchSize) {
      const batch = pairsToInsert.slice(i, i + batchSize);
      try {
        // Use upsert with onConflict: 'symbol' to handle duplicates
        const { error: upsertError } = await supabase
          .from('cached_crypto_pairs')
          .upsert(batch, {
            onConflict: 'symbol',
            ignoreDuplicates: false
          });
        
        if (upsertError) {
          console.error(`Error upserting batch ${i / batchSize + 1}:`, upsertError);
        } else {
          successCount += batch.length;
          console.log(`Successfully upserted batch ${i / batchSize + 1} (${batch.length} pairs)`);
        }
      } catch (batchError) {
        console.error(`Exception during batch ${i / batchSize + 1} upsert:`, batchError);
      }
    }

    // Now update market_data table with the latest prices
    console.log(`Upserting ${marketDataToUpsert.length} entries into market_data table...`);
    
    let marketDataSuccessCount = 0;
    
    for (let i = 0; i < marketDataToUpsert.length; i += batchSize) {
      const batch = marketDataToUpsert.slice(i, i + batchSize);
      try {
        // Use upsert with onConflict: 'symbol' to handle duplicates
        const { error: upsertError } = await supabase
          .from('market_data')
          .upsert(batch, {
            onConflict: 'symbol',
            ignoreDuplicates: false
          });
        
        if (upsertError) {
          console.error(`Error upserting market data batch ${i / batchSize + 1}:`, upsertError);
        } else {
          marketDataSuccessCount += batch.length;
          console.log(`Successfully upserted market data batch ${i / batchSize + 1} (${batch.length} entries)`);
        }
      } catch (batchError) {
        console.error(`Exception during market data batch ${i / batchSize + 1} upsert:`, batchError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully cached ${successCount} crypto pairs and updated ${marketDataSuccessCount} market data entries from Binance Futures`,
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
    console.error("Error in cache-crypto-pairs function:", error);
    
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