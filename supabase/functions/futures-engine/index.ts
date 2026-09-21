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
type BybitTicker = {
  symbol?: string;
  lastPrice?: string;
  markPrice?: string;
  bid1Price?: string;
  ask1Price?: string;
  volume24h?: string;
  price24hPcnt?: string;
  highPrice24h?: string;
  lowPrice24h?: string;
  fundingRate?: string;
  openInterestValue?: string;
};

type Instrument = {
  lotSizeFilter?: { minOrderQty?: string; maxOrderQty?: string; qtyStep?: string };
  priceFilter?: { tickSize?: string };
  leverageFilter?: { minLeverage?: string; maxLeverage?: string };
};

const finitePositive = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

const decimalPlaces = (step: number): number => {
  if (!Number.isFinite(step) || step <= 0) return 8;
  const text = step.toString().toLowerCase();
  if (text.includes("e-")) return Number(text.split("e-")[1]);
  return (text.split(".")[1] || "").length;
};

const alignedToStep = (value: number, step: number): boolean => {
  if (step <= 0) return true;
  const precision = 10 ** Math.min(decimalPlaces(step), 12);
  return Math.abs(Math.round(value * precision) % Math.round(step * precision)) < 1;
};

async function bybitGet<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.bybit.com${path}`, {
    headers: { "Accept": "application/json", "User-Agent": "AtlasMarket/1.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Market provider returned ${response.status}`);
  const payload = await response.json() as { retCode?: number; retMsg?: string; result?: T };
  if (payload.retCode !== 0 || !payload.result) throw new Error(payload.retMsg || "Invalid market response");
  return payload.result;
}

async function getCryptoQuote(symbol: string) {
  const [tickerResult, instrumentResult] = await Promise.all([
    bybitGet<{ list?: BybitTicker[] }>(`/v5/market/tickers?category=linear&symbol=${encodeURIComponent(symbol)}`),
    bybitGet<{ list?: Instrument[] }>(`/v5/market/instruments-info?category=linear&symbol=${encodeURIComponent(symbol)}`),
  ]);
  const ticker = tickerResult.list?.[0];
  const instrument = instrumentResult.list?.[0];
  const last = finitePositive(ticker?.lastPrice);
  const mark = finitePositive(ticker?.markPrice) || last;
  const bid = finitePositive(ticker?.bid1Price) || last;
  const ask = finitePositive(ticker?.ask1Price) || last;
  if (!ticker || !instrument || !last || !mark || !bid || !ask) throw new Error("Market is unavailable");
  return { ticker, instrument, last, mark, bid, ask };
}

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

      let marketPrice = 0;
      if (symbol.endsWith("USDT")) {
        const quote = await getCryptoQuote(symbol);
        marketPrice = side === "long" ? quote.ask : quote.bid;
        const minimum = finitePositive(quote.instrument.lotSizeFilter?.minOrderQty);
        const maximum = finitePositive(quote.instrument.lotSizeFilter?.maxOrderQty);
        const quantityStep = finitePositive(quote.instrument.lotSizeFilter?.qtyStep);
        const tickSize = finitePositive(quote.instrument.priceFilter?.tickSize);
        const exchangeMaxLeverage = finitePositive(quote.instrument.leverageFilter?.maxLeverage);
        if (minimum && amount < minimum) return json({ error: `Minimum amount is ${minimum}` }, 400);
        if (maximum && amount > maximum) return json({ error: `Maximum amount is ${maximum}` }, 400);
        if (quantityStep && !alignedToStep(amount, quantityStep)) {
          return json({ error: `Amount must use increments of ${quantityStep}` }, 400);
        }
        if (exchangeMaxLeverage && leverage > exchangeMaxLeverage) {
          return json({ error: `Maximum market leverage is ${exchangeMaxLeverage}x` }, 400);
        }
        if (orderType === "limit" && tickSize && limitPrice && !alignedToStep(limitPrice, tickSize)) {
          return json({ error: `Limit price must use increments of ${tickSize}` }, 400);
        }

        const timestamp = new Date().toISOString();
        const { ticker } = quote;
        const { error: quoteError } = await admin.from("market_data").upsert({
          symbol,
          price: quote.mark,
          bid_price: quote.bid,
          ask_price: quote.ask,
          volume_24h: finitePositive(ticker.volume24h),
          change_24h: Number(ticker.price24hPcnt || 0) * 100,
          high_price_24h: finitePositive(ticker.highPrice24h),
          low_price_24h: finitePositive(ticker.lowPrice24h),
          funding_rate: Number(ticker.fundingRate || 0) * 100,
          open_interest: finitePositive(ticker.openInterestValue),
          timestamp,
          updated_at: timestamp,
        }, { onConflict: "symbol" });
        if (quoteError) throw quoteError;
      } else {
        const { data: quote, error: quoteError } = await admin.from("market_data")
          .select("price,bid_price,ask_price,updated_at,timestamp")
          .eq("symbol", symbol).single();
        if (quoteError || !quote) throw new Error("Market quote is unavailable");
        const quoteTime = Date.parse(quote.timestamp || "");
        if (!Number.isFinite(quoteTime) || quoteTime > Date.now() + 60_000
          || Date.now() - quoteTime > 2 * 60_000) throw new Error("Market quote is stale");
        marketPrice = finitePositive(side === "long" ? quote.ask_price : quote.bid_price)
          || finitePositive(quote.price);
      }

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

      let exitPrice = 0;
      if (position.symbol.endsWith("USDT")) {
        const quote = await getCryptoQuote(position.symbol);
        exitPrice = position.side === "long" ? quote.bid : quote.ask;
        const timestamp = new Date().toISOString();
        const { error: quoteError } = await admin.from("market_data").upsert({
          symbol: position.symbol, price: quote.mark, bid_price: quote.bid, ask_price: quote.ask,
          timestamp, updated_at: timestamp,
        }, { onConflict: "symbol" });
        if (quoteError) throw quoteError;
      } else {
        const { data: quote, error: quoteError } = await admin.from("market_data")
          .select("price,bid_price,ask_price,updated_at,timestamp")
          .eq("symbol", position.symbol).single();
        if (quoteError || !quote) throw new Error("Market quote is unavailable");
        const quoteTime = Date.parse(quote.timestamp || "");
        if (!Number.isFinite(quoteTime) || quoteTime > Date.now() + 60_000
          || Date.now() - quoteTime > 2 * 60_000) throw new Error("Market quote is stale");
        exitPrice = finitePositive(position.side === "long" ? quote.bid_price : quote.ask_price)
          || finitePositive(quote.price);
      }
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
