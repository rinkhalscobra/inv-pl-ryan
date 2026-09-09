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
    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting trading logic processing...");

    // First, call the execute-futures-orders Edge Function to process limit orders
    const executeFuturesUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/execute-futures-orders`;

    const futuresResponse = await fetch(executeFuturesUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
      },
    });

    if (!futuresResponse.ok) {
      const errorText = await futuresResponse.text();
      console.warn(`Warning: Futures orders processing returned: ${futuresResponse.status} - ${errorText}`);
      // Continue with other processing
    } else {
      const futuresResult = await futuresResponse.json();
      console.log("Futures orders processing result:", futuresResult);
    }

    // Check TP/SL on open positions
    const checkTPSLUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/check-tp-sl-positions`;

    const tpslResponse = await fetch(checkTPSLUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
      },
    });

    if (!tpslResponse.ok) {
      const errorText = await tpslResponse.text();
      console.warn(`Warning: TP/SL checking returned: ${tpslResponse.status} - ${errorText}`);
      // Continue with other processing
    } else {
      const tpslResult = await tpslResponse.json();
      console.log("TP/SL checking result:", tpslResult);
    }
    
    // Then call the run_background_processes RPC function for other trading logic
    const { error } = await supabase.rpc('run_background_processes');
    
    if (error) {
      console.error("Error running background processes:", error);
      throw new Error(`Failed to run background processes: ${error.message}`);
    }
    
    console.log("Trading logic processing completed successfully.");

    return new Response(
      JSON.stringify({
        success: true,
        message: "Trading logic executed successfully",
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
    console.error("Error in process-trading-logic function:", error);
    
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