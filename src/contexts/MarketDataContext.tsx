import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { wsSymbolToAppSymbol } from '../utils/symbolMapping';
import {
  CFD_INSTRUMENTS,
  getCfdInstrument,
  resolveCfdAppSymbol
} from '../constants/tradingPairs';
import { supabase } from '../lib/supabaseClient';

export interface MarketDataItem {
  id?: string;
  symbol: string;
  price: number;
  volume_24h?: number;
  change_24h?: number;
  timestamp: string;
  high_price_24h?: number;
  low_price_24h?: number;
  market_cap?: number;
  funding_rate?: number;
  open_interest?: number;
  bid_price?: number;
  ask_price?: number;
  updated_at?: string;
}

type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface MarketDataContextType {
  marketData: MarketDataItem[];
  snapshotData: MarketDataItem[];
  isConnected: boolean;
  connectionState: ConnectionState;
  error: string | null;
  getMarketDataBySymbol: (symbol: string) => MarketDataItem | null;
  getPriceBySymbol: (symbol: string) => number;
  getSnapshotPriceBySymbol: (symbol: string) => number;
  refreshSnapshot: () => void;
  refreshQuotes: (symbol?: string, force?: boolean) => Promise<void>;
  lastSnapshotTime: number;
}

const MarketDataContext = createContext<MarketDataContextType | undefined>(undefined);

interface MarketDataProviderProps {
  children: React.ReactNode;
}

const FREE_PRICE_INSTRUMENTS = CFD_INSTRUMENTS
  .filter(instrument => instrument.active && instrument.tradable !== false)
  .map(instrument => ({ symbol: instrument.symbol, type: instrument.type }));
const FREE_PRICE_SYMBOLS = new Set(FREE_PRICE_INSTRUMENTS.map(instrument => instrument.symbol));
const PRICE_REFRESH_INTERVAL_MS = 4 * 60 * 1000;
const SELECTED_QUOTE_INTERVAL_MS = 60 * 1000;
const quoteTime = (item: MarketDataItem) => Date.parse(item.timestamp || '') || 0;

