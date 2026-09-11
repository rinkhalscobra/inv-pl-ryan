import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

type InstrumentType = "forex" | "commodity" | "stock" | "index";
type RequestedInstrument = { symbol: string; type: InstrumentType };
type MarketRow = {
  symbol: string;
  price: number;
  change_24h: number;
  high_price_24h: number;
  low_price_24h: number;
  volume_24h: number;
  timestamp: string;
  updated_at: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "private, max-age=5" },
});
const CACHE_MS = 10 * 1000;
const MAX_INSTRUMENTS = 220;
const YAHOO_BATCH_SIZE = 35;
let warmCacheUntil = 0;
let activeRefresh: Promise<{ updated: number; sources: string[] }> | null = null;

const yahooOverrides: Record<string, string> = {
  "XAG/USD": "SI=F",
  "NATGAS/USD": "NG=F",
  "BCO/USD": "BZ=F",
  "WTICO/USD": "CL=F",
  "XPT/USD": "PL=F",
  "XAU/USD": "GC=F",
  "XPD/USD": "PA=F",
  "CORN/USD": "ZC=F",
  "WHEAT/USD": "ZW=F",
  "SUGAR/USD": "SB=F",
  "CAC": "^FCHI",
  "ASX": "^AXJO",
  "NI225": "^N225",
  "STOXX50": "^STOXX50E",
  "KOSPI": "^KS11",
  "SAMSUNG": "005930.KS",
};

const toYahooSymbol = (instrument: RequestedInstrument): string => {
  const overridden = yahooOverrides[instrument.symbol];
  if (overridden) return overridden;
  if (instrument.type === "forex" && /^[A-Z]{3}\/[A-Z]{3}$/.test(instrument.symbol)) {
    const [base, quote] = instrument.symbol.split("/");
    return base === "USD" ? `${quote}=X` : `${base}${quote}=X`;
  }
  return instrument.symbol;
};

const validInstrument = (value: unknown): value is RequestedInstrument => {
  if (!value || typeof value !== "object") return false;
  const item = value as RequestedInstrument;
  return typeof item.symbol === "string"
    && item.symbol.length > 0
    && item.symbol.length <= 24
    && /^[A-Z0-9./^=-]+$/i.test(item.symbol)
    && ["forex", "commodity", "stock", "index"].includes(item.type);
};

const fetchJson = async (url: string) => {
  const response = await fetch(url, {
    headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0 (compatible; MarketCache/1.0)" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Quote provider returned ${response.status}`);
  return response.json();
};

const chunk = <T,>(items: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
};

const refreshPrices = async (
  admin: ReturnType<typeof createClient>,
  instruments: RequestedInstrument[],
): Promise<{ updated: number; sources: string[] }> => {
  const now = new Date().toISOString();
  const rows: MarketRow[] = [];
  const sources: string[] = [];
  const providerToInstrument = new Map<string, RequestedInstrument>();
  for (const item of instruments) providerToInstrument.set(toYahooSymbol(item), item);

  const batches = chunk(Array.from(providerToInstrument.keys()), YAHOO_BATCH_SIZE);
  const batchResults = await Promise.allSettled(batches.map(async (symbols) => {
    const url = `https://query2.finance.yahoo.com/v7/finance/spark?symbols=${encodeURIComponent(symbols.join(","))}&range=1d&interval=1m`;
    return fetchJson(url) as Promise<{
      spark?: { result?: Array<{ symbol: string; response?: Array<{
        meta?: Record<string, unknown>;
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: Array<number | null> }> };
      }> }> };
    }>;
  }));

  for (const result of batchResults) {
    if (result.status === "rejected") {
      console.warn("Market quote batch failed", result.reason);
      continue;
    }
    for (const quote of result.value.spark?.result || []) {
      const instrument = providerToInstrument.get(quote.symbol);
      const response = quote.response?.[0];
      const meta = response?.meta || {};
      const closes = response?.indicators?.quote?.[0]?.close?.filter((value): value is number => typeof value === "number") || [];
      const price = Number(meta.regularMarketPrice) || closes.at(-1) || 0;
      if (!instrument || price <= 0) continue;
      const previous = Number(meta.chartPreviousClose) || closes.at(-2) || price;
      const marketTime = Number(meta.regularMarketTime);
      rows.push({
        symbol: instrument.symbol,
        price,
        change_24h: Number(meta.regularMarketChangePercent) || (previous > 0 ? ((price - previous) / previous) * 100 : 0),
        high_price_24h: Number(meta.regularMarketDayHigh) || 0,
        low_price_24h: Number(meta.regularMarketDayLow) || 0,
        volume_24h: Number(meta.regularMarketVolume) || 0,
        timestamp: marketTime > 0 ? new Date(marketTime * 1000).toISOString() : now,
        updated_at: now,
      });
    }
  }
  if (batchResults.some((result) => result.status === "fulfilled")) sources.push("one-minute market quotes");

  for (const batch of chunk(rows, 100)) {
    const { error } = await admin.from("market_data").upsert(batch, { onConflict: "symbol", ignoreDuplicates: false });
    if (error) throw error;
  }
  warmCacheUntil = Date.now() + CACHE_MS;
  return { updated: rows.length, sources };
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const authorization = request.headers.get("Authorization") || "";
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Server configuration is incomplete" }, 500);
    if (!authorization.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userResult, error: userError } = await admin.auth.getUser(authorization.slice("Bearer ".length));
    if (userError || !userResult.user) return json({ error: "Invalid session" }, 401);

    const body = await request.json().catch(() => ({})) as { instruments?: unknown[]; force?: boolean };
    const instruments = Array.from(new Map((body.instruments || [])
      .filter(validInstrument)
      .slice(0, MAX_INSTRUMENTS)
      .map((item) => [item.symbol.toUpperCase(), { symbol: item.symbol.toUpperCase(), type: item.type }] as const)).values());
    if (instruments.length === 0) return json({ error: "No valid instruments supplied" }, 400);

    if (!body.force && Date.now() < warmCacheUntil) return json({ success: true, cached: true, updated: 0 });

    const { data: sample } = await admin.from("market_data").select("updated_at").eq("symbol", "AAPL").maybeSingle();
    const sampleTime = sample?.updated_at ? new Date(sample.updated_at).getTime() : 0;
    if (!body.force && sampleTime > Date.now() - CACHE_MS) {
      warmCacheUntil = sampleTime + CACHE_MS;
      return json({ success: true, cached: true, updated: 0 });
    }

    if (!activeRefresh) activeRefresh = refreshPrices(admin, instruments).finally(() => { activeRefresh = null; });
    const result = await activeRefresh;
    return json({ success: true, cached: false, ...result });
  } catch (error) {
    console.error("CFD market refresh failed", error);
    return json({ error: error instanceof Error ? error.message : "Market refresh failed" }, 500);
  }
});
