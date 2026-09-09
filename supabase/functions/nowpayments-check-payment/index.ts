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
    if (authError || !user) return jsonResponse({ success: false, error: "Please sign in to continue" }, 401);

    const body = await req.json().catch(() => ({}));
    const paymentId = String(body.payment_id ?? "");
    if (!paymentId) return jsonResponse({ success: false, error: "Payment ID is required" }, 400);

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("crypto_payment_requests")
      .select("provider_payment_id")
      .eq("provider_payment_id", paymentId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (paymentError || !payment) return jsonResponse({ success: false, error: "Payment not found" }, 404);

    const apiKey = Deno.env.get("NOWPAYMENTS_API_KEY");
    if (!apiKey) return jsonResponse({ success: false, error: "Crypto payment provider is not configured" }, 503);

    const providerResponse = await fetch(
      `https://api.nowpayments.io/v1/payment/${encodeURIComponent(paymentId)}`,
      { headers: { "x-api-key": apiKey } },
    );
    const providerData = await providerResponse.json().catch(() => ({}));
    if (!providerResponse.ok) {
      console.error("NOWPayments status error", providerResponse.status, providerData);
      return jsonResponse({ success: false, error: providerData.message || "Unable to check payment status" }, 502);
    }

    const paymentStatus = String(providerData.payment_status || "waiting");
    const { data: finalized, error: finalizeError } = await supabaseAdmin.rpc("finalize_nowpayments_payment", {
      p_provider_payment_id: paymentId,
      p_payment_status: paymentStatus,
      p_actually_paid: providerData.actually_paid ?? null,
      p_provider_response: providerData,
    });
    if (finalizeError) {
      console.error("Failed to finalize payment", finalizeError);
      return jsonResponse({ success: false, error: "Unable to save payment status" }, 500);
    }

    return jsonResponse({
      success: true,
      payment_id: paymentId,
      payment_status: paymentStatus,
      credited: Boolean(finalized?.credited),
    });
  } catch (error) {
    console.error("nowpayments-check-payment error", error);
    return jsonResponse({ success: false, error: "Unable to check payment status" }, 500);
  }
});
