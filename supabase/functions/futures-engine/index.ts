import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

type Side = "long" | "short";
const finitePositive = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const authorization = request.headers.get("Authorization") || "";
    if (!url || !serviceKey) return json({ error: "Server configuration is incomplete" }, 500);
    if (!authorization.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(authorization.slice(7));
    if (authError || !authData.user) return json({ error: "Invalid session" }, 401);

    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || "");

    if (action === "place") {
      const symbol = String(body.symbol || "").trim().toUpperCase();
      const side = String(body.side || "") as Side;
      const amount = finitePositive(body.amount);
      const leverage = Number(body.leverage);
      const marginType = String(body.marginType || "");
      const orderType = String(body.orderType || "");
      const limitPrice = body.limitPrice == null ? null : finitePositive(body.limitPrice);
      const stopLoss = body.stopLoss == null ? null : finitePositive(body.stopLoss);
      const takeProfit = body.takeProfit == null ? null : finitePositive(body.takeProfit);
      if (!symbol || !amount || !Number.isInteger(leverage) || !["long", "short"].includes(side)) {
        return json({ error: "Invalid order parameters" }, 400);
      }

      const quoteTable = symbol.endsWith("USDT") ? "crypto_market_quotes" : "cfd_market_quotes";
      const { data: quote, error: quoteError } = await admin.from(quoteTable)
        .select("price,timestamp").eq("symbol", symbol).single();
      if (quoteError || !quote) throw new Error("Twelve Data market quote is unavailable");
      const quoteTime = Date.parse(quote.timestamp || "");
      if (!Number.isFinite(quoteTime) || quoteTime > Date.now() + 60_000
        || Date.now() - quoteTime > 2 * 60_000) throw new Error("Twelve Data market quote is stale");
      const marketPrice = finitePositive(quote.price);

      const { data, error } = await admin.rpc("place_derivative_order", {
        p_user_id: authData.user.id,
        p_symbol: symbol,
        p_side: side,
        p_amount: amount,
        p_leverage: leverage,
        p_margin_type: marginType,
        p_order_type: orderType,
        p_market_price: marketPrice,
        p_limit_price: orderType === "limit" ? limitPrice : null,
        p_stop_loss: stopLoss,
        p_take_profit: takeProfit,
      });
      if (error) throw error;
      return json({ success: true, result: data, executionPrice: marketPrice });
    }

    if (action === "close") {
      const positionId = String(body.positionId || "");
      const { data: position, error: positionError } = await admin.from("futures_positions")
        .select("id,user_id,symbol,side,current_price")
        .eq("id", positionId).eq("user_id", authData.user.id).eq("is_open", true).single();
      if (positionError || !position) return json({ error: "Open position not found" }, 404);

      const quoteTable = position.symbol.endsWith("USDT") ? "crypto_market_quotes" : "cfd_market_quotes";
      const { data: quote, error: quoteError } = await admin.from(quoteTable)
        .select("price,timestamp").eq("symbol", position.symbol).single();
      if (quoteError || !quote) throw new Error("Twelve Data market quote is unavailable");
      const quoteTime = Date.parse(quote.timestamp || "");
      if (!Number.isFinite(quoteTime) || quoteTime > Date.now() + 60_000
        || Date.now() - quoteTime > 2 * 60_000) throw new Error("Twelve Data market quote is stale");
      const exitPrice = finitePositive(quote.price);
      if (!exitPrice) throw new Error("Exit quote is unavailable");
      const { data: pnl, error } = await admin.rpc("close_futures_position", {
        position_id: positionId,
        exit_price: exitPrice,
      });
      if (error) throw error;
      return json({ success: true, pnl, executionPrice: exitPrice });
    }

    return json({ error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("Futures engine request failed", error);
    return json({ error: error instanceof Error ? error.message : "Trading request failed" }, 400);
  }
});
