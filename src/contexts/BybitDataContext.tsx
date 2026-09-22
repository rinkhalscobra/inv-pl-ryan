import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
type PriceDirection = 'up' | 'down' | 'neutral';
interface CryptoTickerData {
  price: number;
  price_usd: number;
  change_24h: number;
  high_price_24h: number;
  low_price_24h: number;
  volume_24h: number;
  bid_price: number;
  ask_price: number;
  timestamp: string;
}
interface CryptoDataContextType {
  prices: Map<string, number>;
  isConnected: boolean;
  connectionState: ConnectionState;
  getPriceBySymbol: (symbol: string) => number;
  getPriceDirection: (symbol: string) => PriceDirection;
  getCryptoDataBySymbol: (symbol: string) => CryptoTickerData | null;
  refreshQuote: (symbol: string, force?: boolean) => Promise<void>;
}
type StoredQuote = { symbol: string; price: number; price_usd: number; change_24h: number;
  high_price_24h: number; low_price_24h: number; volume_24h: number; timestamp: string };

const CryptoDataContext = createContext<CryptoDataContextType | undefined>(undefined);

// Keep the provider and hook names for existing callers; all prices now come from Supabase's Twelve Data cache.
export const BybitDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [quotes, setQuotes] = useState<Map<string, CryptoTickerData>>(new Map());
  const [directions, setDirections] = useState<Map<string, PriceDirection>>(new Map());
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const lastRefreshRef = useRef(new Map<string, number>());
  const inflightRef = useRef(new Set<string>());

  const mergeQuotes = useCallback((rows: StoredQuote[]) => {
    setQuotes(previous => {
      const next = new Map(previous);
      const updatedDirections = new Map<string, PriceDirection>();
      for (const row of rows) {
        const price = Number(row.price);
        if (!(price > 0)) continue;
        const old = next.get(row.symbol);
        if (old && Date.parse(row.timestamp) < Date.parse(old.timestamp)) continue;
        if (old && price !== old.price) updatedDirections.set(row.symbol, price > old.price ? 'up' : 'down');
        next.set(row.symbol, {
          price,
          price_usd: Number(row.price_usd) || 0,
          change_24h: Number(row.change_24h) || 0,
          high_price_24h: Number(row.high_price_24h) || 0,
          low_price_24h: Number(row.low_price_24h) || 0,
          volume_24h: Number(row.volume_24h) || 0,
          bid_price: 0,
          ask_price: 0,
          timestamp: row.timestamp,
        });
      }
      if (updatedDirections.size) setDirections(current => new Map([...current, ...updatedDirections]));
      return next;
    });
  }, []);

  const loadQuotes = useCallback(async (symbol?: string) => {
    const query = supabase.from('crypto_market_quotes')
      .select('symbol,price,price_usd,change_24h,high_price_24h,low_price_24h,volume_24h,timestamp');
    const { data, error } = symbol ? await query.eq('symbol', symbol) : await query.limit(150);
    if (error) { console.error('Stored Twelve Data crypto quotes could not be read', error); return; }
    if (data) mergeQuotes(data as StoredQuote[]);
  }, [mergeQuotes]);

  const refreshQuote = useCallback(async (symbol: string, force = false) => {
    const normalized = symbol.toUpperCase();
    if (!/^[A-Z0-9]{2,24}$/.test(normalized) || document.hidden || !navigator.onLine) return;
    const last = lastRefreshRef.current.get(normalized) || 0;
    if (inflightRef.current.has(normalized) || Date.now() - last < (force ? 30_000 : 60_000)) return;
    inflightRef.current.add(normalized);
    lastRefreshRef.current.set(normalized, Date.now());
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;
      const { data, error } = await supabase.functions.invoke('twelve-crypto-market-data', {
        body: { action: 'sync_selected', symbol: normalized, force },
        headers: { Authorization: `Bearer ${session.session.access_token}` }
      });
      if (error || data?.success !== true) throw error || new Error(data?.error || 'Twelve Data refresh failed');
      await loadQuotes(normalized);
      window.dispatchEvent(new CustomEvent('twelve-crypto-history-updated', { detail: { symbol: normalized } }));
    } catch (error) {
      console.error('Selected Twelve Data crypto quote refresh failed', error);
      lastRefreshRef.current.set(normalized, Date.now() - 30_000);
    } finally {
      inflightRef.current.delete(normalized);
    }
  }, [loadQuotes]);

  useEffect(() => { void loadQuotes(); }, [loadQuotes]);
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        window.setTimeout(() => void loadQuotes(), 0);
      }
    });
    return () => subscription.unsubscribe();
  }, [loadQuotes]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden && navigator.onLine) void loadQuotes();
    }, 30_000);
    const onFocus = () => { if (!document.hidden) void loadQuotes(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); window.removeEventListener('online', onFocus); };
  }, [loadQuotes]);
  useEffect(() => {
    const channel = supabase.channel(`twelve-crypto-quotes-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crypto_market_quotes' }, payload => {
        if (payload.new) mergeQuotes([payload.new as StoredQuote]);
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') { setConnectionState('connected'); void loadQuotes(); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConnectionState('reconnecting');
        else if (status === 'CLOSED') setConnectionState('disconnected');
      });
    return () => { void supabase.removeChannel(channel); };
  }, [loadQuotes, mergeQuotes]);

  const prices = new Map([...quotes].map(([symbol, quote]) => [symbol, quote.price]));
  const getPriceBySymbol = useCallback((symbol: string) => quotes.get(symbol)?.price || 0, [quotes]);
  const getCryptoDataBySymbol = useCallback((symbol: string) => quotes.get(symbol) || null, [quotes]);
  const getPriceDirection = useCallback((symbol: string) => directions.get(symbol) || 'neutral', [directions]);
  return <CryptoDataContext.Provider value={{ prices, isConnected: connectionState === 'connected',
    connectionState, getPriceBySymbol, getCryptoDataBySymbol, getPriceDirection, refreshQuote }}>
    {children}
  </CryptoDataContext.Provider>;
};

export const useBybitData = (): CryptoDataContextType => {
  const context = useContext(CryptoDataContext);
  if (!context) throw new Error('useBybitData must be used within BybitDataProvider');
  return context;
};
