import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TradingMode } from '../App';
import { getCfdInstrument } from '../constants/tradingPairs';
import { useBybitData } from '../contexts/BybitDataContext';
import { useMarketData } from '../contexts/MarketDataContext';
import { useFiatCurrency } from '../hooks/useFiatCurrency';

interface OrderBookEntry {
  price: number;
  amount: number;
  total: number;
}

interface OrderBookProps {
  selectedPair: string;
  compact?: boolean;
  orderBook?: { bids: OrderBookEntry[]; asks: OrderBookEntry[]; lastUpdateId: number };
  tradingMode: TradingMode;
}

type BybitBookMessage = {
  topic?: string;
  type?: 'snapshot' | 'delta';
  data?: { s?: string; u?: number; b?: string[][]; a?: string[][] };
};

const buildLevels = (levels: Map<number, number>, side: 'bid' | 'ask'): OrderBookEntry[] => {
  const sorted = [...levels.entries()]
    .sort((left, right) => side === 'bid' ? right[0] - left[0] : left[0] - right[0])
    .slice(0, 50);
  let total = 0;
  return sorted.map(([price, amount]) => {
    total += amount;
    return { price, amount, total };
  });
};

const OrderBook: React.FC<OrderBookProps> = ({ selectedPair, orderBook, tradingMode, compact = false }) => {
  const { getPriceBySymbol: getCryptoPrice } = useBybitData();
  const { getPriceBySymbol: getCfdPrice } = useMarketData();
  const { convertUsdToEur, formatFiatNumber } = useFiatCurrency();
  const [displayMode, setDisplayMode] = useState<'both' | 'bids' | 'asks'>('both');
  const [liveBook, setLiveBook] = useState<{ bids: OrderBookEntry[]; asks: OrderBookEntry[]; lastUpdateId: number } | null>(null);
  const [bookState, setBookState] = useState<'connecting' | 'live' | 'unavailable'>('connecting');
  const bidsRef = useRef(new Map<number, number>());
  const asksRef = useRef(new Map<number, number>());
  const reconnectRef = useRef<number | null>(null);

  const isFutures = tradingMode === 'futures';
  const currentPrice = isFutures ? getCryptoPrice(selectedPair) : getCfdPrice(selectedPair);
  const usesNativeForexRate = tradingMode === 'cfd' && getCfdInstrument(selectedPair)?.type === 'forex';

  useEffect(() => {
    bidsRef.current.clear();
    asksRef.current.clear();
    setLiveBook(null);
    if (!isFutures || orderBook) {
      setBookState(orderBook ? 'live' : 'unavailable');
      return;
    }

    let disposed = false;
    let socket: WebSocket | null = null;
    let pingTimer: number | null = null;
    setBookState('connecting');

    const connect = () => {
      if (disposed) return;
      socket = new WebSocket('wss://stream.bybit.com/v5/public/linear');
      socket.onopen = () => {
        socket?.send(JSON.stringify({ op: 'subscribe', args: [`orderbook.50.${selectedPair}`] }));
        pingTimer = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ op: 'ping' }));
        }, 20_000);
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as BybitBookMessage;
          if (!message.topic?.startsWith('orderbook.') || message.data?.s !== selectedPair) return;
          if (message.type === 'snapshot') {
            bidsRef.current.clear();
            asksRef.current.clear();
          }
          for (const [priceText, sizeText] of message.data.b || []) {
            const price = Number(priceText);
            const size = Number(sizeText);
            if (size === 0) bidsRef.current.delete(price);
            else if (price > 0 && size > 0) bidsRef.current.set(price, size);
          }
          for (const [priceText, sizeText] of message.data.a || []) {
            const price = Number(priceText);
            const size = Number(sizeText);
            if (size === 0) asksRef.current.delete(price);
            else if (price > 0 && size > 0) asksRef.current.set(price, size);
          }
          setLiveBook({
            bids: buildLevels(bidsRef.current, 'bid'),
            asks: buildLevels(asksRef.current, 'ask'),
            lastUpdateId: message.data.u || Date.now(),
          });
          setBookState('live');
        } catch {
          // Ignore malformed provider frames; the next valid delta repairs the view.
        }
      };
      socket.onerror = () => setBookState('unavailable');
      socket.onclose = () => {
        if (pingTimer) window.clearInterval(pingTimer);
        if (!disposed) {
          setBookState('connecting');
          reconnectRef.current = window.setTimeout(connect, 3000);
        }
      };
    };

    connect();
    return () => {
      disposed = true;
      if (pingTimer) window.clearInterval(pingTimer);
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      socket?.close();
    };
  }, [isFutures, orderBook, selectedPair]);

  const displayBook = orderBook || liveBook;
  const asks = displayBook?.asks || [];
  const bids = displayBook?.bids || [];
  const maxDepth = Math.max(
    asks.length ? asks[asks.length - 1].total : 0,
    bids.length ? bids[bids.length - 1].total : 0,
    1,
  );
  const pricePrecision = useMemo(() => {
    if (usesNativeForexRate) return 5;
    if (currentPrice >= 1000) return 2;
    if (currentPrice >= 1) return 4;
    return 6;
  }, [currentPrice, usesNativeForexRate]);
  const formatPrice = (price: number) => usesNativeForexRate
    ? price.toFixed(pricePrecision)
    : formatFiatNumber(convertUsdToEur(price), pricePrecision);
  const baseAsset = selectedPair.replace('USDT', '').split('/')[0];

  const renderLevel = (entry: OrderBookEntry, side: 'bid' | 'ask', index: number) => (
    <div key={`${side}-${entry.price}-${index}`} className={`relative grid grid-cols-3 text-xs ${compact ? 'px-2 py-1.5' : 'p-2'}`}>
      <div className={side === 'bid' ? 'text-emerald-400' : 'text-rose-400'}>{formatPrice(entry.price)}</div>
      <div className="text-right font-mono text-slate-200">{entry.amount.toFixed(4)}</div>
      <div className="text-right font-mono text-slate-300">{entry.total.toFixed(4)}</div>
      <div
        className={`pointer-events-none absolute inset-y-0 right-0 ${side === 'bid' ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}
        style={{ width: `${Math.min(100, entry.total / maxDepth * 100)}%` }}
      />
    </div>
  );

  return (
    <div className={`flex h-full ${compact ? 'min-h-0' : 'min-h-[320px]'} flex-col bg-[#0b0e11]`} translate="no">
      <div className={`flex shrink-0 items-center justify-between border-b border-white/[0.07] ${compact ? 'h-11 px-3' : 'p-4'}`}>
        {!compact && <h3 className="text-sm font-semibold text-white">Order book</h3>}
        <div className="flex items-center gap-1">
          {(['both', 'bids', 'asks'] as const).map((mode) => (
            <button key={mode} type="button" onClick={() => setDisplayMode(mode)}
              className={`rounded px-2 py-1 text-[11px] capitalize ${displayMode === mode ? 'bg-violet-500/20 text-violet-200' : 'text-slate-500 hover:text-slate-200'}`}>
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-color:#475569_transparent] [scrollbar-width:thin]">
        <div className="sticky top-0 z-10 grid grid-cols-3 border-b border-white/[0.07] bg-[#0b0e11] p-2 text-[11px] text-slate-500">
          <div>Price ({usesNativeForexRate ? 'Rate' : 'EUR'})</div>
          <div className="text-right">Amount ({baseAsset})</div>
          <div className="text-right">Total ({baseAsset})</div>
        </div>

        {!displayBook && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-2 px-4 text-center text-xs text-slate-500">
            <span>{bookState === 'connecting' ? 'Connecting to live depth…' : 'Live market depth is unavailable for this instrument.'}</span>
            {!isFutures && <span className="text-[10px] text-slate-600">Synthetic orders are not displayed.</span>}
          </div>
        )}

        {displayBook && (displayMode === 'both' || displayMode === 'asks') && (
          <div className="border-b border-white/[0.07]">{asks.slice().reverse().map((entry, index) => renderLevel(entry, 'ask', index))}</div>
        )}
        {displayBook && displayMode === 'both' && (
          <div className="grid grid-cols-3 border-b border-white/[0.07] bg-white/[0.025] p-2 text-xs">
            <div className="font-mono font-semibold text-cyan-400">{currentPrice > 0 ? formatPrice(currentPrice) : '—'}</div>
            <div className="text-right text-slate-500">Mark price</div><div />
          </div>
        )}
        {displayBook && (displayMode === 'both' || displayMode === 'bids') && (
          <div>{bids.map((entry, index) => renderLevel(entry, 'bid', index))}</div>
        )}
      </div>
    </div>
  );
};

export default OrderBook;
