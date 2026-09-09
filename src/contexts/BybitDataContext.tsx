import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { TOP_CRYPTO_PAIRS } from '../constants/tradingPairs';
import { supabase } from '../lib/supabaseClient';

type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
type PriceDirection = 'up' | 'down' | 'neutral';

interface CryptoTickerData {
  price: number;
  change_24h: number;
  high_price_24h: number;
  low_price_24h: number;
  volume_24h: number;
  bid_price: number;
  ask_price: number;
}

interface BybitDataContextType {
  prices: Map<string, number>;
  isConnected: boolean;
  connectionState: ConnectionState;
  getPriceBySymbol: (symbol: string) => number;
  getPriceDirection: (symbol: string) => PriceDirection;
  getCryptoDataBySymbol: (symbol: string) => CryptoTickerData | null;
}

const BybitDataContext = createContext<BybitDataContextType | undefined>(undefined);

const BYBIT_WS_URL = 'wss://stream.bybit.com/v5/public/linear';
const BYBIT_REST_URL = 'https://api.bybit.com/v5/market/tickers';
const PRICE_BATCH_INTERVAL = 100;
const WS_SUBSCRIPTION_BATCH_SIZE = 10;
const WS_SUBSCRIPTION_BATCH_DELAY = 500;
const STALE_CHECK_INTERVAL = 15000;
const DB_SYNC_INTERVAL = 60000;

const CRYPTO_SYMBOLS = TOP_CRYPTO_PAIRS.map(p => p.symbol);
const CRYPTO_SYMBOL_SET = new Set(CRYPTO_SYMBOLS);

async function fetchBybitTickers(): Promise<Map<string, CryptoTickerData>> {
  const result = new Map<string, CryptoTickerData>();
  try {
    const response = await fetch(`${BYBIT_REST_URL}?category=linear`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return result;

    const json = await response.json();
    const list = json?.result?.list;
    if (!Array.isArray(list)) return result;

    for (const item of list) {
      if (!CRYPTO_SYMBOL_SET.has(item.symbol)) continue;
      const price = parseFloat(item.lastPrice);
      if (isNaN(price) || price <= 0) continue;

      result.set(item.symbol, {
        price,
        change_24h: parseFloat(item.price24hPcnt) * 100 || 0,
        high_price_24h: parseFloat(item.highPrice24h) || 0,
        low_price_24h: parseFloat(item.lowPrice24h) || 0,
        volume_24h: parseFloat(item.volume24h) || 0,
        bid_price: parseFloat(item.bid1Price) || 0,
        ask_price: parseFloat(item.ask1Price) || 0,
      });
    }
  } catch {
    // Silent fail - caller handles empty map
  }
  return result;
}

function subscribeInBatches(ws: WebSocket, symbols: string[]): void {
  const topics = symbols.map(s => `tickers.${s}`);
  for (let i = 0; i < topics.length; i += WS_SUBSCRIPTION_BATCH_SIZE) {
    const batch = topics.slice(i, i + WS_SUBSCRIPTION_BATCH_SIZE);
    const delay = (i / WS_SUBSCRIPTION_BATCH_SIZE) * WS_SUBSCRIPTION_BATCH_DELAY;

    if (delay === 0) {
      ws.send(JSON.stringify({ op: 'subscribe', args: batch }));
    } else {
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ op: 'subscribe', args: batch }));
        }
      }, delay);
    }
  }
}

