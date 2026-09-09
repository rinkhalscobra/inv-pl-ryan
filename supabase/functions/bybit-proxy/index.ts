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
    const requestBody = await req.json().catch(() => ({}));
    const { endpoint, params } = requestBody;

    if (!endpoint) {
      throw new Error("Missing endpoint parameter");
    }

    // Base URL for Bybit API - updated to V5 API
    const baseUrl = "https://api.bybit.com";
    
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
    
    console.log(`Fetching data from Bybit API: ${url}`);
    
    // Make request to Bybit API with improved error handling and increased timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // Increased from 10 to 30 seconds
    
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Supabase-Edge-Function/1.0',
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`Bybit API error: ${response.status} - ${errorText}`);
        throw new Error(`Bybit API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      
      // Log successful response for debugging
      console.log(`Successfully fetched data from Bybit API for endpoint: ${endpoint}`);
      
      return new Response(JSON.stringify(data), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 200,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        throw new Error('Request timeout - Bybit API took too long to respond (30s timeout)');
      }
      
      throw fetchError;
    }
  } catch (error) {
    console.error("Error in bybit-proxy function:", error);
    
    // Provide more detailed error information
    const errorResponse = {
      success: false,
      error: error.message || 'Unknown error occurred',
      timestamp: new Date().toISOString(),
      details: error.name || 'UnknownError'
    };
    
    return new Response(
      JSON.stringify(errorResponse),
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