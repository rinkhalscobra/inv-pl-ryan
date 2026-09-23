import React, { useMemo, useState } from 'react';
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

const OrderBook: React.FC<OrderBookProps> = ({ selectedPair, orderBook, tradingMode, compact = false }) => {
  const { getPriceBySymbol: getCryptoPrice, getCryptoDataBySymbol } = useBybitData();
  const { getPriceBySymbol: getCfdPrice } = useMarketData();
  const { convertUsdToEur, formatFiatNumber } = useFiatCurrency();
  const [displayMode, setDisplayMode] = useState<'both' | 'bids' | 'asks'>('both');
  const isFutures = tradingMode === 'futures';
  const currentPrice = isFutures ? getCryptoPrice(selectedPair) : getCfdPrice(selectedPair);
  const cryptoQuote = isFutures ? getCryptoDataBySymbol(selectedPair) : null;
  const usesNativeForexRate = tradingMode === 'cfd' && getCfdInstrument(selectedPair)?.type === 'forex';

  const displayBook = orderBook;
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
        {!compact && <h3 className="text-sm font-semibold text-white">{displayBook ? 'Order book' : 'Market reference'}</h3>}
        {displayBook && <div className="flex items-center gap-1">
          {(['both', 'bids', 'asks'] as const).map((mode) => (
            <button key={mode} type="button" onClick={() => setDisplayMode(mode)}
              className={`rounded px-2 py-1 text-[11px] capitalize ${displayMode === mode ? 'bg-violet-500/20 text-violet-200' : 'text-slate-500 hover:text-slate-200'}`}>
              {mode}
            </button>
          ))}
        </div>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-color:#475569_transparent] [scrollbar-width:thin]">
        {displayBook && <div className="sticky top-0 z-10 grid grid-cols-3 border-b border-white/[0.07] bg-[#0b0e11] p-2 text-[11px] text-slate-500">
          <div>Price ({usesNativeForexRate ? 'Rate' : 'EUR'})</div>
          <div className="text-right">Amount ({baseAsset})</div>
          <div className="text-right">Total ({baseAsset})</div>
        </div>}

        {!displayBook && (
          <div className="space-y-4 px-4 py-5 text-xs text-slate-400">
            <div className="text-[10px] uppercase tracking-widest text-slate-500">Market reference quote</div>
            <div className="font-mono text-2xl font-semibold text-white">{currentPrice > 0 ? formatPrice(currentPrice) : '--'}</div>
            {cryptoQuote && <div className="grid grid-cols-2 gap-3 border-t border-white/[0.07] pt-4">
              <div><div className="text-slate-500">24h change</div><div className={cryptoQuote.change_24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{cryptoQuote.change_24h.toFixed(2)}%</div></div>
              <div><div className="text-slate-500">Source time</div><div className="text-slate-200">{new Date(cryptoQuote.timestamp).toLocaleTimeString()}</div></div>
              <div><div className="text-slate-500">24h high</div><div className="text-slate-200">{cryptoQuote.high_price_24h > 0 ? formatPrice(cryptoQuote.high_price_24h) : '--'}</div></div>
              <div><div className="text-slate-500">24h low</div><div className="text-slate-200">{cryptoQuote.low_price_24h > 0 ? formatPrice(cryptoQuote.low_price_24h) : '--'}</div></div>
            </div>}
            <div className="border-t border-white/[0.07] pt-3 text-slate-500">Order book depth is unavailable for this market.</div>
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