export const BybitDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [prices, setPrices] = useState<Map<string, number>>(new Map());
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const pingIntervalRef = useRef<number | null>(null);
  const batchIntervalRef = useRef<number | null>(null);
  const staleCheckIntervalRef = useRef<number | null>(null);
  const lastWsMessageRef = useRef<number>(0);
  const connectRef = useRef<() => void>(() => {});

  const priceBufferRef = useRef<Map<string, number>>(new Map());
  const previousPricesRef = useRef<Map<string, number>>(new Map());
  const priceDirectionsRef = useRef<Map<string, PriceDirection>>(new Map());
  const tickerDataRef = useRef<Map<string, CryptoTickerData>>(new Map());

  const maxReconnectAttempts = 15;
  const baseReconnectDelay = 1000;
  const maxReconnectDelay = 30000;

  const applyTickerSnapshot = useCallback((snapshot: Map<string, CryptoTickerData>) => {
    if (snapshot.size === 0) return;

    snapshot.forEach((data, symbol) => {
      tickerDataRef.current.set(symbol, data);
    });

    setPrices(prev => {
      const newMap = new Map(prev);
      snapshot.forEach((data, symbol) => {
        const oldPrice = newMap.get(symbol) || 0;
        if (data.price > oldPrice) {
          priceDirectionsRef.current.set(symbol, 'up');
        } else if (data.price < oldPrice && oldPrice > 0) {
          priceDirectionsRef.current.set(symbol, 'down');
        }
        previousPricesRef.current.set(symbol, data.price);
        newMap.set(symbol, data.price);
      });
      return newMap;
    });
  }, []);

  const loadDatabaseFallback = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('market_data')
        .select('symbol, price, change_24h, high_price_24h, low_price_24h, volume_24h, bid_price, ask_price')
        .in('symbol', CRYPTO_SYMBOLS);

      if (error || !data || data.length === 0) return;

      const snapshot = new Map<string, CryptoTickerData>();
      for (const row of data) {
        const price = parseFloat(row.price);
        if (isNaN(price) || price <= 0) continue;
        snapshot.set(row.symbol, {
          price,
          change_24h: parseFloat(row.change_24h) || 0,
          high_price_24h: parseFloat(row.high_price_24h) || 0,
          low_price_24h: parseFloat(row.low_price_24h) || 0,
          volume_24h: parseFloat(row.volume_24h) || 0,
          bid_price: row.bid_price ? parseFloat(row.bid_price) : 0,
          ask_price: row.ask_price ? parseFloat(row.ask_price) : 0,
        });
      }

      setPrices(prev => {
        if (prev.size > 0) return prev;
        const newMap = new Map<string, number>();
        snapshot.forEach((data, symbol) => {
          newMap.set(symbol, data.price);
          previousPricesRef.current.set(symbol, data.price);
          tickerDataRef.current.set(symbol, data);
        });
        return newMap;
      });
    } catch {
      // Silent fail
    }
  }, []);

  const loadRestSnapshot = useCallback(async () => {
    const snapshot = await fetchBybitTickers();
    applyTickerSnapshot(snapshot);
  }, [applyTickerSnapshot]);

  const flushPriceBuffer = useCallback(() => {
    if (priceBufferRef.current.size === 0) return;

    const bufferedPrices = new Map(priceBufferRef.current);
    priceBufferRef.current.clear();

    bufferedPrices.forEach((newPrice, symbol) => {
      const prevPrice = previousPricesRef.current.get(symbol) || 0;
      if (newPrice > prevPrice) {
        priceDirectionsRef.current.set(symbol, 'up');
      } else if (newPrice < prevPrice) {
        priceDirectionsRef.current.set(symbol, 'down');
      }
      previousPricesRef.current.set(symbol, newPrice);
    });

    setPrices(prev => {
      const newMap = new Map(prev);
      bufferedPrices.forEach((price, symbol) => {
        newMap.set(symbol, price);
      });
      return newMap;
    });
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      setConnectionState('disconnected');
      return;
    }

    setConnectionState('reconnecting');
    reconnectAttemptsRef.current += 1;

    const delay = Math.min(
      baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current - 1),
      maxReconnectDelay
    );

    reconnectTimeoutRef.current = window.setTimeout(() => {
      connectRef.current();
    }, delay);
  }, []);

  const connect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* ignore */ }
      wsRef.current = null;
    }

    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    setConnectionState('connecting');

    try {
      const ws = new WebSocket(BYBIT_WS_URL);

      ws.onopen = () => {
        setConnectionState('connected');
        reconnectAttemptsRef.current = 0;
        lastWsMessageRef.current = Date.now();

        subscribeInBatches(ws, CRYPTO_SYMBOLS);

        pingIntervalRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ op: 'ping' }));
          }
        }, 20000);

        if (!batchIntervalRef.current) {
          batchIntervalRef.current = window.setInterval(flushPriceBuffer, PRICE_BATCH_INTERVAL);
        }
      };

      ws.onclose = () => {
        setConnectionState('disconnected');
        wsRef.current = null;
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        scheduleReconnect();
      };

      ws.onerror = () => {
        setConnectionState('disconnected');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          lastWsMessageRef.current = Date.now();

          if (message.topic && message.topic.startsWith('tickers.') && message.data) {
            const data = message.data;
            const symbol = data.symbol;
            const price = parseFloat(data.lastPrice);

            if (symbol && !isNaN(price) && price > 0) {
              priceBufferRef.current.set(symbol, price);

              const existing = tickerDataRef.current.get(symbol);
              const updated: CryptoTickerData = {
                price,
                change_24h: data.price24hPcnt !== undefined
                  ? parseFloat(data.price24hPcnt) * 100
                  : (existing?.change_24h ?? 0),
                high_price_24h: data.highPrice24h !== undefined
                  ? parseFloat(data.highPrice24h)
                  : (existing?.high_price_24h ?? 0),
                low_price_24h: data.lowPrice24h !== undefined
                  ? parseFloat(data.lowPrice24h)
                  : (existing?.low_price_24h ?? 0),
                volume_24h: data.volume24h !== undefined
                  ? parseFloat(data.volume24h)
                  : (existing?.volume_24h ?? 0),
                bid_price: data.bid1Price !== undefined
                  ? parseFloat(data.bid1Price)
                  : (existing?.bid_price ?? 0),
                ask_price: data.ask1Price !== undefined
                  ? parseFloat(data.ask1Price)
                  : (existing?.ask_price ?? 0),
              };
              tickerDataRef.current.set(symbol, updated);
            }
          }
        } catch {
          // Ignore parse errors
        }
      };

      wsRef.current = ws;
    } catch {
      scheduleReconnect();
    }
  }, [flushPriceBuffer, scheduleReconnect]);

  connectRef.current = connect;

  useEffect(() => {
    loadDatabaseFallback();
    loadRestSnapshot();
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (batchIntervalRef.current) {
        clearInterval(batchIntervalRef.current);
        batchIntervalRef.current = null;
      }
      if (staleCheckIntervalRef.current) {
        clearInterval(staleCheckIntervalRef.current);
        staleCheckIntervalRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, loadDatabaseFallback, loadRestSnapshot]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadRestSnapshot();
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          reconnectAttemptsRef.current = 0;
          connect();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [connect, loadRestSnapshot]);

  useEffect(() => {
    const handleOnline = () => {
      reconnectAttemptsRef.current = 0;
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        connect();
      }
    };

    const handleOffline = () => {
      setConnectionState('disconnected');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [connect]);

  useEffect(() => {
    staleCheckIntervalRef.current = window.setInterval(async () => {
      const now = Date.now();
      const timeSinceLastMessage = now - lastWsMessageRef.current;

      if (timeSinceLastMessage > STALE_CHECK_INTERVAL && lastWsMessageRef.current > 0) {
        const snapshot = await fetchBybitTickers();
        applyTickerSnapshot(snapshot);

        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          reconnectAttemptsRef.current = 0;
          connectRef.current();
        }
      }
    }, STALE_CHECK_INTERVAL);

    return () => {
      if (staleCheckIntervalRef.current) {
        clearInterval(staleCheckIntervalRef.current);
        staleCheckIntervalRef.current = null;
      }
    };
  }, [applyTickerSnapshot]);

  const syncCryptoPricesToDatabase = useCallback(async () => {
    if (prices.size === 0) return;

    try {
      const timestamp = new Date().toISOString();
      const pricesToSync: Array<{
        symbol: string;
        price: number;
        change_24h: number;
        high_price_24h: number;
        low_price_24h: number;
        volume_24h: number;
        bid_price: number;
        ask_price: number;
        timestamp: string;
        updated_at: string;
      }> = [];

      prices.forEach((price, symbol) => {
        if (price <= 0) return;
        const ticker = tickerDataRef.current.get(symbol);
        pricesToSync.push({
          symbol,
          price,
          change_24h: ticker?.change_24h ?? 0,
          high_price_24h: ticker?.high_price_24h ?? 0,
          low_price_24h: ticker?.low_price_24h ?? 0,
          volume_24h: ticker?.volume_24h ?? 0,
          bid_price: ticker?.bid_price ?? 0,
          ask_price: ticker?.ask_price ?? 0,
          timestamp,
          updated_at: timestamp,
        });
      });

      if (pricesToSync.length === 0) return;

      await supabase.from('market_data').upsert(pricesToSync, {
        onConflict: 'symbol',
        ignoreDuplicates: false,
      });
    } catch {
      // Silent fail
    }
  }, [prices]);

  useEffect(() => {
    const syncInterval = setInterval(syncCryptoPricesToDatabase, DB_SYNC_INTERVAL);
    return () => clearInterval(syncInterval);
  }, [syncCryptoPricesToDatabase]);

  const getPriceBySymbol = useCallback((symbol: string): number => {
    return prices.get(symbol) || 0;
  }, [prices]);

  const getPriceDirection = useCallback((symbol: string): PriceDirection => {
    return priceDirectionsRef.current.get(symbol) || 'neutral';
  }, []);

  const getCryptoDataBySymbol = useCallback((symbol: string): CryptoTickerData | null => {
    return tickerDataRef.current.get(symbol) || null;
  }, []);

  const isConnected = connectionState === 'connected';

  const contextValue: BybitDataContextType = {
    prices,
    isConnected,
    connectionState,
    getPriceBySymbol,
    getPriceDirection,
    getCryptoDataBySymbol,
  };

  return (
    <BybitDataContext.Provider value={contextValue}>
      {children}
    </BybitDataContext.Provider>
  );
};

export const useBybitData = (): BybitDataContextType => {
  const context = useContext(BybitDataContext);
  if (context === undefined) {
    throw new Error('useBybitData must be used within a BybitDataProvider');
  }
  return context;
};
