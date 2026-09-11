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
  lastSnapshotTime: number;
}

const MarketDataContext = createContext<MarketDataContextType | undefined>(undefined);

interface MarketDataProviderProps {
  children: React.ReactNode;
}

const FREE_PRICE_INSTRUMENTS = CFD_INSTRUMENTS
  .filter(instrument => instrument.active && instrument.tradable !== false)
  .map(instrument => ({ symbol: instrument.symbol, type: instrument.type }));

export const MarketDataProvider: React.FC<MarketDataProviderProps> = ({ children }) => {
  const [marketData, setMarketData] = useState<MarketDataItem[]>([]);
  const [snapshotData, setSnapshotData] = useState<MarketDataItem[]>([]);
  const [lastSnapshotTime, setLastSnapshotTime] = useState<number>(Date.now());
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [error, setError] = useState<string | null>(null);
  const refreshInFlightRef = useRef(false);
  const isConnected = connectionState === 'connected';

  const loadDatabaseFallback = useCallback(async () => {
    try {
      const cfdSymbols = FREE_PRICE_INSTRUMENTS.map(instrument => instrument.symbol);
      const rows: Array<Record<string, string | number | null>> = [];

      for (let index = 0; index < cfdSymbols.length; index += 100) {
        const { data, error: dbError } = await supabase
          .from('market_data')
          .select('symbol, price, change_24h, high_price_24h, low_price_24h, volume_24h, timestamp, bid_price, ask_price, updated_at')
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
            timestamp: String(row.timestamp || new Date().toISOString()),
            updated_at: String(row.updated_at || new Date().toISOString())
          };
          const existing = itemMap.get(appSymbol);

          if (!existing || (preferred && !existing.preferred)) {
            itemMap.set(appSymbol, { item, preferred });
          }
        }

        const items = Array.from(itemMap.values(), entry => entry.item);

        if (items.length > 0) {
          setMarketData(prev => {
            const symbolMap = new Map(prev.map(item => [item.symbol, item]));
            for (const item of items) symbolMap.set(item.symbol, item);
            return Array.from(symbolMap.values());
          });
          setSnapshotData(items);
          setLastSnapshotTime(Date.now());
          setConnectionState('connected');
          setError(null);
        }
      }
    } catch {
      setConnectionState('disconnected');
      setError('Stored CFD prices are temporarily unavailable');
    }
  }, []);

  const refreshFreeMarketCache = useCallback(async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    const { data: sessionResult } = await supabase.auth.getSession();
    try {
      if (!sessionResult.session) return;
      const { error: refreshError } = await supabase.functions.invoke('cfd-market-data', {
        body: { instruments: FREE_PRICE_INSTRUMENTS },
        headers: { Authorization: `Bearer ${sessionResult.session.access_token}` }
      });
      if (!refreshError) await loadDatabaseFallback();
    } finally {
      refreshInFlightRef.current = false;
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
    void refreshFreeMarketCache();
    const databaseInterval = window.setInterval(() => void loadDatabaseFallback(), 30 * 1000);
    const apiInterval = window.setInterval(() => void refreshFreeMarketCache(), 15 * 1000);
    return () => {
      window.clearInterval(databaseInterval);
      window.clearInterval(apiInterval);
    };
  }, [loadDatabaseFallback, refreshFreeMarketCache]);

  useEffect(() => {
    const channel = supabase
      .channel(`market-data-live-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'market_data' },
        payload => {
          const row = payload.new as Record<string, string | number | null>;
          if (!row?.symbol || !FREE_PRICE_INSTRUMENTS.some(item => item.symbol === row.symbol)) return;

          const rawSymbol = String(row.symbol);
          const appSymbol = resolveCfdAppSymbol(rawSymbol) || wsSymbolToAppSymbol(rawSymbol);
          const item: MarketDataItem = {
            symbol: appSymbol,
            price: Number(row.price) || 0,
            change_24h: Number(row.change_24h) || 0,
            high_price_24h: Number(row.high_price_24h) || 0,
            low_price_24h: Number(row.low_price_24h) || 0,
            volume_24h: Number(row.volume_24h) || 0,
            bid_price: row.bid_price == null ? undefined : Number(row.bid_price),
            ask_price: row.ask_price == null ? undefined : Number(row.ask_price),
            timestamp: String(row.timestamp || new Date().toISOString()),
            updated_at: String(row.updated_at || new Date().toISOString())
          };
          if (item.price <= 0) return;

          const merge = (previous: MarketDataItem[]) => {
            const next = new Map(previous.map(entry => [entry.symbol, entry]));
            next.set(item.symbol, item);
            return Array.from(next.values());
          };
          setMarketData(merge);
          setSnapshotData(merge);
          setLastSnapshotTime(Date.now());
          setConnectionState('connected');
          setError(null);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => void loadDatabaseFallback();
    const handleOffline = () => {
      setConnectionState('disconnected');
      setError('Browser is offline');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
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
