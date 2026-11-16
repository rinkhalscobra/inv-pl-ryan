import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed" }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return jsonResponse({ success: false, error: "Please sign in to continue" }, 401);
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { auth: { persistSession: false }, global: { headers: { Authorization: authorization } } },
    );
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser(authorization.slice(7));
    if (authError || !user) {
      return jsonResponse({ success: false, error: "Please sign in to continue" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const amount = Number(body.amount);
    const method = String(body.method || "bank");
    const currency = String(body.currency || (method === "btc" ? "BTC" : "EUR")).toUpperCase();
    if (!Number.isFinite(amount)) return jsonResponse({ success: false, error: "Enter a valid deposit amount" }, 400);
    const { data: transaction, error: insertError } = await supabaseUser.rpc("request_manual_deposit", {
      p_method: method,
      p_amount: amount,
      p_currency: currency,
      p_request_id: body.request_id || crypto.randomUUID(),
    });

    if (insertError) {
      console.error("Failed to create manual deposit", insertError);
      return jsonResponse({ success: false, error: insertError.message }, 400);
    }

    return jsonResponse({
      success: true,
      transaction_id: transaction.id,
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status,
      created_at: transaction.created_at,
    });
  } catch (error) {
    console.error("create-manual-deposit error", error);
    return jsonResponse({ success: false, error: "Unable to submit the deposit request" }, 500);
  }
});
