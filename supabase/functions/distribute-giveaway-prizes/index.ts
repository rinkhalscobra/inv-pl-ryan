import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface DistributePrizesRequest {
  campaign_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { campaign_id }: DistributePrizesRequest = await req.json();

    if (!campaign_id) {
      return new Response(
        JSON.stringify({ error: "Campaign ID is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const campaignId = campaign_id;

    const { data: campaign, error: campaignError } = await supabase
      .from("giveaway_campaigns")
      .select("*")
      .eq("id", campaignId)
      .maybeSingle();

    if (campaignError || !campaign) {
      return new Response(
        JSON.stringify({ error: "Campaign not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: unpaidWinners, error: winnersError } = await supabase
      .from("giveaway_winners")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("paid_out", false)
      .order("rank", { ascending: true });

    if (winnersError) {
      throw winnersError;
    }

    if (!unpaidWinners || unpaidWinners.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No unpaid winners found",
          paidCount: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const winner of unpaidWinners) {
      try {
        const { data: updatedWinner, error: lockError } = await supabase
          .from("giveaway_winners")
          .update({
            paid_out: true,
            paid_out_at: new Date().toISOString(),
          })
          .eq("id", winner.id)
          .eq("paid_out", false)
          .select()
          .maybeSingle();

        if (lockError) {
          throw lockError;
        }

        if (!updatedWinner) {
          console.log(`Winner ${winner.id} already paid, skipping`);
          continue;
        }

        const { error: transactionError } = await supabase
          .from("transactions")
          .insert({
            user_id: winner.user_id,
            type: "giveaway_prize",
            amount: Number(winner.prize_amount),
            description: `Giveaway Prize - Rank ${winner.rank} (${winner.prize_tier})`,
            status: "completed",
            tickets_processed: true,
          });

        if (transactionError) {
          throw transactionError;
        }

        successCount++;
      } catch (error) {
        console.error(`Error paying winner ${winner.user_id}:`, error);
        errorCount++;
        errors.push({
          winnerId: winner.id,
          userId: winner.user_id,
          rank: winner.rank,
          error: error.message,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        paidCount: successCount,
        errorCount,
        totalWinners: unpaidWinners.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error distributing giveaway prizes:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});