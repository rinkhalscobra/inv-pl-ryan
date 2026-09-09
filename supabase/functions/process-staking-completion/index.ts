import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface UserStake {
  id: string;
  user_id: string;
  asset_symbol: string;
  staked_amount: number;
  apy_rate: number;
  start_date: string;
  end_date: string;
  earned_amount: number;
  status: 'active' | 'completed' | 'cancelled';
}

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

    console.log("Starting staking completion process...");
    
    // Get current time
    const now = new Date();
    
    // Find completed stakes that haven't been processed yet
    const { data: completedStakes, error: stakesError } = await supabase
      .from('user_stakes')
      .select('*')
      .eq('status', 'active')
      .lte('end_date', now.toISOString())
      .order('end_date', { ascending: true });
      
    if (stakesError) {
      console.error("Error fetching completed stakes:", stakesError);
      throw new Error(`Failed to fetch completed stakes: ${stakesError.message}`);
    }
    
    console.log(`Found ${completedStakes?.length || 0} completed stakes to process`);
    
    if (!completedStakes || completedStakes.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No completed stakes to process",
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
    
    let successCount = 0;
    let errorCount = 0;
    
    // Process each completed stake
    for (const stake of completedStakes as UserStake[]) {
      try {
        console.log(`Processing stake ${stake.id} for user ${stake.user_id}`);
        
        // Calculate earned amount based on APY, staked amount, and duration
        const startDate = new Date(stake.start_date);
        const endDate = new Date(stake.end_date);
        const durationDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
        
        // Calculate daily rate from APY
        const dailyRate = stake.apy_rate / 365 / 100;
        
        // Calculate earned amount
        const earned = stake.staked_amount * dailyRate * durationDays;
        
        console.log(`Calculated earnings: ${earned.toFixed(8)} ${stake.asset_symbol} (${durationDays.toFixed(2)} days at ${stake.apy_rate}% APY)`);
        
        // Start a transaction
        const { error: transactionError } = await supabase.rpc('process_stake_completion', {
          stake_id: stake.id,
          earned_amount: earned
        });
        
        if (transactionError) {
          console.error(`Error processing stake ${stake.id}:`, transactionError);
          errorCount++;
          continue;
        }
        
        successCount++;
        console.log(`Successfully processed stake ${stake.id}`);
      } catch (stakeError) {
        console.error(`Error processing stake ${stake.id}:`, stakeError);
        errorCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${successCount} stakes successfully, ${errorCount} failed`,
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
    console.error("Error in process-staking-completion function:", error);
    
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