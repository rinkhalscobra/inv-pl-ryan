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

    // Parse request body to get order ID
    const { order_id } = await req.json();

    if (!order_id) {
      throw new Error("Order ID is required");
    }

    console.log(`Checking and executing futures order: ${order_id}`);
    
    // Get the order details
    const { data: orderData, error: orderError } = await supabase
      .from('futures_orders')
      .select('*')
      .eq('id', order_id)
      .single();
      
    if (orderError) {
      throw new Error(`Failed to fetch order: ${orderError.message}`);
    }
    
    if (!orderData) {
      throw new Error("Order not found");
    }
    
    // Get the latest market price for the symbol
    const { data: marketData, error: marketError } = await supabase
      .from('market_data')
      .select('price')
      .eq('symbol', orderData.symbol)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();
      
    if (marketError) {
      throw new Error(`Failed to fetch market data: ${marketError.message}`);
    }
    
    const currentPrice = marketData.price;
    
    // Log the check
    await supabase
      .from('system_logs')
      .insert({
        action: 'check_futures_order',
        details: `Order ID: ${order_id}, Type: ${orderData.type}, Side: ${orderData.side}, Price: ${orderData.price}, Current Price: ${currentPrice}`
      });
    
    // Check if the order should be executed
    let shouldExecute = false;
    
    if (orderData.type === 'limit') {
      // For buy orders: execute when current price <= limit price
      // For sell orders: execute when current price >= limit price
      shouldExecute = (orderData.side === 'buy' && currentPrice <= orderData.price) ||
                      (orderData.side === 'sell' && currentPrice >= orderData.price);
    } else if (orderData.type === 'stop') {
      // For buy stop orders: execute when current price >= stop price
      // For sell stop orders: execute when current price <= stop price
      shouldExecute = (orderData.side === 'buy' && currentPrice >= orderData.price) ||
                      (orderData.side === 'sell' && currentPrice <= orderData.price);
    } else if (orderData.type === 'market') {
      // Market orders should always execute
      shouldExecute = true;
    }
    
    // Log the decision
    await supabase
      .from('system_logs')
      .insert({
        action: 'futures_order_execution_decision',
        details: `Order ID: ${order_id}, Should Execute: ${shouldExecute}, Current Price: ${currentPrice}, Order Price: ${orderData.price}`
      });
    
    // If the order should be executed, call the process_futures_orders function
    if (shouldExecute) {
      const { error: rpcError } = await supabase.rpc('process_futures_orders');
      
      if (rpcError) {
        throw new Error(`Failed to process orders: ${rpcError.message}`);
      }
      
      // Check if the order was actually executed
      const { data: updatedOrder, error: checkError } = await supabase
        .from('futures_orders')
        .select('status, filled_at')
        .eq('id', order_id)
        .single();
        
      if (checkError) {
        throw new Error(`Failed to check order status: ${checkError.message}`);
      }
      
      if (updatedOrder.status === 'filled') {
        return new Response(
          JSON.stringify({
            success: true,
            message: `Order ${order_id} was successfully executed at ${currentPrice}`,
            executed: true,
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
      } else {
        return new Response(
          JSON.stringify({
            success: true,
            message: `Order ${order_id} was processed but not executed. Current status: ${updatedOrder.status}`,
            executed: false,
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
      }
    } else {
      return new Response(
        JSON.stringify({
          success: true,
          message: `Order ${order_id} conditions not met. Current price: ${currentPrice}, Order price: ${orderData.price}`,
          executed: false,
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
    }
  } catch (error) {
    console.error("Error in check-and-execute-futures-order function:", error);
    
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