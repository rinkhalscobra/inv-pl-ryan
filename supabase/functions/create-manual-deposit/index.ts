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

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(authorization.slice(7));
    if (authError || !user) {
      return jsonResponse({ success: false, error: "Please sign in to continue" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 10 || amount > 1_000_000) {
      return jsonResponse({ success: false, error: "Deposit amount must be between $10 and $1,000,000" }, 400);
    }

    const { data: transaction, error: insertError } = await supabaseAdmin
      .from("transactions")
      .insert({
        user_id: user.id,
        type: "deposit",
        amount,
        status: "pending",
        description: "Manual crypto deposit request - awaiting CRM review",
      })
      .select("id, amount, status, created_at")
      .single();

    if (insertError) {
      console.error("Failed to create manual deposit", insertError);
      return jsonResponse({ success: false, error: "Unable to submit the deposit request" }, 500);
    }

    return jsonResponse({
      success: true,
      transaction_id: transaction.id,
      amount: transaction.amount,
      status: transaction.status,
      created_at: transaction.created_at,
    });
  } catch (error) {
    console.error("create-manual-deposit error", error);
    return jsonResponse({ success: false, error: "Unable to submit the deposit request" }, 500);
  }
});

