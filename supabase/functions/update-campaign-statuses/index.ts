import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface StatusUpdateResult {
  pendingToActive: number;
  activeToCompleted: number;
  updatedCampaigns: Array<{
    id: string;
    name: string;
    oldStatus: string;
    newStatus: string;
  }>;
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
    const now = new Date().toISOString();

    const result: StatusUpdateResult = {
      pendingToActive: 0,
      activeToCompleted: 0,
      updatedCampaigns: [],
    };

    // 1. Find pending campaigns that should be active (start_date has passed)
    const { data: pendingCampaigns, error: pendingError } = await supabase
      .from("giveaway_campaigns")
      .select("*")
      .eq("status", "pending")
      .lte("start_date", now);

    if (pendingError) {
      console.error("Error fetching pending campaigns:", pendingError);
      throw pendingError;
    }

    // Update pending campaigns to active
    if (pendingCampaigns && pendingCampaigns.length > 0) {
      for (const campaign of pendingCampaigns) {
        const { error: updateError } = await supabase
          .from("giveaway_campaigns")
          .update({ status: "active" })
          .eq("id", campaign.id);

        if (updateError) {
          console.error(`Error updating campaign ${campaign.id} to active:`, updateError);
        } else {
          result.pendingToActive++;
          result.updatedCampaigns.push({
            id: campaign.id,
            name: campaign.name,
            oldStatus: "pending",
            newStatus: "active",
          });
          console.log(`✅ Campaign "${campaign.name}" (${campaign.id}) activated`);
        }
      }
    }

    // 2. Find active campaigns that should be completed (end_date has passed)
    const { data: activeCampaigns, error: activeError } = await supabase
      .from("giveaway_campaigns")
      .select("*")
      .eq("status", "active")
      .lt("end_date", now);

    if (activeError) {
      console.error("Error fetching active campaigns:", activeError);
      throw activeError;
    }

    // Update active campaigns to completed
    if (activeCampaigns && activeCampaigns.length > 0) {
      for (const campaign of activeCampaigns) {
        const { error: updateError } = await supabase
          .from("giveaway_campaigns")
          .update({ status: "completed" })
          .eq("id", campaign.id);

        if (updateError) {
          console.error(`Error updating campaign ${campaign.id} to completed:`, updateError);
        } else {
          result.activeToCompleted++;
          result.updatedCampaigns.push({
            id: campaign.id,
            name: campaign.name,
            oldStatus: "active",
            newStatus: "completed",
          });
          console.log(`✅ Campaign "${campaign.name}" (${campaign.id}) completed`);
        }
      }
    }

    console.log(
      `Campaign status update completed: ${result.pendingToActive} activated, ${result.activeToCompleted} completed`
    );

    return new Response(
      JSON.stringify({
        success: true,
        ...result,
        timestamp: now,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error updating campaign statuses:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});