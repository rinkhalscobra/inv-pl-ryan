import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Helper to get reward amount based on challenge ID
const getRewardAmount = (challengeId: string): number => {
  switch (challengeId) {
    case 'starter': return 300;
    case 'bronze': return 600;
    case 'silver': return 1200;
    case 'gold': return 2400;
    case 'platinum': return 5000;
    case 'diamond': return 10000;
    default: return 0;
  }
};

// Helper to get entry fee refund amount based on challenge ID
const getEntryFeeRefund = (challengeId: string): number => {
  switch (challengeId) {
    case 'starter': return 150;
    case 'bronze': return 300;
    case 'silver': return 600;
    case 'gold': return 1200;
    case 'platinum': return 2400;
    case 'diamond': return 4800;
    default: return 0;
  }
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

    console.log("Starting prop challenge lifecycle management...");
    
    const now = new Date();

    // Fetch all active challenges from robot_states
    const { data: activeChallenges, error: fetchError } = await supabase
      .from('robot_states')
      .select('*')
      .eq('challenge_status', 'active')
      .not('active_challenge_id', 'is', null);
      
    if (fetchError) {
      console.error("Error fetching active challenges from robot_states:", fetchError);
      throw new Error(`Failed to fetch active challenges from robot_states: ${fetchError.message}`);
    }
    
    console.log(`Found ${activeChallenges?.length || 0} active challenges to process`);
    
    let processedCount = 0;
    let completedCount = 0;
    let failedCount = 0;

    if (activeChallenges && activeChallenges.length > 0) {
      for (const challenge of activeChallenges) {
        processedCount++;
        let newStatus = challenge.challenge_status;
        let resultMessage = '';

        // Calculate profit directly from challenge account balance vs initial balance
        const currentBalance = parseFloat(challenge.challenge_account_balance) || 0;
        const startingBalance = parseFloat(challenge.challenge_initial_balance) || 0;
        const maxDrawdown = parseFloat(challenge.challenge_max_drawdown) || 0;
        const profitTarget = parseFloat(challenge.challenge_profit_target) || 0;
        
        // Fetch unrealized PnL from open positions to calculate true equity
        const { data: openPositions, error: positionsError } = await supabase
          .from('prop_positions')
          .select('unrealized_pnl')
          .eq('user_id', challenge.user_id)
          .eq('challenge_id', challenge.active_challenge_id)
          .eq('is_open', true);
          
        if (positionsError) {
          console.error(`Error fetching open positions for user ${challenge.user_id}:`, positionsError);
        }
        
        // Calculate total unrealized PnL from open positions
        const totalUnrealizedPnl = openPositions?.reduce((sum, position) => {
          return sum + (parseFloat(position.unrealized_pnl) || 0);
        }, 0) || 0;
        
        // Calculate current equity (realized balance + unrealized PnL)
        const currentEquity = currentBalance + totalUnrealizedPnl;
        const effectiveProfit = currentEquity - startingBalance;
        
        console.log(`Challenge for user ${challenge.user_id}: Current Balance=${currentBalance}, Unrealized PnL=${totalUnrealizedPnl}, Current Equity=${currentEquity}, Starting Balance=${startingBalance}, Effective Profit=${effectiveProfit}, Max Drawdown=${maxDrawdown}, Profit Target=${profitTarget}`);
        
        // Calculate drawdown exactly as in PropFirmChallengePage component
        // Drawdown is 0 if we're in profit, otherwise it's the absolute value of the loss
        const currentDrawdownDollars = effectiveProfit < 0 ? Math.abs(effectiveProfit) : 0;
        
        console.log(`Drawdown=${currentDrawdownDollars}, Max Allowed=${maxDrawdown}, Target Profit=${profitTarget}`);

        // IMPORTANT: Check for Profit Target FIRST - this should take precedence over drawdown
        if (effectiveProfit >= profitTarget) {
          newStatus = 'won';
          resultMessage = 'Profit target reached';
          completedCount++;
        }
        // Only check for drawdown if the challenge hasn't already been won
        else if (currentDrawdownDollars >= maxDrawdown) {
          newStatus = 'lost';
          resultMessage = `Max drawdown limit hit (${currentDrawdownDollars.toFixed(2)} >= ${maxDrawdown.toFixed(2)})`;
          failedCount++;
        } 
        // 3. Check for Time Limit Expiration
        else if (challenge.challenge_start_date && challenge.challenge_time_limit && newStatus === 'active') {
          const startDate = new Date(challenge.challenge_start_date);
          const endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + parseInt(challenge.challenge_time_limit));
          
          if (endDate <= now) {
            newStatus = 'expired';
            resultMessage = 'Time limit expired';
            failedCount++;
          }
        }

        // Skip if status hasn't changed
        if (newStatus === challenge.challenge_status) {
          console.log(`No status change for challenge of user ${challenge.user_id}, skipping update`);
          continue;
        }

        // Before updating status, properly close all open positions to ensure accurate final balance
        console.log(`Challenge status changing from ${challenge.challenge_status} to ${newStatus}, closing all open positions...`);
        
        try {
          // Get all open positions for this challenge
          const { data: openPositions, error: positionsError } = await supabase
            .from('prop_positions')
            .select('id, symbol, current_price')
            .eq('user_id', challenge.user_id)
            .eq('challenge_id', challenge.active_challenge_id)
            .eq('is_open', true);
            
          if (positionsError) {
            console.error(`Error fetching open positions for user ${challenge.user_id}:`, positionsError);
          } else if (openPositions && openPositions.length > 0) {
            console.log(`Closing ${openPositions.length} open positions for challenge finalization...`);
            
            // Close each position using the proper RPC function
            for (const position of openPositions) {
              try {
                // Get latest market price for this symbol
                const { data: marketData, error: marketError } = await supabase
                  .from('market_data')
                  .select('price')
                  .eq('symbol', position.symbol)
                  .order('timestamp', { ascending: false })
                  .limit(1)
                  .single();
                  
                const exitPrice = marketError || !marketData ? position.current_price : marketData.price;
                
                console.log(`Closing position ${position.id} at price ${exitPrice}`);
                
                // Call the close_prop_position RPC function
                const { error: closeError } = await supabase.rpc('close_prop_position', {
                  position_id: position.id,
                  exit_price: exitPrice
                });
                
                if (closeError) {
                  console.error(`Error closing position ${position.id}:`, closeError);
                } else {
                  console.log(`Successfully closed position ${position.id}`);
                }
              } catch (positionError) {
                console.error(`Error processing position ${position.id}:`, positionError);
              }
            }
          }
          
          // Cancel all open orders
          const { error: cancelOrdersError } = await supabase
            .from('prop_orders')
            .update({ status: 'cancelled' })
            .eq('user_id', challenge.user_id)
            .eq('challenge_id', challenge.active_challenge_id)
            .eq('status', 'open');
            
          if (cancelOrdersError) {
            console.error(`Error cancelling orders for user ${challenge.user_id}:`, cancelOrdersError);
          } else {
            console.log(`Cancelled all open orders for user ${challenge.user_id}`);
          }
        } catch (cleanupError) {
          console.error(`Error during position cleanup for user ${challenge.user_id}:`, cleanupError);
        }
        
        // Get updated balance after position closures
        const { data: updatedChallenge, error: balanceError } = await supabase
          .from('robot_states')
          .select('challenge_account_balance')
          .eq('id', challenge.id)
          .single();
          
        const finalBalance = balanceError ? currentEquity : parseFloat(updatedChallenge.challenge_account_balance) || 0;
        const finalProfit = finalBalance - startingBalance;
        
        console.log(`Final balance after position closures: ${finalBalance}, Final profit: ${finalProfit}`);
        // Update robot_states with new challenge status
        const { error: updateError } = await supabase
          .from('robot_states')
          .update({ 
            challenge_status: newStatus,
            updated_at: now.toISOString()
          })
          .eq('id', challenge.id);
          
        if (updateError) {
          console.error(`Error updating challenge status for user ${challenge.user_id}:`, updateError);
          continue;
        }

        // Log the event
        await supabase
          .from('prop_logs')
          .insert({
            user_id: challenge.user_id,
            challenge_id: challenge.active_challenge_id,
            action: `challenge_${newStatus}`,
            details: {
              reason: resultMessage,
              current_equity: currentEquity,
              unrealized_pnl: totalUnrealizedPnl,
              final_balance: finalBalance,
              profit: finalProfit,
              drawdown_dollars: currentDrawdownDollars,
              target_profit: profitTarget,
              max_drawdown_limit: maxDrawdown,
              processed_at: now.toISOString()
            }
          });

        // If challenge is won, credit reward
        if (newStatus === 'won') {
          // Calculate total reward (reward amount + entry fee refund)
          const rewardAmount = getRewardAmount(challenge.active_challenge_id);
          const entryFeeRefund = getEntryFeeRefund(challenge.active_challenge_id);
          const totalReward = rewardAmount + entryFeeRefund;
          
          if (totalReward > 0) {
            // Credit reward to user's main USDT balance
            const { error: balanceUpdateError } = await supabase.rpc('add_usdt_balance', {
              p_user_id: challenge.user_id,
              p_amount: totalReward
            });

            if (balanceUpdateError) {
              console.error(`Error crediting reward to user ${challenge.user_id}:`, balanceUpdateError);
              await supabase.from('prop_logs').insert({
                user_id: challenge.user_id,
                challenge_id: challenge.active_challenge_id,
                action: 'reward_failed',
                details: {
                  reward_amount: rewardAmount,
                  entry_fee_refund: entryFeeRefund,
                  total_reward: totalReward, 
                  error: balanceUpdateError.message
                }
              });
            } else {
              console.log(`Successfully credited ${totalReward} USDT to user ${challenge.user_id} for challenge ${challenge.active_challenge_id}`);
              
              // Add transaction record for reward
              await supabase.from('transactions').insert({
                user_id: challenge.user_id,
                type: 'challenge_reward', 
                amount: rewardAmount,
                description: `Reward for completing ${challenge.active_challenge_id} challenge`,
                status: 'completed'
              });
              
              // Add transaction record for entry fee refund
              await supabase.from('transactions').insert({
                user_id: challenge.user_id,
                type: 'challenge_reward', 
                amount: entryFeeRefund,
                description: `Entry fee refund for ${challenge.active_challenge_id} challenge`,
                status: 'completed'
              });
              
              // Log the reward
              await supabase.from('prop_logs').insert({
                user_id: challenge.user_id,
                challenge_id: challenge.active_challenge_id, 
                action: 'reward_credited',
                details: {
                  reward_amount: rewardAmount,
                  entry_fee_refund: entryFeeRefund,
                  total_reward: totalReward
                }
              });
            }
          }
        } else if (newStatus === 'cancelled') {
          // For cancelled challenges, we need to check if there's a database trigger
          // that's automatically adding the balance back to the user's account
          
          console.log(`Challenge ${challenge.active_challenge_id} for user ${challenge.user_id} was cancelled`);
          console.log(`Current challenge balance: ${challenge.challenge_account_balance}`);
          
          // Log the cancellation to help with debugging
          await supabase.from('system_logs').insert({
            action: 'challenge_cancelled_lifecycle',
            details: JSON.stringify({
              user_id: challenge.user_id,
              challenge_id: challenge.active_challenge_id,
              challenge_balance: challenge.challenge_account_balance,
              challenge_initial_balance: challenge.challenge_initial_balance,
              timestamp: now.toISOString()
            })
          });
        }
        
        // Log the final cleanup action
        await supabase
          .from('prop_logs')
          .insert({ 
            user_id: challenge.user_id,
            challenge_id: challenge.active_challenge_id,
            action: 'challenge_finalized',
            details: {
              status: newStatus,
              final_balance: finalBalance,
              final_profit: finalProfit,
              finalized_at: now.toISOString()
            }
          });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Prop challenge lifecycle processed. Checked: ${processedCount}, Completed: ${completedCount}, Failed: ${failedCount}`,
        timestamp: now.toISOString()
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
    console.error("Error in process-prop-challenge-lifecycle function:", error);
    
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