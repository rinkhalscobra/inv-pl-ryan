import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

type InstrumentType = "forex" | "commodity" | "stock" | "index";
type RequestedInstrument = { symbol: string; type: InstrumentType };
type YahooResponse = {
  meta?: Record<string, unknown>;
  timestamp?: number[];
  indicators?: { quote?: Array<{ close?: Array<number | null> }> };
};
type YahooSparkResult = { symbol: string; response?: YahooResponse[] };
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
const SELECTED_CACHE_MS = 60 * 1000;
const CATALOG_CACHE_MS = 5 * 60 * 1000;
const MAX_INSTRUMENTS = 220;
const YAHOO_BATCH_SIZE = 20;
const warmCacheUntil = new Map<string, number>();
const activeRefreshes = new Map<string, Promise<{ updated: number; sources: string[] }>>();

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

const fetchSparkBatch = async (symbols: string[]): Promise<YahooSparkResult[]> => {
  let lastError: unknown;
  for (const host of ["query2.finance.yahoo.com", "query1.finance.yahoo.com"]) {
    try {
      const url = `https://${host}/v7/finance/spark?symbols=${encodeURIComponent(symbols.join(","))}&range=1d&interval=1m`;
      const data = await fetchJson(url) as { spark?: { result?: YahooSparkResult[]; error?: unknown } };
      if (!data.spark?.result?.length) throw new Error("Spark response contains no quotes");
      return data.spark.result;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Spark quote request failed");
};

const fetchChartQuote = async (symbol: string): Promise<YahooResponse | null> => {
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`;
      const data = await fetchJson(url) as { chart?: { result?: YahooResponse[] } };
      if (data.chart?.result?.[0]) return data.chart.result[0];
    } catch (error) {
      console.warn(`Chart quote request failed on ${host}`, error);
    }
  }
  return null;
};

const quoteToRow = (instrument: RequestedInstrument, response: YahooResponse | undefined, now: string): MarketRow | null => {
  if (!response) return null;
  const meta = response.meta || {};
  const timestamps = response.timestamp || [];
  const closes = response.indicators?.quote?.[0]?.close || [];
  let price = Number(meta.regularMarketPrice);
  let marketTime = Number(meta.regularMarketTime) || 0;
  for (let index = Math.min(timestamps.length, closes.length) - 1; index >= 0; index--) {
    const close = closes[index];
    if (typeof close === "number" && Number.isFinite(close) && close > 0
      && Number.isFinite(timestamps[index])
      && (!Number.isFinite(price) || price <= 0 || timestamps[index] > marketTime)) {
      price = close;
      marketTime = timestamps[index];
      break;
    }
  }
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(marketTime) || marketTime <= 0
    || marketTime * 1000 > Date.now() + 60_000) return null;
  const previous = Number(meta.chartPreviousClose) || price;
  return {
    symbol: instrument.symbol,
    price,
    change_24h: Number(meta.regularMarketChangePercent) || (previous > 0 ? ((price - previous) / previous) * 100 : 0),
    high_price_24h: Number(meta.regularMarketDayHigh) || 0,
    low_price_24h: Number(meta.regularMarketDayLow) || 0,
    volume_24h: Number(meta.regularMarketVolume) || 0,
    timestamp: new Date(marketTime * 1000).toISOString(),
    updated_at: now,
  };
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
  const batchResults: PromiseSettledResult<YahooSparkResult[]>[] = [];
  for (const group of chunk(batches, 3)) {
    batchResults.push(...await Promise.allSettled(group.map(fetchSparkBatch)));
  }

  for (const result of batchResults) {
    if (result.status === "rejected") {
      console.warn("Market quote batch failed", result.reason);
      continue;
    }
    for (const quote of result.value) {
      const instrument = providerToInstrument.get(quote.symbol);
      if (!instrument) continue;
      const row = quoteToRow(instrument, quote.response?.[0], now);
      if (row) rows.push(row);
    }
  }
  if (instruments.length === 1 && !rows.some(row => row.symbol === instruments[0].symbol)) {
    const chart = await fetchChartQuote(toYahooSymbol(instruments[0]));
    const row = quoteToRow(instruments[0], chart || undefined, now);
    if (row) rows.push(row);
  }
  if (rows.length === 0) throw new Error("Quote provider returned no usable prices");
  if (instruments.length === 1 && !rows.some(row => row.symbol === instruments[0].symbol)) {
    throw new Error(`No quote was returned for ${instruments[0].symbol}`);
  }
  if (batchResults.some((result) => result.status === "fulfilled")) sources.push("market spark quotes");
  else sources.push("market chart quote");

  const existing = new Map<string, { timestamp: string; price: number }>();
  for (const batch of chunk(rows.map(row => row.symbol), 100)) {
    const { data, error } = await admin.from("market_data").select("symbol,timestamp,price").in("symbol", batch);
    if (error) throw error;
    for (const item of data || []) existing.set(item.symbol, { timestamp: item.timestamp, price: Number(item.price) });
  }
  const changedRows = rows.filter(row => {
    const previous = existing.get(row.symbol);
    return !previous || Date.parse(row.timestamp) > (Date.parse(previous.timestamp || "") || 0)
      || (row.timestamp === previous.timestamp && row.price !== previous.price);
  });
  for (const batch of chunk(changedRows, 100)) {
    const { error } = await admin.from("market_data").upsert(batch, { onConflict: "symbol", ignoreDuplicates: false });
    if (error) throw error;
  }
  if (changedRows.length > 0) {
    // Process pending fills and risk levels as soon as a new quote arrives.
    const { error } = await admin.rpc("process_futures_engine");
    if (error) console.warn("Derivative processing after CFD quote update failed", error);
  }
  return { updated: changedRows.length, sources };
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

    const body = await request.json().catch(() => ({})) as { instruments?: unknown[] };
    const instruments = Array.from(new Map((body.instruments || [])
      .filter(validInstrument)
      .slice(0, MAX_INSTRUMENTS)
      .map((item) => [item.symbol.toUpperCase(), { symbol: item.symbol.toUpperCase(), type: item.type }] as const)).values());
    if (instruments.length === 0) return json({ error: "No valid instruments supplied" }, 400);

    const now = Date.now();
    const cacheMs = instruments.length === 1 ? SELECTED_CACHE_MS : CATALOG_CACHE_MS;
    const key = instruments.map(item => item.symbol).sort().join("|");
    const cacheKey = `${instruments.length === 1 ? "selected" : "catalog"}:${key}`;
    if ((warmCacheUntil.get(cacheKey) || 0) > now) {
      return json({ success: true, cached: true, updated: 0 });
    }
    const recent = new Set<string>();
    for (const batch of chunk(instruments.map(item => item.symbol), 100)) {
      const { data, error } = await admin.from("market_data").select("symbol,updated_at").in("symbol", batch);
      if (error) throw error;
      for (const item of data || []) {
        if (Date.parse(item.updated_at || "") > now - cacheMs) recent.add(item.symbol);
      }
    }
    if (instruments.every(item => recent.has(item.symbol))) {
      warmCacheUntil.set(cacheKey, now + cacheMs);
      return json({ success: true, cached: true, updated: 0 });
    }

    if (!activeRefreshes.has(key)) {
      activeRefreshes.set(key, refreshPrices(admin, instruments).finally(() => activeRefreshes.delete(key)));
    }
    const result = await activeRefreshes.get(key)!;
    warmCacheUntil.set(cacheKey, Date.now() + cacheMs);
    return json({ success: true, cached: false, ...result });
  } catch (error) {
    console.error("CFD market refresh failed", error);
    return json({ error: error instanceof Error ? error.message : "Market refresh failed" }, 500);
  }
});
