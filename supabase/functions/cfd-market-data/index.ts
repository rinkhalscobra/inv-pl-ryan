import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { CFD_INSTRUMENTS } from "../../../src/constants/tradingPairs.ts";

type InstrumentType = "forex" | "commodity" | "stock" | "index";
type RequestedInstrument = { symbol: string; type: InstrumentType };
type TwelveQuote = {
  symbol?: string;
  status?: string;
  close?: string | number;
  percent_change?: string | number;
  high?: string | number;
  low?: string | number;
  volume?: string | number;
  timestamp?: number;
  last_quote_at?: number;
  is_market_open?: boolean;
};
type TwelveTimeSeries = {
  status?: string;
  values?: Array<{ datetime: string; open: string; high: string; low: string; close: string; volume?: string }>;
};
type MarketRow = {
  symbol: string;
  price: number;
  change_24h: number;
  high_price_24h: number;
  low_price_24h: number;
  volume_24h: number;
  timestamp: string;
  updated_at: string;
  provider_symbol: string;
  is_market_open: boolean | null;
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
const CATALOG_CACHE_MS = 4 * 60 * 1000;
const MAX_INSTRUMENTS = 220;
const TWELVE_BATCH_SIZE = 20;
const activeRefreshes = new Map<string, Promise<{ updated: number; sources: string[] }>>();
const twelveCommoditySymbols: Record<string, string> = {
  "XAG/USD": "XAG/USD",
  "BCO/USD": "XBR/USD",
  "WTICO/USD": "WTI/USD",
  "XPT/USD": "XPT/USD",
  "XAU/USD": "XAU/USD",
  "XPD/USD": "XPD/USD",
};
// These app symbols have a different meaning on Twelve Data or are exchange
// proxies that must retain their existing index mapping.
const twelveIndexExclusions = new Set(["CAC", "ASX", "NI225", "STOXX50", "KOSPI"]);

const toTwelveSymbol = (instrument: RequestedInstrument): string | null => {
  if (instrument.type === "commodity") return twelveCommoditySymbols[instrument.symbol] || null;
  if (instrument.type === "forex") return /^[A-Z]{3}\/[A-Z]{3}$/.test(instrument.symbol) ? instrument.symbol : null;
  if (instrument.type === "index" && twelveIndexExclusions.has(instrument.symbol)) return null;
  if (instrument.symbol === "SAMSUNG") return null;
  return /^[A-Z][A-Z0-9.]{0,11}$/.test(instrument.symbol) ? instrument.symbol : null;
};

const supportedInstruments: RequestedInstrument[] = CFD_INSTRUMENTS
  .filter(item => item.active && item.tradable !== false)
  .map(item => ({ symbol: item.symbol.toUpperCase(), type: item.type }))
  .filter(item => toTwelveSymbol(item) !== null);
const supportedBySymbol = new Map(supportedInstruments.map(item => [item.symbol, item]));

const validInstrument = (value: unknown): value is RequestedInstrument => {
  if (!value || typeof value !== "object") return false;
  const item = value as RequestedInstrument;
  return typeof item.symbol === "string"
    && item.symbol.length > 0
    && item.symbol.length <= 24
    && /^[A-Z0-9./^=-]+$/i.test(item.symbol)
    && ["forex", "commodity", "stock", "index"].includes(item.type);
};

const chunk = <T,>(items: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
};

const fetchTwelveBatch = async (symbols: string[], apiKey: string): Promise<Record<string, TwelveQuote>> => {
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbols.join(","))}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json", Authorization: `apikey ${apiKey}` },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Twelve Data returned ${response.status}`);
  const data = await response.json() as TwelveQuote | Record<string, TwelveQuote>;
  if (symbols.length === 1) return { [symbols[0]]: data as TwelveQuote };
  if (!data || typeof data !== "object" || "status" in data) {
    throw new Error("Twelve Data returned no batch quotes");
  }
  return data as Record<string, TwelveQuote>;
};

