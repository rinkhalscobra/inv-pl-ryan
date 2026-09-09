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
    // Initialize Supabase client with service role key for admin access
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    console.log("Starting liquidation price recalculation...");
    
    // Step 1: Query all open futures positions
    const { data: positions, error: positionsError } = await supabase
      .from('futures_positions')
      .select(`
        id,
        user_id,
        symbol,
        side,
        entry_price,
        amount,
        leverage,
        margin_type,
        margin,
        liquidation_price
      `)
      .eq('is_open', true);
      
    if (positionsError) {
      console.error("Error fetching open positions:", positionsError);
      return {
        success: false,
        error: positionsError.message,
        timestamp: new Date().toISOString()
      };
    }
    
    if (!positions || positions.length === 0) {
      console.log("No open positions found");
      return {
        success: true,
        total_positions_checked: 0,
        updated_count: 0,
        timestamp: new Date().toISOString()
      };
    }
    
    console.log(`Found ${positions.length} open positions to check`);
    
    // Step 2: Get current market prices for all symbols
    const symbols = [...new Set(positions.map(p => p.symbol))];
    
    const { data: marketData, error: marketError } = await supabase
      .from('market_data')
      .select('symbol, price')
      .in('symbol', symbols)
      .filter('timestamp', 'gt', new Date(Date.now() - 15 * 1000).toISOString()); // Last 15 seconds
      
    if (marketError) {
      console.error("Error fetching market data:", marketError);
      return {
        success: false,
        error: marketError.message,
        timestamp: new Date().toISOString()
      };
    }
    
    // Create a map of symbol to price for quick lookup
    const priceMap = new Map();
    marketData?.forEach(data => {
      priceMap.set(data.symbol, data.price);
    });
    
    // Step 3: Get user balances for cross margin calculations
    const userIds = [...new Set(positions.map(p => p.user_id))];
    
    const { data: balances, error: balancesError } = await supabase
      .from('balances')
      .select('user_id, usdt_balance')
      .in('user_id', userIds);
      
    if (balancesError) {
      console.error("Error fetching user balances:", balancesError);
      return {
        success: false,
        error: balancesError.message,
        timestamp: new Date().toISOString()
      };
    }
    
    // Create a map of user_id to balance for quick lookup
    const balanceMap = new Map();
    balances?.forEach(balance => {
      balanceMap.set(balance.user_id, balance.usdt_balance);
    });
    
    // Step 4: Calculate new liquidation prices and update positions
    let updatedCount = 0;
    const logs = [];
    
    for (const position of positions) {
      try {
        const currentPrice = priceMap.get(position.symbol);
        if (!currentPrice) {
          console.warn(`No recent price data for ${position.symbol}, skipping position ${position.id}`);
          continue;
        }
        
        const userBalance = balanceMap.get(position.user_id) || 0;
        
        // Calculate new liquidation price based on margin type
        let newLiquidationPrice;
        
        if (position.margin_type === 'isolated') {
          // For isolated margin, liquidation happens when ROI reaches -100%
          if (position.side === 'long') {
            // Long position: liquidation when price drops by (1/leverage) of entry price
            newLiquidationPrice = position.entry_price * (1 - 1 / position.leverage);
          } else {
            // Short position: liquidation when price rises by (1/leverage) of entry price
            newLiquidationPrice = position.entry_price * (1 + 1 / position.leverage);
          }
        } else {
          // For cross margin, liquidation happens when total account equity reaches zero
          if (position.side === 'long') {
            // Long position: liquidation when price drops enough to wipe out entire balance
            newLiquidationPrice = position.entry_price - ((position.entry_price * position.margin * position.leverage) / (position.margin * position.leverage + userBalance));
            // Ensure liquidation price is not negative
            newLiquidationPrice = Math.max(0, newLiquidationPrice);
          } else {
            // Short position: liquidation when price rises enough to wipe out entire balance
            newLiquidationPrice = position.entry_price + ((position.entry_price * position.margin * position.leverage) / (position.margin * position.leverage + userBalance));
          }
        }
        
        // Only update if the liquidation price has changed significantly
        if (Math.abs(newLiquidationPrice - position.liquidation_price) > 0.01) {
          const { error: updateError } = await supabase
            .from('futures_positions')
            .update({ liquidation_price: newLiquidationPrice })
            .eq('id', position.id);
            
          if (updateError) {
            console.error(`Error updating liquidation price for position ${position.id}:`, updateError);
            continue;
          }
          
          updatedCount++;
          
          // Log the update
          logs.push({
            position_id: position.id,
            symbol: position.symbol,
            old_liq_price: position.liquidation_price,
            new_liq_price: newLiquidationPrice,
            margin_type: position.margin_type
          });
          
          // Add to system_logs table
          await supabase
            .from('system_logs')
            .insert({
              action: 'liq_price_updated',
              details: JSON.stringify({
                position_id: position.id,
                symbol: position.symbol,
                old_liq_price: position.liquidation_price,
                new_liq_price: newLiquidationPrice,
                margin_type: position.margin_type
              })
            });
        }
      } catch (error) {
        console.error(`Error processing position ${position.id}:`, error);
      }
    }
    
    console.log(`Updated liquidation prices for ${updatedCount} positions`);
    
    // Return summary
    return new Response(
      JSON.stringify({
        success: true,
        total_positions_checked: positions.length,
        updated_count: updatedCount,
        updates: logs,
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
    console.error("Error in recalculate-liquidation-prices function:", error);
    
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