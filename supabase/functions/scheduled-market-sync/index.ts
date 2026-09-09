import { createClient } from "npm:@supabase/supabase-js@2.39.0";

// This function is designed to be run on a schedule via Supabase cron jobs
// It will sync market data from Bybit API to the database once every 5 minutes

console.log("Starting scheduled market data sync...");

// Create Supabase client with service role key
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables");
  Deno.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

try {
  console.log("Fetching market data from Bybit API...");
  
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
    timestamp: new Date().toISOString()
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

  console.log(`✅ Successfully synced ${successCount} market data entries from Bybit`);
} catch (error) {
  console.error("❌ Error in scheduled market data sync:", error);
}