export const MarketDataProvider: React.FC<MarketDataProviderProps> = ({ children }) => {
  const [marketData, setMarketData] = useState<MarketDataItem[]>([]);
  const [snapshotData, setSnapshotData] = useState<MarketDataItem[]>([]);
  const [lastSnapshotTime, setLastSnapshotTime] = useState<number>(Date.now());
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [error, setError] = useState<string | null>(null);
  const catalogRefreshInFlightRef = useRef(false);
  const selectedRefreshInFlightRef = useRef(new Set<string>());
  const lastRefreshRequestRef = useRef(0);
  const lastSelectedRefreshRef = useRef(new Map<string, number>());
  const isConnected = connectionState === 'connected';

  const loadDatabaseFallback = useCallback(async (symbol?: string) => {
    try {
      const cfdSymbols = symbol ? [symbol] : FREE_PRICE_INSTRUMENTS.map(instrument => instrument.symbol);
      const rows: Array<Record<string, string | number | null>> = [];

      for (let index = 0; index < cfdSymbols.length; index += 100) {
        const { data, error: dbError } = await supabase
          .from('cfd_market_quotes')
          .select('symbol, price, change_24h, high_price_24h, low_price_24h, volume_24h, timestamp, updated_at')
          .in('symbol', cfdSymbols.slice(index, index + 100));

        if (dbError) throw dbError;
        if (data) rows.push(...data);
      }

      if (rows.length > 0) {
        const itemMap = new Map<string, { item: MarketDataItem; preferred: boolean }>();

        for (const row of rows) {
          const rawSymbol = String(row.symbol || '');
          const appSymbol = resolveCfdAppSymbol(rawSymbol) || wsSymbolToAppSymbol(rawSymbol);
          const instrument = getCfdInstrument(appSymbol);
          const preferred = instrument?.providerSymbol?.toUpperCase() === rawSymbol.toUpperCase();
          const item: MarketDataItem = {
            symbol: appSymbol,
            price: parseFloat(String(row.price)) || 0,
            change_24h: parseFloat(String(row.change_24h)) || 0,
            high_price_24h: parseFloat(String(row.high_price_24h)) || 0,
            low_price_24h: parseFloat(String(row.low_price_24h)) || 0,
            volume_24h: parseFloat(String(row.volume_24h)) || 0,
            bid_price: row.bid_price ? parseFloat(String(row.bid_price)) : undefined,
            ask_price: row.ask_price ? parseFloat(String(row.ask_price)) : undefined,
            timestamp: String(row.timestamp || ''),
            updated_at: String(row.updated_at || '')
          };
          const existing = itemMap.get(appSymbol);

          if (!existing || quoteTime(item) > quoteTime(existing.item)
            || (quoteTime(item) === quoteTime(existing.item) && preferred && !existing.preferred)) {
            itemMap.set(appSymbol, { item, preferred });
          }
        }

        const items = Array.from(itemMap.values(), entry => entry.item);

        if (items.length > 0) {
          setMarketData(prev => {
            const symbolMap = new Map(prev.map(item => [item.symbol, item]));
            for (const item of items) {
              const previous = symbolMap.get(item.symbol);
              if (!previous || quoteTime(item) >= quoteTime(previous)) symbolMap.set(item.symbol, item);
            }
            return Array.from(symbolMap.values());
          });
          setSnapshotData(prev => {
            const symbolMap = new Map(prev.map(item => [item.symbol, item]));
            for (const item of items) {
              const previous = symbolMap.get(item.symbol);
              if (!previous || quoteTime(item) >= quoteTime(previous)) symbolMap.set(item.symbol, item);
            }
            return Array.from(symbolMap.values());
          });
          setLastSnapshotTime(Date.now());
          setError(null);
        }
      }
    } catch {
      setError('Stored CFD prices are temporarily unavailable');
    }
  }, []);

  const refreshFreeMarketCache = useCallback(async (symbol?: string, force = false) => {
    const instrument = symbol ? getCfdInstrument(symbol) : undefined;
    if (symbol && (!instrument || !FREE_PRICE_SYMBOLS.has(instrument.symbol))) return;
    const instruments = instrument
      ? [{ symbol: instrument.symbol, type: instrument.type }]
      : FREE_PRICE_INSTRUMENTS;
    const lastRequest = instrument
      ? lastSelectedRefreshRef.current.get(instrument.symbol) || 0
      : lastRefreshRequestRef.current;
    const interval = instrument ? SELECTED_QUOTE_INTERVAL_MS : PRICE_REFRESH_INTERVAL_MS;
    if ((instrument ? selectedRefreshInFlightRef.current.has(instrument.symbol) : catalogRefreshInFlightRef.current)
      || !navigator.onLine || document.hidden
      || Date.now() - lastRequest < (force && instrument ? 30_000 : interval)) return;
    if (instrument) selectedRefreshInFlightRef.current.add(instrument.symbol);
    else catalogRefreshInFlightRef.current = true;
    try {
      const { data: sessionResult } = await supabase.auth.getSession();
      if (!sessionResult.session) return;
      const requestedAt = Date.now();
      if (instrument) lastSelectedRefreshRef.current.set(instrument.symbol, requestedAt);
      else lastRefreshRequestRef.current = requestedAt;
      const { data: refreshResult, error: refreshError } = await supabase.functions.invoke('cfd-market-data', {
        body: { instruments, force: force && !!instrument },
        headers: { Authorization: `Bearer ${sessionResult.session.access_token}` }
      });
      if (refreshError) throw refreshError;
      if (refreshResult?.success !== true) throw new Error('CFD quote refresh failed');
      await loadDatabaseFallback(instrument?.symbol);
    } catch {
      if (instrument) lastSelectedRefreshRef.current.set(instrument.symbol, Date.now() - SELECTED_QUOTE_INTERVAL_MS + 30_000);
      else lastRefreshRequestRef.current = Date.now() - PRICE_REFRESH_INTERVAL_MS + 30_000;
      setError('CFD quote refresh is temporarily unavailable');
    } finally {
      if (instrument) selectedRefreshInFlightRef.current.delete(instrument.symbol);
      else catalogRefreshInFlightRef.current = false;
    }
  }, [loadDatabaseFallback]);

  const getMarketDataBySymbol = useCallback((symbol: string): MarketDataItem | null => {
    const appSymbol = resolveCfdAppSymbol(symbol) || wsSymbolToAppSymbol(symbol);
    return marketData.find(item => item.symbol === appSymbol) || null;
  }, [marketData]);

  const getPriceBySymbol = useCallback((symbol: string): number => {
    const item = getMarketDataBySymbol(symbol);
    return item?.price || 0;
  }, [getMarketDataBySymbol]);

  const getSnapshotPriceBySymbol = useCallback((symbol: string): number => {
    const item = snapshotData.find(item => item.symbol === symbol);
    return item?.price || 0;
  }, [snapshotData]);

  const refreshSnapshot = useCallback(() => {
    setSnapshotData([...marketData]);
    setLastSnapshotTime(Date.now());
  }, [marketData]);

  useEffect(() => {
    void loadDatabaseFallback();
  }, [loadDatabaseFallback]);

  // Realtime can be interrupted while the browser sleeps or reconnects.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden && navigator.onLine) void loadDatabaseFallback();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadDatabaseFallback]);

  useEffect(() => {
    const channel = supabase
      .channel(`market-data-live-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cfd_market_quotes' },
        payload => {
          const row = payload.new as Record<string, string | number | null>;
          if (!row?.symbol) return;

          const rawSymbol = String(row.symbol);
          const appSymbol = resolveCfdAppSymbol(rawSymbol) || wsSymbolToAppSymbol(rawSymbol);
          if (!FREE_PRICE_SYMBOLS.has(appSymbol)) return;
          const item: MarketDataItem = {
            symbol: appSymbol,
            price: Number(row.price) || 0,
            change_24h: Number(row.change_24h) || 0,
            high_price_24h: Number(row.high_price_24h) || 0,
            low_price_24h: Number(row.low_price_24h) || 0,
            volume_24h: Number(row.volume_24h) || 0,
            bid_price: row.bid_price == null ? undefined : Number(row.bid_price),
            ask_price: row.ask_price == null ? undefined : Number(row.ask_price),
            timestamp: String(row.timestamp || ''),
            updated_at: String(row.updated_at || '')
          };
          if (item.price <= 0) return;

          const merge = (previous: MarketDataItem[]) => {
            const next = new Map(previous.map(entry => [entry.symbol, entry]));
            const existing = next.get(item.symbol);
            if (!existing || quoteTime(item) >= quoteTime(existing)) next.set(item.symbol, item);
            return Array.from(next.values());
          };
          setMarketData(merge);
          setSnapshotData(merge);
          setLastSnapshotTime(Date.now());
          setError(null);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnectionState('connected');
          void loadDatabaseFallback();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnectionState('reconnecting');
          setError('Live CFD updates are reconnecting');
        } else if (status === 'CLOSED') {
          setConnectionState('disconnected');
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadDatabaseFallback]);

  useEffect(() => {
    const catchUp = () => {
      if (document.hidden) return;
      void loadDatabaseFallback();
    };
    const handleOnline = () => {
      setConnectionState('reconnecting');
      catchUp();
    };
    const handleOffline = () => {
      setConnectionState('disconnected');
      setError('Browser is offline');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', catchUp);
    document.addEventListener('visibilitychange', catchUp);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', catchUp);
      document.removeEventListener('visibilitychange', catchUp);
    };
  }, [loadDatabaseFallback]);

  const contextValue: MarketDataContextType = {
    marketData,
    snapshotData,
    isConnected,
    connectionState,
    error,
    getMarketDataBySymbol,
    getPriceBySymbol,
    getSnapshotPriceBySymbol,
    refreshSnapshot,
    refreshQuotes: refreshFreeMarketCache,
    lastSnapshotTime
  };

  return (
    <MarketDataContext.Provider value={contextValue}>
      {children}
    </MarketDataContext.Provider>
  );
};

export const useMarketData = (): MarketDataContextType => {
  const context = useContext(MarketDataContext);
  if (context === undefined) {
    throw new Error('useMarketData must be used within a MarketDataProvider');
  }
  return context;
};
