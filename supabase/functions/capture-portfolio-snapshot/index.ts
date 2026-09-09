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

    console.log("Starting portfolio snapshot capture...");
    
    // Get current date (UTC)
    const today = new Date();
    const todayFormatted = today.toISOString().split('T')[0];
    
    // Get latest BTC price
    const { data: btcPriceData, error: btcPriceError } = await supabase
      .from('market_data')
      .select('price')
      .eq('symbol', 'BTCUSDT')
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();
      
    if (btcPriceError) {
      console.error("Error fetching BTC price:", btcPriceError);
      throw new Error(`Failed to fetch BTC price: ${btcPriceError.message}`);
    }
    
    const btcPrice = btcPriceData.price;
    console.log(`Current BTC price: ${btcPrice}`);
    
    // Get all non-demo users
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id')
      .eq('is_demo', false);
      
    if (usersError) {
      console.error("Error fetching users:", usersError);
      throw new Error(`Failed to fetch users: ${usersError.message}`);
    }
    
    console.log(`Found ${users.length} non-demo users`);
    
    let successCount = 0;
    let errorCount = 0;
    
    // Process each user
    for (const user of users) {
      try {
        // Get user's balances
        const { data: balanceData, error: balanceError } = await supabase
          .from('balances')
          .select('usdt_balance, btc_balance')
          .eq('user_id', user.id)
          .single();
          
        if (balanceError) {
          console.error(`Error fetching balance for user ${user.id}:`, balanceError);
          errorCount++;
          continue;
        }
        
        const usdtBalance = parseFloat(balanceData.usdt_balance);
        const btcBalance = parseFloat(balanceData.btc_balance);

        const { data: robotState } = await supabase
          .from('robot_states')
          .select('allocated_balance')
          .eq('user_id', user.id)
          .maybeSingle();

        const robotAllocatedBalance = parseFloat(robotState?.allocated_balance?.toString() || '0') || 0;

        const btcValue = btcBalance * btcPrice;
        const totalValue = usdtBalance + btcValue + robotAllocatedBalance;
        
        // Check if a snapshot already exists for this user and date
        const { data: existingSnapshot, error: checkError } = await supabase
          .from('portfolio_snapshots')
          .select('id')
          .eq('user_id', user.id)
          .eq('snapshot_date', todayFormatted)
          .limit(1);
          
        if (checkError) {
          console.error(`Error checking existing snapshot for user ${user.id}:`, checkError);
          errorCount++;
          continue;
        }
        
        if (existingSnapshot && existingSnapshot.length > 0) {
          // Update existing snapshot
          const { error: updateError } = await supabase
            .from('portfolio_snapshots')
            .update({
              total_value: totalValue,
              usdt_balance: usdtBalance,
              btc_balance: btcBalance,
              btc_price: btcPrice
            })
            .eq('id', existingSnapshot[0].id);
            
          if (updateError) {
            console.error(`Error updating snapshot for user ${user.id}:`, updateError);
            errorCount++;
            continue;
          }
          
          console.log(`Updated snapshot for user ${user.id}`);
        } else {
          // Create new snapshot
          const { error: insertError } = await supabase
            .from('portfolio_snapshots')
            .insert([{
              user_id: user.id,
              snapshot_date: todayFormatted,
              total_value: totalValue,
              usdt_balance: usdtBalance,
              btc_balance: btcBalance,
              btc_price: btcPrice
            }]);
            
          if (insertError) {
            console.error(`Error creating snapshot for user ${user.id}:`, insertError);
            errorCount++;
            continue;
          }
          
          console.log(`Created snapshot for user ${user.id}`);
        }
        
        successCount++;
      } catch (userError) {
        console.error(`Error processing user ${user.id}:`, userError);
        errorCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Portfolio snapshots captured: ${successCount} successful, ${errorCount} failed`,
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
    console.error("Error in capture-portfolio-snapshot function:", error);
    
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