const refreshCandles = async (admin: ReturnType<typeof createClient>, instrument: RequestedInstrument) => {
  const cacheKey = `candles:${instrument.symbol}`;
  const { data: claimed, error: claimError } = await admin.rpc("claim_cfd_quote_refresh", {
    p_cache_key: cacheKey, p_interval_seconds: 240, p_force: false,
  });
  if (claimError) throw claimError;
  if (!claimed) return;
  let success = false;
  try {
    const providerSymbol = toTwelveSymbol(instrument)!;
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(providerSymbol)}&interval=1min&outputsize=180&timezone=UTC`;
    const response = await fetch(url, {
      headers: { Accept: "application/json", Authorization: `apikey ${Deno.env.get("TWELVE_DATA_API_KEY") || ""}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Twelve Data candles returned HTTP ${response.status}`);
    const data = await response.json() as TwelveTimeSeries;
    if (data.status === "error" || !Array.isArray(data.values) || !data.values.length) {
      throw new Error(`Twelve Data returned no candles for ${instrument.symbol}`);
    }
    const updatedAt = new Date().toISOString();
    const candles = data.values.map(value => {
      const time = Date.parse(value.datetime.replace(" ", "T") + "Z");
      const open = Number(value.open);
      const high = Number(value.high);
      const low = Number(value.low);
      const close = Number(value.close);
      if (![time, open, high, low, close].every(Number.isFinite)
        || Math.min(open, high, low, close) <= 0 || time > Date.now() + 60_000) return null;
      return {
        symbol: instrument.symbol, candle_time: new Date(time).toISOString(),
        open, high, low, close, volume: Number(value.volume) || 0, updated_at: updatedAt,
      };
    }).filter((row): row is NonNullable<typeof row> => row !== null);
    if (!candles.length) throw new Error("Twelve Data candles contain no valid prices");
    for (const batch of chunk(candles, 100)) {
      const { error } = await admin.from("cfd_market_candles").upsert(batch, { onConflict: "symbol,candle_time" });
      if (error) throw error;
    }
    success = true;
  } finally {
    const { error } = await admin.rpc("finish_cfd_quote_refresh", {
      p_cache_key: cacheKey, p_interval_seconds: 240, p_success: success,
    });
    if (error) console.warn("Candle refresh lease could not be released", error);
  }
};

const twelveQuoteToRow = (
  instrument: RequestedInstrument,
  providerSymbol: string,
  quote: TwelveQuote | undefined,
  now: string,
): MarketRow | null => {
  if (!quote || quote.status === "error" || String(quote.symbol || "").toUpperCase() !== providerSymbol) return null;
  const price = Number(quote.close);
  // /quote.timestamp is the start of the daily bar for several asset classes.
  // last_quote_at is the actual time of the latest quote when available.
  const quoteTime = Number(quote.last_quote_at || quote.timestamp) * 1000;
  const age = Date.now() - quoteTime;
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(quoteTime)
    || age < -60_000 || age > 7 * 24 * 60 * 60_000
    || (quote.is_market_open === true && age > 15 * 60_000)) return null;
  return {
    symbol: instrument.symbol,
    provider_symbol: providerSymbol,
    is_market_open: typeof quote.is_market_open === "boolean" ? quote.is_market_open : null,
    price,
    change_24h: Number(quote.percent_change) || 0,
    high_price_24h: Number(quote.high) || 0,
    low_price_24h: Number(quote.low) || 0,
    volume_24h: Number(quote.volume) || 0,
    timestamp: new Date(quoteTime).toISOString(),
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
  const apiKey = Deno.env.get("TWELVE_DATA_API_KEY") || "";
  if (!apiKey) throw new Error("Twelve Data API key is not configured");
  if (apiKey) {
    const providerToInstrument = new Map<string, RequestedInstrument>();
    for (const item of instruments) {
      const providerSymbol = toTwelveSymbol(item);
      if (providerSymbol) providerToInstrument.set(providerSymbol, item);
    }
    const batches = chunk(Array.from(providerToInstrument.keys()), TWELVE_BATCH_SIZE);
    const batchResults: PromiseSettledResult<Record<string, TwelveQuote>>[] = [];
    for (const group of chunk(batches, 3)) {
      batchResults.push(...await Promise.allSettled(group.map(symbols => fetchTwelveBatch(symbols, apiKey))));
    }
    for (let index = 0; index < batchResults.length; index++) {
      const result = batchResults[index];
      if (result.status === "rejected") {
        console.warn("Twelve Data quote batch failed", result.reason);
        continue;
      }
      for (const providerSymbol of batches[index]) {
        const instrument = providerToInstrument.get(providerSymbol)!;
        const row = twelveQuoteToRow(instrument, providerSymbol, result.value[providerSymbol], now);
        if (row) rows.push(row);
      }
    }
    if (rows.length > 0) sources.push("Twelve Data");
  }

  if (rows.length === 0) throw new Error("Twelve Data returned no usable prices");
  if (instruments.length === 1 && rows[0]?.symbol !== instruments[0].symbol) {
    throw new Error(`No Twelve Data quote was returned for ${instruments[0].symbol}`);
  }
  const existing = new Map<string, { timestamp: string; price: number }>();
  for (const batch of chunk(rows.map(row => row.symbol), 100)) {
    const { data, error } = await admin.from("cfd_market_quotes").select("symbol,timestamp,price").in("symbol", batch);
    if (error) throw error;
    for (const item of data || []) existing.set(item.symbol, { timestamp: item.timestamp, price: Number(item.price) });
  }
  const changedRows = rows.filter(row => {
    const previous = existing.get(row.symbol);
    return !previous || Date.parse(row.timestamp) >= (Date.parse(previous.timestamp || "") || 0);
  });
  for (const batch of chunk(changedRows, 100)) {
    const { error } = await admin.from("cfd_market_quotes").upsert(batch, { onConflict: "symbol", ignoreDuplicates: false });
    if (error) throw error;
  }
  for (const batch of chunk(changedRows, 100)) {
    const marketRows = batch.map(({ provider_symbol: _providerSymbol, is_market_open: _isMarketOpen, ...row }) => ({
      ...row, bid_price: null, ask_price: null,
    }));
    const { error } = await admin.from("market_data").upsert(marketRows, { onConflict: "symbol", ignoreDuplicates: false });
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
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const syncToken = Deno.env.get("CFD_SYNC_TOKEN") || "";
    const isScheduledSync = syncToken.length >= 32 && request.headers.get("x-cfd-sync-token") === syncToken;
    if (!isScheduledSync) {
      if (!authorization.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
      const { data: userResult, error: userError } = await admin.auth.getUser(authorization.slice("Bearer ".length));
      if (userError || !userResult.user) return json({ error: "Invalid session" }, 401);
    }

    const body = await request.json().catch(() => ({})) as { instruments?: unknown[]; force?: boolean; action?: string; symbol?: string };
    if (isScheduledSync && body.action !== "sync_all" && body.action !== "sync_selected") {
      return json({ error: "Invalid sync action" }, 400);
    }
    const requested = Array.from(new Set((body.instruments || [])
      .filter(validInstrument)
      .slice(0, MAX_INSTRUMENTS)
      .map(item => item.symbol.toUpperCase())));
    if (!isScheduledSync && requested.length === 0) return json({ error: "No valid instruments supplied" }, 400);
    const selectedSymbol = isScheduledSync && body.action === "sync_selected"
      ? String(body.symbol || "").toUpperCase() : requested.length === 1 ? requested[0] : "";
    const instruments = selectedSymbol
      ? [supportedBySymbol.get(selectedSymbol)].filter((item): item is RequestedInstrument => Boolean(item))
      : supportedInstruments;
    if (isScheduledSync && body.action === "sync_selected" && !selectedSymbol) {
      return json({ error: "Instrument is required" }, 400);
    }
    if (instruments.length === 0) return json({ error: "Unsupported CFD instrument" }, 400);

    const cacheMs = instruments.length === 1 ? SELECTED_CACHE_MS : CATALOG_CACHE_MS;
    const cacheKey = instruments.length === 1 ? `selected:${instruments[0].symbol}` : "catalog";
    const requestKey = instruments.map(item => item.symbol).sort().join("|");
    const force = body.force === true && instruments.length === 1;
    if (activeRefreshes.has(requestKey)) {
      const result = await activeRefreshes.get(requestKey)!;
      return json({ success: true, cached: false, ...result });
    }
    const { data: claimed, error: claimError } = await admin.rpc("claim_cfd_quote_refresh", {
      p_cache_key: cacheKey,
      p_interval_seconds: Math.ceil(cacheMs / 1000),
      p_force: force,
    });
    if (claimError) throw claimError;
    if (!claimed) return json({ success: true, cached: true, updated: 0 });

    let success = false;
    const { data: syncRun, error: runError } = await admin.from("cfd_quote_sync_runs")
      .insert({ scope: instruments.length === 1 ? "selected" : "catalog", requested_count: instruments.length })
      .select("id").single();
    if (runError) console.warn("Could not record CFD sync start", runError);
    try {
      const refresh = refreshPrices(admin, instruments).finally(() => activeRefreshes.delete(requestKey));
      activeRefreshes.set(requestKey, refresh);
      const result = await refresh;
      if (instruments.length === 1) {
        try { await refreshCandles(admin, instruments[0]); }
        catch (error) { console.warn("Twelve Data candle refresh failed", error); }
      }
      success = true;
      if (syncRun?.id) await admin.from("cfd_quote_sync_runs")
        .update({ completed_at: new Date().toISOString(), updated_count: result.updated })
        .eq("id", syncRun.id);
      return json({ success: true, cached: false, ...result });
    } catch (error) {
      if (syncRun?.id) await admin.from("cfd_quote_sync_runs")
        .update({ completed_at: new Date().toISOString(), error: error instanceof Error ? error.message.slice(0, 500) : "Sync failed" })
        .eq("id", syncRun.id);
      throw error;
    } finally {
      const { error: finishError } = await admin.rpc("finish_cfd_quote_refresh", {
        p_cache_key: cacheKey,
        p_interval_seconds: Math.ceil(cacheMs / 1000),
        p_success: success,
      });
      if (finishError) console.error("CFD refresh lease could not be released", finishError);
    }
  } catch (error) {
    console.error("CFD market refresh failed", error);
    return json({ error: error instanceof Error ? error.message : "Market refresh failed" }, 500);
  }
});
