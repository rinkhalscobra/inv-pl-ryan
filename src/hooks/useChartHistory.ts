import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { mergeCandleHistory, type MarketCandle } from '../lib/chartCandles';

const MAX_HISTORY_ROWS = 20_000;
const historyCache = new Map<string, { candles: MarketCandle[]; exhausted: boolean }>();

export function useChartHistory(selectedPair: string, market: 'cfd' | 'crypto', minutes: number) {
  const cacheKey = `${market}:${selectedPair}`;
  const [history, setHistory] = useState<{ key: string; candles: MarketCandle[] }>({ key: cacheKey, candles: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const cacheKey = `${market}:${selectedPair}`;
    const cached = historyCache.get(cacheKey);
    setHistory({ key: cacheKey, candles: cached?.candles || [] });
    setLoading(true);
    setError(null);
    let inFlight = false;

    const fetchPage = async (limit: number, before?: string) => {
      let query = supabase.from(market === 'crypto' ? 'crypto_market_candles' : 'cfd_market_candles')
        .select('candle_time,open,high,low,close,volume')
        .eq('symbol', selectedPair)
        .order('candle_time', { ascending: false })
        .limit(limit);
      if (before) query = query.lt('candle_time', before);
      const { data, error: queryError } = await query.abortSignal(controller.signal);
      if (queryError) throw queryError;
      return (data || []).map(row => ({ candle_time: row.candle_time,
        open: Number(row.open), high: Number(row.high), low: Number(row.low),
        close: Number(row.close), volume: Number(row.volume) }));
    };

    const load = async (expandHistory = false) => {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      try {
        const targetRows = Math.min(180 * minutes + minutes, MAX_HISTORY_ROWS);
        const pageSize = expandHistory ? Math.min(1000, targetRows) : 180;
        const recent = await fetchPage(pageSize);
        if (controller.signal.aborted) return;
        const current = historyCache.get(cacheKey);
        let next = mergeCandleHistory(current?.candles || [], recent).slice(-MAX_HISTORY_ROWS);
        let exhausted = current?.exhausted || recent.length < pageSize;
        const publish = () => {
          if (controller.signal.aborted) return;
          // Bound memory when many markets have been opened in one browser session.
          if (!historyCache.has(cacheKey) && historyCache.size >= 24) historyCache.delete(historyCache.keys().next().value!);
          historyCache.set(cacheKey, { candles: next, exhausted });
          setHistory({ key: cacheKey, candles: next });
        };
        publish();
        while (expandHistory && !exhausted && next.length < targetRows) {
          const older = await fetchPage(Math.min(1000, targetRows - next.length), next[0]?.candle_time);
          if (controller.signal.aborted) return;
          const previousLength = next.length;
          next = mergeCandleHistory(older, next).slice(-MAX_HISTORY_ROWS);
          exhausted = older.length === 0 || next.length === previousLength;
          publish();
        }
        setError(null);
      } catch {
        if (!controller.signal.aborted) setError('Chart history could not be refreshed. Try again shortly.');
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void load(true);
    const onHistoryUpdated = (event: Event) => {
      if ((event as CustomEvent<{ symbol: string }>).detail?.symbol === selectedPair) void load();
    };
    const historyUpdatedEvent = market === 'crypto' ? 'twelve-crypto-history-updated' : 'twelve-cfd-history-updated';
    const refresh = () => { if (!document.hidden && navigator.onLine) void load(); };
    window.addEventListener(historyUpdatedEvent, onHistoryUpdated);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener(historyUpdatedEvent, onHistoryUpdated);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [selectedPair, market, minutes]);

  return { candles: history.key === cacheKey ? history.candles : [], loading, error };
}
