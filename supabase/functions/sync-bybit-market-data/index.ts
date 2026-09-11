import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "private, max-age=5" },
});

const CACHE_MS = 10_000;
let cacheUntil = 0;
let activeSync: Promise<number> | null = null;

type BybitTicker = {
  symbol?: string;
  lastPrice?: string;
  volume24h?: string;
  price24hPcnt?: string;
  highPrice24h?: string;
  lowPrice24h?: string;
  fundingRate?: string;
  openInterestValue?: string;
  bid1Price?: string;
  ask1Price?: string;
};

const asNumber = (value: string | undefined): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const fetchAndPersist = async (admin: ReturnType<typeof createClient>): Promise<number> => {
  const response = await fetch("https://api.bybit.com/v5/market/tickers?category=linear", {
    headers: { "Accept": "application/json", "User-Agent": "AtlasMarket/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Bybit returned ${response.status}`);

  const payload = await response.json() as { retCode?: number; retMsg?: string; result?: { list?: BybitTicker[] } };
  if (payload.retCode !== 0 || !Array.isArray(payload.result?.list)) {
    throw new Error(payload.retMsg || "Bybit returned an invalid ticker response");
  }

  const timestamp = new Date().toISOString();
  const rows = payload.result.list.flatMap((ticker) => {
    const symbol = ticker.symbol || "";
    const price = asNumber(ticker.lastPrice);
    if (!symbol.endsWith("USDT") || price <= 0) return [];
    return [{
      symbol,
      price,
      volume_24h: asNumber(ticker.volume24h),
      change_24h: asNumber(ticker.price24hPcnt) * 100,
      high_price_24h: asNumber(ticker.highPrice24h),
      low_price_24h: asNumber(ticker.lowPrice24h),
      funding_rate: asNumber(ticker.fundingRate) * 100,
      open_interest: asNumber(ticker.openInterestValue),
      bid_price: asNumber(ticker.bid1Price),
      ask_price: asNumber(ticker.ask1Price),
      timestamp,
      updated_at: timestamp,
    }];
  });

  for (let index = 0; index < rows.length; index += 100) {
    const { error } = await admin.from("market_data").upsert(rows.slice(index, index + 100), {
      onConflict: "symbol",
      ignoreDuplicates: false,
    });
    if (error) throw error;
  }

  cacheUntil = Date.now() + CACHE_MS;
  return rows.length;
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const authorization = request.headers.get("Authorization") || "";
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Server configuration is incomplete" }, 500);
    if (!authorization.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.auth.getUser(authorization.slice("Bearer ".length));
    if (error || !data.user) return json({ error: "Invalid session" }, 401);

    if (Date.now() < cacheUntil) return json({ success: true, cached: true, updated: 0 });
    if (!activeSync) activeSync = fetchAndPersist(admin).finally(() => { activeSync = null; });
    const updated = await activeSync;
    return json({ success: true, cached: false, updated, source: "Bybit linear tickers" });
  } catch (error) {
    console.error("Bybit market sync failed", error);
    return json({ error: error instanceof Error ? error.message : "Market sync failed" }, 502);
  }
});
