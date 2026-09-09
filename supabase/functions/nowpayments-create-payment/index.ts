import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supportedCurrencies = new Set([
  "btc", "eth", "ltc", "doge", "xrp", "bnb", "usdt", "usdc", "sol", "ada",
]);

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
    const amount = Number(body.amount);
    const payCurrency = String(body.pay_currency ?? body.crypto_symbol ?? "").toLowerCase();
    if (!Number.isFinite(amount) || amount < 10) {
      return jsonResponse({ success: false, error: "The minimum deposit is $10" }, 400);
    }
    if (!supportedCurrencies.has(payCurrency)) {
      return jsonResponse({ success: false, error: "Unsupported payment currency" }, 400);
    }

    const apiKey = Deno.env.get("NOWPAYMENTS_API_KEY");
    if (!apiKey) {
      return jsonResponse({
        success: false,
        error: "Crypto deposits are awaiting payment-provider configuration",
        code: "PROVIDER_NOT_CONFIGURED",
      }, 503);
    }

    const orderId = `deposit-${user.id}-${crypto.randomUUID()}`;
    const providerResponse = await fetch("https://api.nowpayments.io/v1/payment", {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        price_amount: amount,
        price_currency: "usd",
        pay_currency: payCurrency,
        order_id: orderId,
        order_description: `Atlas Market deposit for ${user.id}`,
      }),
    });
    const providerData = await providerResponse.json().catch(() => ({}));
    if (!providerResponse.ok) {
      console.error("NOWPayments create error", providerResponse.status, providerData);
      return jsonResponse({
        success: false,
        error: providerData.message || "The crypto payment provider rejected this request",
      }, providerResponse.status >= 500 ? 502 : 400);
    }

    if (!providerData.payment_id || !providerData.pay_address) {
      console.error("NOWPayments returned an incomplete payment", providerData);
      return jsonResponse({ success: false, error: "The payment provider returned an incomplete address" }, 502);
    }

    const { error: insertError } = await supabaseAdmin.from("crypto_payment_requests").insert({
      user_id: user.id,
      provider_payment_id: String(providerData.payment_id),
      order_id: orderId,
      price_amount: amount,
      price_currency: "usd",
      pay_currency: String(providerData.pay_currency || payCurrency).toLowerCase(),
      pay_amount: providerData.pay_amount ?? null,
      actually_paid: providerData.actually_paid ?? null,
      pay_address: providerData.pay_address,
      payment_status: providerData.payment_status || "waiting",
      provider_response: providerData,
    });
    if (insertError) {
      console.error("Failed to persist payment", insertError);
      return jsonResponse({ success: false, error: "Failed to save the generated payment address" }, 500);
    }

    return jsonResponse({
      success: true,
      payment_id: String(providerData.payment_id),
      pay_address: providerData.pay_address,
      pay_amount: providerData.pay_amount,
      pay_currency: providerData.pay_currency || payCurrency,
      payment_status: providerData.payment_status || "waiting",
    });
  } catch (error) {
    console.error("nowpayments-create-payment error", error);
    return jsonResponse({ success: false, error: "Unable to create a crypto payment" }, 500);
  }
});
