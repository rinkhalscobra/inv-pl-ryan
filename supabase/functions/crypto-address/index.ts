import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const VPS_API_URL = "http://72.62.210.168/api";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(
        JSON.stringify({ error: userError?.message || "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { chain = "btc" } = await req.json().catch(() => ({}));

    if (!["btc"].includes(chain)) {
      return new Response(
        JSON.stringify({ error: "Invalid chain. Supported: btc" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: existingAddress } = await supabaseAdmin
      .from("crypto_deposit_addresses")
      .select("address, chain")
      .eq("user_id", user.id)
      .eq("chain", chain)
      .maybeSingle();

    if (existingAddress) {
      return new Response(
        JSON.stringify({
          address: existingAddress.address,
          chain: existingAddress.chain,
          cached: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let vpsResponse;
    try {
      vpsResponse = await fetch(`${VPS_API_URL}/crypto/address`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, chain }),
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error("VPS fetch error:", fetchError);
      return new Response(
        JSON.stringify({ error: "Address generation service unavailable" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    clearTimeout(timeoutId);

    if (!vpsResponse.ok) {
      const errorText = await vpsResponse.text();
      console.error("VPS API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to generate address" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const vpsData = await vpsResponse.json();

    const { error: insertError } = await supabaseAdmin
      .from("crypto_deposit_addresses")
      .insert({
        user_id: user.id,
        chain,
        address: vpsData.address,
        derivation_index: vpsData.derivation_index,
      });

    if (insertError) {
      console.error("Insert error:", insertError);
      if (insertError.code === "23505") {
        const { data: retryAddress } = await supabaseAdmin
          .from("crypto_deposit_addresses")
          .select("address, chain")
          .eq("user_id", user.id)
          .eq("chain", chain)
          .maybeSingle();

        if (retryAddress) {
          return new Response(
            JSON.stringify({
              address: retryAddress.address,
              chain: retryAddress.chain,
              cached: true,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      return new Response(
        JSON.stringify({ error: "Failed to save address" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        address: vpsData.address,
        chain,
        cached: false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
