import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

    // Parse request body
    const { user_id, challenge_id } = await req.json();

    if (!user_id || !challenge_id) {
      throw new Error("User ID and Challenge ID are required");
    }

    console.log(`Cancelling challenge ${challenge_id} for user ${user_id} WITHOUT balance transfer`);
    
    // Step 1: Log the action to help with debugging
    console.log(`Step 1: Logging challenge cancellation action...`);
    await supabase
      .from('system_logs')
      .insert({
        action: 'cancel_challenge_edge_function',
        details: `Starting challenge ${challenge_id} cancellation for user ${user_id} WITHOUT balance transfer`
      });

    // Step 2: Call the finalize_challenge_cancellation function (this will close positions and create history)
    console.log(`Step 2: Calling finalize_challenge_cancellation RPC to close positions and cancel challenge...`);
    const { data, error: updateError } = await supabase.rpc('finalize_challenge_cancellation', {
      p_user_id: user_id,
      p_challenge_id: challenge_id
    });
    
    if (updateError) {
      console.error(`ERROR: finalize_challenge_cancellation failed:`, {
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
        code: updateError.code
      });
      throw new Error(`Failed to cancel challenge: ${updateError.message}`);
    } else {
      console.log(`SUCCESS: finalize_challenge_cancellation completed (positions closed and moved to history):`, data);
    }
    
    // Step 3: NOW delete ALL position history for this user (after positions have been closed and moved to history)
    console.log(`Step 3: Starting deletion of ALL position history for user ${user_id} AFTER positions were closed...`);
    console.log(`SQL to execute: DELETE FROM prop_position_history WHERE user_id = '${user_id}'`);
    
    // First, check how many records exist before deletion (should include the newly closed positions)
    const { data: beforeCount, error: beforeCountError } = await supabase
      .from('prop_position_history')
      .select('id', { count: 'exact' })
      .eq('user_id', user_id);
      
    if (beforeCountError) {
      console.error(`ERROR: Failed to count position history before deletion:`, {
        message: beforeCountError.message,
        details: beforeCountError.details,
        hint: beforeCountError.hint,
        code: beforeCountError.code
      });
    } else {
      console.log(`BEFORE DELETION: Found ${beforeCount?.length || 0} position history records for user ${user_id} (including newly closed positions)`);
    }
    
    const { error: deleteHistoryError } = await supabase
      .from('prop_position_history')
      .delete()
      .eq('user_id', user_id);
      
    if (deleteHistoryError) {
      console.error(`ERROR: Failed to delete position history for user ${user_id}:`, {
        message: deleteHistoryError.message,
        details: deleteHistoryError.details,
        hint: deleteHistoryError.hint,
        code: deleteHistoryError.code
      });
      await supabase
        .from('system_logs')
        .insert({
          action: 'position_history_deletion_failed',
          details: `Failed to delete position history for user ${user_id}: ${deleteHistoryError.message} (Code: ${deleteHistoryError.code})`
        });
      
      // IMPORTANT: If deletion fails, return a failure response here
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to delete position history: ${deleteHistoryError.message}`,
          position_history_deleted: false,
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
    } else {
      console.log(`SUCCESS: Deleted ALL position history for user ${user_id} (including newly closed positions)`);
      await supabase
        .from('system_logs')
        .insert({
          action: 'position_history_deleted',
          details: `Successfully deleted all position history for user ${user_id} during challenge ${challenge_id} cancellation (including newly closed positions)`
        });
    }
    
    // Step 4: Verify deletion by checking remaining records after deletion
    console.log(`Step 4: Verifying position history deletion for user ${user_id}...`);
    const { data: remainingHistory, error: verifyError } = await supabase
      .from('prop_position_history')
      .select('id', { count: 'exact' })
      .eq('user_id', user_id);
      
    if (verifyError) {
      console.error(`ERROR: Failed to verify position history deletion:`, {
        message: verifyError.message,
        details: verifyError.details,
        hint: verifyError.hint,
        code: verifyError.code
      });
    } else {
      const remainingCount = remainingHistory?.length || 0;
      console.log(`AFTER DELETION: ${remainingCount} position history records remaining for user ${user_id}`);
      if (remainingHistory && remainingHistory.length > 0) {
        console.warn(`WARNING: ${remainingCount} position history records still exist for user ${user_id} after deletion attempt`);
        console.log(`Remaining records:`, remainingHistory.map(r => r.id));
      } else {
        console.log(`CONFIRMED: All position history successfully deleted for user ${user_id}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Challenge ${challenge_id} cancelled successfully without balance transfer. Position history deletion: ${deleteHistoryError ? 'FAILED' : 'SUCCESS'}`,
        position_history_deleted: !deleteHistoryError,
        remaining_history_count: remainingHistory?.length || 0,
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
    console.error("Error in cancel-challenge-without-transfer function:", error);
    
    console.log(`Step 5: Challenge cancellation and history deletion completed successfully`);
    
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