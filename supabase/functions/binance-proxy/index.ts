import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

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
    // Parse request body to get endpoint and parameters
    const { endpoint, params } = await req.json();

    if (!endpoint) {
      throw new Error("Missing endpoint parameter");
    }

    // Base URL for Binance Futures API
    const baseUrl = "https://fapi.binance.com";
    
    // Construct URL with parameters
    let url = `${baseUrl}${endpoint}`;
    
    if (params) {
      const queryParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      }
      
      if (queryParams.toString()) {
        url += `?${queryParams.toString()}`;
      }
    }
    
    console.log(`Fetching data from Binance API: ${url}`);
    
    // Make request to Binance API
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      // Add a timeout to avoid hanging
      signal: AbortSignal.timeout(5000)
    });
    
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status} - ${await response.text()}`);
    }
    
    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
      status: 200,
    });
  } catch (error) {
    console.error("Error in binance-proxy function:", error);
    
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