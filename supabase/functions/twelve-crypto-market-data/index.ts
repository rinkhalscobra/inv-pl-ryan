import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { TOP_CRYPTO_PAIRS } from "../../../src/constants/tradingPairs.ts";

type Quote = { symbol?: string; status?: string; close?: string; percent_change?: string;
  high?: string; low?: string; volume?: string; last_quote_at?: number; timestamp?: number; is_market_open?: boolean };
type Series = { status?: string; values?: Array<{ datetime: string; open: string; high: string; low: string; close: string; volume?: string }> };
type Mapping = { symbol: string; provider: string; multiplier: number; directUsdt: boolean };
type Row = { symbol: string; provider_symbol: string; price: number; price_usd: number;
  change_24h: number; high_price_24h: number; low_price_24h: number; volume_24h: number;
  timestamp: string; updated_at: string };

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const mappings: Mapping[] = [...new Set([
  ...TOP_CRYPTO_PAIRS.filter(item => item.active).map(item => item.symbol),
  "USDCUSDT", "SHIBUSDT", "PEPEUSDT",
])].flatMap(symbol => {
  if (symbol === "KASUSDT") return [];
  if (symbol === "1000PEPEUSDT") return [{ symbol, provider: "PEPE/USD", multiplier: 1000, directUsdt: false }];
  if (symbol === "SHIB1000USDT") return [{ symbol, provider: "SHIB/USD", multiplier: 1000, directUsdt: false }];
  if (symbol === "AUSDT") return [{ symbol, provider: "A/USDT", multiplier: 1, directUsdt: true }];
  return [{ symbol, provider: `${symbol.slice(0, -4)}/USD`, multiplier: 1, directUsdt: false }];
});
const bySymbol = new Map(mappings.map(item => [item.symbol, item]));
const chunks = <T,>(items: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
};
const sourceTime = (quote: Quote | undefined): number => Number(quote?.last_quote_at || quote?.timestamp) * 1000;
const usable = (quote: Quote | undefined, symbol: string): boolean => {
  if (!quote || quote.status === "error" || String(quote.symbol || "").toUpperCase() !== symbol) return false;
  const time = sourceTime(quote);
  const age = Date.now() - time;
  return Number(quote.close) > 0 && Number.isFinite(time) && age >= -60_000 && age < 15 * 60_000;
};
const fetchQuotes = async (symbols: string[], key: string): Promise<Record<string, Quote>> => {
  const result: Record<string, Quote> = {};
  for (const group of chunks(chunks(symbols, 20), 3)) {
    const batches = await Promise.allSettled(group.map(async batch => {
      const response = await fetch(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(batch.join(","))}`, {
        headers: { Accept: "application/json", Authorization: `apikey ${key}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`Twelve Data returned HTTP ${response.status}`);
      const data = await response.json() as Quote | Record<string, Quote>;
      if (batch.length === 1) return { [batch[0]]: data as Quote };
      if (!data || "status" in data) throw new Error("Twelve Data quote batch failed");
      return data as Record<string, Quote>;
    }));
    for (const batch of batches) {
      if (batch.status === "fulfilled") Object.assign(result, batch.value);
      else console.warn("Twelve Data crypto quote batch failed", batch.reason);
    }
  }
  return result;
};
const refreshCandles = async (admin: ReturnType<typeof createClient>, item: Mapping, usdtUsd: number, key: string) => {
  const cacheKey = `candles:${item.symbol}`;
  const { data: claimed, error: claimError } = await admin.rpc("claim_crypto_quote_refresh", {
    p_cache_key: cacheKey, p_interval_seconds: 240, p_force: false,
  });
  if (claimError) throw claimError;
  if (!claimed) return;
  let success = false;
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(item.provider)}&interval=1min&outputsize=180&timezone=UTC`;
    const response = await fetch(url, { headers: { Accept: "application/json", Authorization: `apikey ${key}` }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Twelve Data candles returned HTTP ${response.status}`);
    const data = await response.json() as Series;
    if (data.status === "error" || !data.values?.length) throw new Error(`No Twelve Data candles for ${item.symbol}`);
    const factor = item.multiplier / (item.directUsdt ? 1 : usdtUsd);
    const updatedAt = new Date().toISOString();
    const rows = data.values.map(value => {
      const time = Date.parse(value.datetime.replace(" ", "T") + "Z");
      const open = Number(value.open) * factor, high = Number(value.high) * factor;
      const low = Number(value.low) * factor, close = Number(value.close) * factor;
      if (![time, open, high, low, close].every(Number.isFinite) || Math.min(open, high, low, close) <= 0 || time > Date.now() + 60_000) return null;
      return { symbol: item.symbol, candle_time: new Date(time).toISOString(), open, high, low, close,
        volume: Number(value.volume) || 0, updated_at: updatedAt };
    }).filter((row): row is NonNullable<typeof row> => row !== null);
    if (!rows.length) throw new Error("No valid Twelve Data crypto candles");
    for (const batch of chunks(rows, 100)) {
      const { error } = await admin.from("crypto_market_candles").upsert(batch, { onConflict: "symbol,candle_time" });
      if (error) throw error;
    }
    success = true;
  } finally {
    await admin.rpc("finish_crypto_quote_refresh", { p_cache_key: cacheKey, p_interval_seconds: 240, p_success: success });
  }
};
const refresh = async (admin: ReturnType<typeof createClient>, selected: Mapping[]) => {
  const key = Deno.env.get("TWELVE_DATA_API_KEY") || "";
  if (!key) throw new Error("Twelve Data API key is not configured");
  const providerSymbols = [...new Set(["USDT/USD", ...selected.map(item => item.provider)])];
  const quotes = await fetchQuotes(providerSymbols, key);
  const stable = quotes["USDT/USD"];
  if (!usable(stable, "USDT/USD")) throw new Error("A current Twelve Data USDT/USD quote is unavailable");
  const usdtUsd = Number(stable.close);
  const now = new Date().toISOString();
  const rows: Row[] = [];
  for (const item of selected) {
    const quote = quotes[item.provider];
    if (!usable(quote, item.provider)) continue;
    const usd = Number(quote.close) * item.multiplier * (item.directUsdt ? usdtUsd : 1);
    const price = usd / usdtUsd;
    const factor = item.multiplier / (item.directUsdt ? 1 : usdtUsd);
    rows.push({ symbol: item.symbol, provider_symbol: item.provider, price, price_usd: usd,
      change_24h: Number(quote.percent_change) || 0,
      high_price_24h: Number(quote.high) * factor || 0,
      low_price_24h: Number(quote.low) * factor || 0,
      volume_24h: Number(quote.volume) || 0,
      timestamp: new Date(Math.min(sourceTime(quote), sourceTime(stable))).toISOString(), updated_at: now });
  }
  if (!rows.length) throw new Error("Twelve Data returned no usable crypto quotes");
  if (selected.length === 1 && rows[0].symbol !== selected[0].symbol) throw new Error(`No current quote for ${selected[0].symbol}`);
  const received = rows.length;
  rows.push({ symbol: "USDTUSD", provider_symbol: "USDT/USD", price: usdtUsd, price_usd: usdtUsd,
    change_24h: Number(stable.percent_change) || 0, high_price_24h: Number(stable.high) || 0,
    low_price_24h: Number(stable.low) || 0, volume_24h: Number(stable.volume) || 0,
    timestamp: new Date(sourceTime(stable)).toISOString(), updated_at: now });

  const existing = new Map<string, number>();
  for (const batch of chunks(rows.map(row => row.symbol), 100)) {
    const { data, error } = await admin.from("crypto_market_quotes").select("symbol,timestamp").in("symbol", batch);
    if (error) throw error;
    for (const row of data || []) existing.set(row.symbol, Date.parse(row.timestamp));
  }
  const accepted = rows.filter(row => !existing.has(row.symbol) || Date.parse(row.timestamp) >= existing.get(row.symbol)!);
  for (const batch of chunks(accepted, 100)) {
    const { error } = await admin.from("crypto_market_quotes").upsert(batch, { onConflict: "symbol" });
    if (error) throw error;
  }
  for (const batch of chunks(accepted, 100)) {
    const mirror = batch.map(row => ({ symbol: row.symbol, price: row.price, change_24h: row.change_24h,
      high_price_24h: row.high_price_24h, low_price_24h: row.low_price_24h,
      volume_24h: row.volume_24h, timestamp: row.timestamp, updated_at: row.updated_at,
      bid_price: null, ask_price: null, funding_rate: 0, open_interest: 0 }));
    const { error } = await admin.from("market_data").upsert(mirror, { onConflict: "symbol" });
    if (error) throw error;
  }
  if (accepted.length) {
    const { error } = await admin.rpc("process_futures_engine");
    if (error) console.warn("Futures processing after crypto quote update failed", error);
  }
  if (selected.length === 1) {
    try { await refreshCandles(admin, selected[0], usdtUsd, key); }
    catch (error) { console.warn("Twelve Data crypto candle refresh failed", error); }
  }
  return { updated: accepted.length, requested: selected.length, missing: selected.length - received, provider: "Twelve Data" };
};

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL") || "", serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return json({ error: "Server configuration is incomplete" }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = Deno.env.get("CFD_SYNC_TOKEN") || "";
  const scheduled = token.length >= 32 && request.headers.get("x-cfd-sync-token") === token;
  if (!scheduled) {
    const auth = request.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
    const { data, error } = await admin.auth.getUser(auth.slice(7));
    if (error || !data.user) return json({ error: "Invalid session" }, 401);
  }
  try {
    const body = await request.json().catch(() => ({})) as { action?: string; symbol?: string; force?: boolean };
    if (scheduled && !["sync_all", "sync_selected", "warm_history"].includes(body.action || "")) return json({ error: "Invalid action" }, 400);
    if (body.action === "warm_history") {
      if (!scheduled) return json({ error: "Service authorization required" }, 403);
      const key = Deno.env.get("TWELVE_DATA_API_KEY") || "";
      if (!key) throw new Error("Twelve Data API key is not configured");
      const stable = (await fetchQuotes(["USDT/USD"], key))["USDT/USD"];
      if (!usable(stable, "USDT/USD")) throw new Error("A current Twelve Data USDT/USD quote is unavailable");
      let warmed = 0, failed = 0;
      for (const group of chunks(mappings, 5)) {
        const outcomes = await Promise.allSettled(group.map(item =>
          refreshCandles(admin, item, Number(stable.close), key)));
        for (const outcome of outcomes) {
          if (outcome.status === "fulfilled") warmed++;
          else { failed++; console.warn("Twelve Data chart warm failed", outcome.reason); }
        }
      }
      return json({ success: true, warmed, failed, provider: "Twelve Data" });
    }
    const selected = body.action === "sync_selected" ? String(body.symbol || "").toUpperCase() : "";
    if (!scheduled && body.action !== "sync_selected") return json({ error: "Invalid action" }, 400);
    const items = selected ? [bySymbol.get(selected)].filter((item): item is Mapping => Boolean(item)) : mappings;
    if (!items.length) return json({ error: "Unsupported Twelve Data crypto symbol" }, 400);
    const interval = selected ? 60 : 240, cacheKey = selected ? `selected:${selected}` : "catalog";
    const { data: claimed, error: claimError } = await admin.rpc("claim_crypto_quote_refresh", {
      p_cache_key: cacheKey, p_interval_seconds: interval, p_force: Boolean(selected) && body.force === true,
    });
    if (claimError) throw claimError;
    if (!claimed) return json({ success: true, cached: true, updated: 0 });
    let success = false;
    try {
      const result = await refresh(admin, items);
      success = true;
      return json({ success: true, cached: false, ...result });
    } finally {
      const { error } = await admin.rpc("finish_crypto_quote_refresh", {
        p_cache_key: cacheKey, p_interval_seconds: interval, p_success: success,
      });
      if (error) console.error("Crypto quote lease release failed", error);
    }
  } catch (error) {
    console.error("Twelve Data crypto sync failed", error);
    return json({ error: error instanceof Error ? error.message
      : typeof error === "object" && error !== null && "message" in error ? String(error.message)
      : "Crypto sync failed" }, 500);
  }
});
