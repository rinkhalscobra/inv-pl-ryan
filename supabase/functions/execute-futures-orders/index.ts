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

    console.log("Starting futures order execution check...");
    
    // Log the start of the check
    await supabase
      .from('system_logs')
      .insert({
        action: 'limit_order_check',
        details: `Starting limit order check at ${new Date().toISOString()}`
      });
    
    // Execute the function to process pending limit orders
    const { data, error } = await supabase
      .rpc('execute_pending_limit_orders');
    
    if (error) {
      console.error("Error executing pending limit orders:", error);
      throw error;
    }
    
    console.log("Futures order execution completed:", data);
    
    // Log the completion
    await supabase
      .from('system_logs')
      .insert({
        action: 'limit_order_check_completed',
        details: `Completed limit order check: ${JSON.stringify(data)}`
      });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Futures order execution completed",
        data,
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
    console.error("Error in execute-futures-orders function:", error);
    
    // Log the error
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      
      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        await supabase
          .from('system_logs')
          .insert({
            action: 'limit_order_check_error',
            details: `Error during limit order check: ${error.message}`
          });
      }
    } catch (logError) {
      console.error("Error logging to system_logs:", logError);
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