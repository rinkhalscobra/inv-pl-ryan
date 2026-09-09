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

    // Parse request body to get symbols
    let symbols: string[] = [];
    
    try {
      const requestData = await req.json();
      symbols = requestData.symbols || [];
    } catch (parseError) {
      console.error("Error parsing request body:", parseError);
      // If no symbols provided, fetch all symbols from market_data
      const { data: marketData, error: marketDataError } = await supabase
        .from('market_data')
        .select('symbol')
        .order('symbol');
        
      if (marketDataError) {
        throw new Error(`Failed to fetch market data symbols: ${marketDataError.message}`);
      }
      
      symbols = marketData?.map(item => item.symbol) || [];
    }
    
    if (symbols.length === 0) {
      throw new Error("No symbols provided and none found in database");
    }
    
    console.log(`Fetching latest prices for ${symbols.length} symbols from Binance Futures API...`);
    
    // Prepare results array
    const results: { symbol: string; price: number; timestamp: string }[] = [];
    
    // Batch symbols into groups of 20 to avoid rate limits
    const batchSize = 20;
    const batches = [];
    
    for (let i = 0; i < symbols.length; i += batchSize) {
      batches.push(symbols.slice(i, i + batchSize));
    }
    
    // Process each batch
    for (const batch of batches) {
      try {
        // Fetch prices for all symbols in batch in parallel
        const pricePromises = batch.map(async (symbol) => {
          try {
            // Use the proxy-api Edge Function to avoid CORS issues with increased timeout
            const supabaseFunctionsUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/proxy-api`;
            
            // Create AbortController with increased timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // Increased from default to 30 seconds
            
            const response = await fetch(supabaseFunctionsUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
              },
              body: JSON.stringify({
                url: `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`,
                method: 'GET'
              }),
              signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
              const errorText = await response.text();
              console.error(`Failed to fetch price for ${symbol}: ${errorText}`);
              return null;
            }

            const data = await response.json();
            
            if (data && data.symbol && data.price) {
              return {
                symbol: data.symbol,
                price: parseFloat(data.price),
                timestamp: new Date().toISOString()
              };
            }
            
            return null;
          } catch (symbolError) {
            console.error(`Error fetching price for ${symbol}:`, symbolError);
            return null;
          }
        });
        
        // Wait for all price fetches to complete
        const priceResults = await Promise.all(pricePromises);
        
        // Filter out null results and add to results array
        results.push(...priceResults.filter(Boolean));
        
        // Add a small delay between batches to avoid rate limits
        if (batches.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (batchError) {
        console.error(`Error processing batch:`, batchError);
      }
    }
    
    console.log(`Successfully fetched prices for ${results.length} symbols`);
    
    // Update market_data table with the latest prices
    if (results.length > 0) {
      // Process in smaller batches to avoid payload size limits
      const updateBatchSize = 50;
      let successCount = 0;
      
      for (let i = 0; i < results.length; i += updateBatchSize) {
        const updateBatch = results.slice(i, i + updateBatchSize);
        
        try {
          const { error: upsertError } = await supabase
            .from('market_data')
            .upsert(
              updateBatch.map(item => ({
                symbol: item.symbol,
                price: item.price,
                timestamp: item.timestamp
              })),
              {
                onConflict: 'symbol',
                ignoreDuplicates: false
              }
            );
          
          if (upsertError) {
            console.error(`Error upserting batch ${i / updateBatchSize + 1}:`, upsertError);
          } else {
            successCount += updateBatch.length;
            console.log(`Successfully upserted batch ${i / updateBatchSize + 1} (${updateBatch.length} prices)`);
          }
        } catch (updateError) {
          console.error(`Exception during batch ${i / updateBatchSize + 1} upsert:`, updateError);
        }
      }
      
      console.log(`Updated market_data table with ${successCount} prices`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully fetched and updated prices for ${results.length} symbols`,
        data: results,
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
    console.error("Error in fetch-latest-futures-prices function:", error);
    
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