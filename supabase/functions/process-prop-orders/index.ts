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

    console.log("Starting prop firm order processing...");
    
    // Log all open orders to debug
    const { data: openOrders, error: openOrdersError } = await supabase
      .from('prop_orders')
      .select('*')
      .eq('status', 'open');
      
    if (openOrdersError) {
      console.error("Error fetching open orders:", openOrdersError);
    } else {
      console.log(`Found ${openOrders?.length || 0} open prop orders`);
      
      // Log each order's type
      openOrders?.forEach(order => {
        console.log(`Order ${order.id} - Type: ${order.type}, Side: ${order.side}, Symbol: ${order.symbol}`);
      });
    }
    
    // Call the run_prop_background_processes function
    const { error } = await supabase.rpc('run_prop_background_processes');
    
    if (error) {
      console.error("Error running prop background processes:", error);
      throw new Error(`Failed to run prop background processes: ${error.message}`);
    }
    
    console.log("Prop firm order processing completed successfully");

    // Get some stats for the response
    const { data: activePositions, error: positionsError } = await supabase
      .from('prop_positions')
      .select('count(*)', { count: 'exact' })
      .eq('is_open', true);
      
    if (positionsError) {
      console.error("Error getting active positions count:", positionsError);
    }
    
    const { data: pendingOrders, error: ordersError } = await supabase
      .from('prop_orders')
      .select('count(*)', { count: 'exact' })
      .eq('status', 'open');
      
    if (ordersError) {
      console.error("Error getting pending orders count:", ordersError);
    }
    
    // Get recent logs, including any error logs
    const { data: recentLogs, error: logsError } = await supabase
      .from('prop_logs')
      .select('action, details, created_at')
      .or('action.eq.order_execution_failed,action.eq.order_executed,action.eq.limit_order_executed,action.eq.stop_order_executed')
      .order('created_at', { ascending: false })
      .limit(10);
      
    if (logsError) {
      console.error("Error getting recent logs:", logsError);
    }

    // Check for any execution failures
    const executionFailures = recentLogs?.filter(log => log.action === 'order_execution_failed') || [];
    if (executionFailures.length > 0) {
      console.warn("Found execution failures:", executionFailures);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Prop firm order processing executed successfully",
        stats: {
          activePositions: activePositions?.[0]?.count || 0,
          pendingOrders: pendingOrders?.[0]?.count || 0,
          recentActions: recentLogs?.map(log => ({
            action: log.action,
            timestamp: log.created_at,
            details: log.details
          })) || [],
          executionFailures: executionFailures.length > 0 ? executionFailures : null
        },
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
    console.error("Error in process-prop-orders function:", error);
    
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