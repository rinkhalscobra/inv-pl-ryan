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

    console.log("Starting Bybit market data sync...");
    
    // Call the bybit-proxy Edge Function to get ticker data
    const supabaseFunctionsUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/bybit-proxy`;
    
    const response = await fetch(supabaseFunctionsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
      },
      body: JSON.stringify({
        endpoint: '/v5/market/tickers',
        params: {
          category: 'linear'
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to fetch Bybit ticker data: ${errorText}`);
      throw new Error(`Failed to fetch Bybit ticker data: ${errorText}`);
    }

    const data = await response.json();
    
    if (!data || !data.result || !data.result.list || !Array.isArray(data.result.list)) {
      throw new Error("Invalid response format from Bybit API");
    }
    
    const tickers = data.result.list;
    console.log(`Received ${tickers.length} tickers from Bybit API`);
    
    // Process tickers and prepare for database insertion
    const marketDataToUpsert = tickers.map(ticker => ({
      symbol: ticker.symbol,
      price: parseFloat(ticker.lastPrice) || 0,
      volume_24h: parseFloat(ticker.volume24h) || 0,
      change_24h: parseFloat(ticker.price24hPcnt) * 100 || 0, // Convert to percentage
      timestamp: new Date().toISOString(),
      high_price_24h: parseFloat(ticker.highPrice24h) || 0,
      low_price_24h: parseFloat(ticker.lowPrice24h) || 0,
      market_cap: 0, // Will be populated from CoinGecko data later
      funding_rate: parseFloat(ticker.fundingRate) * 100 || 0, // Convert to percentage
      open_interest: parseFloat(ticker.openInterestValue) || 0
    }));
    
    // Filter out any invalid entries
    const validMarketData = marketDataToUpsert.filter(item => 
      item.symbol && 
      !isNaN(item.price) && 
      item.price > 0 &&
      item.symbol.endsWith('USDT') // Only include USDT pairs
    );
    
    console.log(`Prepared ${validMarketData.length} valid market data entries for upsert`);
    
    if (validMarketData.length === 0) {
      throw new Error("No valid market data to insert");
    }
    
    // Insert in smaller batches to avoid payload size limits
    const batchSize = 50;
    let successCount = 0;
    
    for (let i = 0; i < validMarketData.length; i += batchSize) {
      const batch = validMarketData.slice(i, i + batchSize);
      try {
        // Use upsert with onConflict: 'symbol' to handle duplicates
        const { error: upsertError } = await supabase
          .from('market_data')
          .upsert(batch, {
            onConflict: 'symbol',
            ignoreDuplicates: false
          });
        
        if (upsertError) {
          console.error(`Error upserting batch ${i / batchSize + 1}:`, upsertError);
        } else {
          successCount += batch.length;
          console.log(`Successfully upserted batch ${i / batchSize + 1} (${batch.length} entries)`);
        }
      } catch (batchError) {
        console.error(`Exception during batch ${i / batchSize + 1} upsert:`, batchError);
      }
    }
    
    // Also sync to price_data table for historical records
    // Only insert the most important pairs to avoid excessive data
    const importantPairs = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
    const importantPairsData = validMarketData.filter(item => importantPairs.includes(item.symbol));
    
    if (importantPairsData.length > 0) {
      try {
        const { error: priceDataError } = await supabase
          .from('price_data')
          .insert(importantPairsData.map(item => ({
            symbol: item.symbol,
            price: item.price,
            timestamp: item.timestamp
          })));
        
        if (priceDataError) {
          console.error("Error inserting to price_data:", priceDataError);
        } else {
          console.log(`Successfully inserted ${importantPairsData.length} entries to price_data`);
        }
      } catch (priceDataInsertError) {
        console.error("Exception during price_data insert:", priceDataInsertError);
      }
    }

    // Fetch CoinGecko data for market caps
    try {
      console.log("Fetching market cap data from CoinGecko...");
      
      // Use the proxy-api Edge Function to avoid CORS issues
      const proxyResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/proxy-api`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        },
        body: JSON.stringify({
          url: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1',
          method: 'GET'
        }),
      });

      if (proxyResponse.ok) {
        const coinGeckoData = await proxyResponse.json();
        
        if (Array.isArray(coinGeckoData)) {
          console.log(`Received market cap data for ${coinGeckoData.length} coins from CoinGecko`);
          
          // Create a map of symbol to market cap
          const marketCapMap = new Map();
          coinGeckoData.forEach(coin => {
            marketCapMap.set(coin.symbol.toUpperCase(), coin.market_cap);
          });
          
          // Update market data with market caps
          for (let i = 0; i < validMarketData.length; i += batchSize) {
            const batch = validMarketData.slice(i, i + batchSize);
            
            // Update market caps in the batch
            const updatedBatch = batch.map(item => {
              const symbol = item.symbol.replace('USDT', '').toUpperCase();
              const marketCap = marketCapMap.get(symbol) || 0;
              return {
                ...item,
                market_cap: marketCap
              };
            });
            
            try {
              const { error: updateError } = await supabase
                .from('market_data')
                .upsert(updatedBatch, {
                  onConflict: 'symbol',
                  ignoreDuplicates: false
                });
              
              if (updateError) {
                console.error(`Error updating market caps for batch ${i / batchSize + 1}:`, updateError);
              } else {
                console.log(`Successfully updated market caps for batch ${i / batchSize + 1} (${batch.length} entries)`);
              }
            } catch (updateError) {
              console.error(`Exception during market cap update for batch ${i / batchSize + 1}:`, updateError);
            }
          }
        }
      } else {
        console.warn("Failed to fetch CoinGecko data:", await proxyResponse.text());
      }
    } catch (coinGeckoError) {
      console.warn("Error fetching CoinGecko data:", coinGeckoError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully synced ${successCount} market data entries from Bybit`,
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
    console.error("Error in sync-bybit-market-data function:", error);
    
    // Try to get the last known good data from the database
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      
      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        // Get the timestamp of the most recent market data
        const { data: latestData, error: latestError } = await supabase
          .from('market_data')
          .select('timestamp')
          .order('timestamp', { ascending: false })
          .limit(1)
          .single();
          
        if (!latestError && latestData) {
          return new Response(
            JSON.stringify({
              success: false,
              error: error.message,
              fallback: true,
              lastDataTimestamp: latestData.timestamp,
              message: "Failed to fetch new data, but existing data is available",
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
      }
    } catch (fallbackError) {
      console.error("Error checking fallback data:", fallbackError);
    }
    
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