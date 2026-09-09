import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

    const { data: activeCampaign, error: campaignError } = await supabase
      .from("giveaway_campaigns")
      .select("*")
      .eq("status", "active")
      .gte("end_date", new Date().toISOString())
      .lte("start_date", new Date().toISOString())
      .maybeSingle();

    if (campaignError) {
      console.error("Error fetching campaign:", campaignError);
      throw campaignError;
    }

    if (!activeCampaign) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No active giveaway campaign",
          processedCount: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: unprocessedDeposits, error: depositsError } = await supabase
      .from("transactions")
      .select("id, user_id, amount, created_at")
      .eq("type", "deposit")
      .eq("tickets_processed", false)
      .gte("created_at", activeCampaign.start_date)
      .lte("created_at", activeCampaign.end_date)
      .order("created_at", { ascending: true });

    if (depositsError) {
      console.error("Error fetching deposits:", depositsError);
      throw depositsError;
    }

    if (!unprocessedDeposits || unprocessedDeposits.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No unprocessed deposits found",
          processedCount: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const ticketRate = parseFloat(activeCampaign.ticket_rate) || 100;
    let processedCount = 0;
    let totalTicketsDistributed = 0;
    const errors = [];

    for (const deposit of unprocessedDeposits) {
      try {
        const depositAmount = parseFloat(deposit.amount);
        const ticketsEarned = Math.floor(depositAmount / ticketRate);

        if (ticketsEarned > 0) {
          const { error: ticketError } = await supabase
            .from("giveaway_tickets")
            .insert({
              user_id: deposit.user_id,
              campaign_id: activeCampaign.id,
              ticket_count: ticketsEarned,
              deposit_transaction_id: deposit.id,
            });

          if (ticketError) {
            console.error(`Error inserting tickets for deposit ${deposit.id}:`, ticketError);
            errors.push({ depositId: deposit.id, error: ticketError.message });
            continue;
          }

          const { data: existingEntry } = await supabase
            .from("giveaway_entries")
            .select("*")
            .eq("user_id", deposit.user_id)
            .eq("campaign_id", activeCampaign.id)
            .maybeSingle();

          if (existingEntry) {
            const { error: updateError } = await supabase
              .from("giveaway_entries")
              .update({
                total_tickets: existingEntry.total_tickets + ticketsEarned,
                last_updated: new Date().toISOString(),
              })
              .eq("id", existingEntry.id);

            if (updateError) {
              console.error(`Error updating entry for user ${deposit.user_id}:`, updateError);
              errors.push({ depositId: deposit.id, error: updateError.message });
              continue;
            }
          } else {
            const { error: insertError } = await supabase
              .from("giveaway_entries")
              .insert({
                user_id: deposit.user_id,
                campaign_id: activeCampaign.id,
                total_tickets: ticketsEarned,
              });

            if (insertError) {
              console.error(`Error creating entry for user ${deposit.user_id}:`, insertError);
              errors.push({ depositId: deposit.id, error: insertError.message });
              continue;
            }
          }

          totalTicketsDistributed += ticketsEarned;
        }

        const { error: markProcessedError } = await supabase
          .from("transactions")
          .update({ tickets_processed: true })
          .eq("id", deposit.id);

        if (markProcessedError) {
          console.error(`Error marking deposit ${deposit.id} as processed:`, markProcessedError);
          errors.push({ depositId: deposit.id, error: markProcessedError.message });
        } else {
          processedCount++;
        }
      } catch (error) {
        console.error(`Error processing deposit ${deposit.id}:`, error);
        errors.push({ depositId: deposit.id, error: error.message });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${processedCount} deposits`,
        processedCount,
        totalTicketsDistributed,
        campaignName: activeCampaign.name,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing giveaway tickets:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});