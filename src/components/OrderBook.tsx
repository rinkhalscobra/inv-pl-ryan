import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp, TrendingDown, Activity, ChevronDown, Check } from 'lucide-react';
import { useMarketData } from '../contexts/MarketDataContext';
import { TradingMode } from '../App';
import { getCfdInstrument } from '../constants/tradingPairs';
import { useFiatCurrency } from '../hooks/useFiatCurrency';

interface OrderBookEntry {
  price: number;
  amount: number;
  total: number;
}

interface OrderBookEntry {
  price: number;
  amount: number;
  total: number;
}

interface OrderBookProps {
  selectedPair: string;
  orderBook?: {  // Made optional since we're not passing it anymore
    bids: OrderBookEntry[];
    asks: OrderBookEntry[];
    lastUpdateId: number;
  };
  tradingMode: TradingMode;
}

interface OrderBookDropdownOption {
  label: string;
  value: number;
}

interface OrderBookDropdownProps {
  value: number;
  options: OrderBookDropdownOption[];
  onChange: (value: number) => void;
  align?: 'left' | 'right';
}

const OrderBookDropdown: React.FC<OrderBookDropdownProps> = ({
  value,
  options,
  onChange,
  align = 'right',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex min-w-[72px] items-center justify-between gap-2 rounded-lg border border-purple-500/35 app-action-soft px-3 py-1.5 text-white shadow-lg shadow-purple-950/20 transition-colors hover:from-indigo-500/24 hover:via-purple-500/26 hover:to-fuchsia-500/22"
      >
        <span className="font-medium">{selectedOption?.label ?? value}</span>
        <ChevronDown
          size={14}
          className={`text-purple-200 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute bottom-full z-20 mb-2 min-w-full overflow-hidden rounded-xl app-dropdown ${
            align === 'left' ? 'left-0' : 'right-0'
          }`}
        >
          <div className="p-1.5">
            {options.map((option) => {
              const isSelected = option.value === value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-white transition-colors ${
                    isSelected
                      ? 'bg-gradient-to-r from-indigo-500/20 via-purple-500/22 to-fuchsia-500/18'
                      : 'hover:bg-gradient-to-r hover:from-indigo-500/12 hover:via-purple-500/14 hover:to-fuchsia-500/12'
                  }`}
                >
                  <span className={isSelected ? 'text-white' : 'text-slate-200'}>{option.label}</span>
                  {isSelected ? <Check size={14} className="text-purple-200" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const OrderBook: React.FC<OrderBookProps> = ({
  selectedPair,
  orderBook,
  tradingMode
}) => {
  const { t } = useTranslation();
  const { getPriceBySymbol } = useMarketData();
  const { convertUsdToEur, formatFiatNumber } = useFiatCurrency();
  const [displayMode, setDisplayMode] = useState<'both' | 'bids' | 'asks'>('both');
  const [precision, setPrecision] = useState(2);
  const [grouping, setGrouping] = useState(0.5);
  const [spread, setSpread] = useState(0);
  const [spreadPercentage, setSpreadPercentage] = useState(0);
  const currentPrice = getPriceBySymbol(selectedPair);
  const usesNativeForexRate = tradingMode === 'cfd' && getCfdInstrument(selectedPair)?.type === 'forex';
  const isFuturesTheme = tradingMode === 'futures';
  const panelSurfaceClass = isFuturesTheme
    ? 'app-surface-primary'
    : 'bg-slate-800';
  const headerSurfaceClass = isFuturesTheme
    ? 'app-surface-muted'
    : 'bg-slate-800';
  const priceSurfaceClass = isFuturesTheme
    ? 'app-surface-muted'
    : 'bg-slate-700/30';
  const precisionOptions: OrderBookDropdownOption[] = [
    { label: '0', value: 0 },
    { label: '1', value: 1 },
    { label: '2', value: 2 },
    { label: '3', value: 3 },
    { label: '4', value: 4 },
  ];
  const groupingOptions: OrderBookDropdownOption[] = [
    { label: '0.1', value: 0.1 },
    { label: '0.5', value: 0.5 },
    { label: '1.0', value: 1 },
    { label: '5.0', value: 5 },
  ];

  // Generate simulated order book data if real data is not available
  const generateSimulatedOrderBook = () => {
    const simulatedAsks: OrderBookEntry[] = [];
    const simulatedBids: OrderBookEntry[] = [];
    
    // Generate asks (sell orders) above current price
    let askTotal = 0;
    for (let i = 0; i < 15; i++) {
      const price = currentPrice * (1 + (i + 1) * 0.0005);
      const amount = Math.random() * 2 + 0.1;
      askTotal += amount;
      simulatedAsks.push({
        price,
        amount,
        total: askTotal
      });
    }
    
    // Generate bids (buy orders) below current price
    let bidTotal = 0;
    for (let i = 0; i < 15; i++) {
      const price = currentPrice * (1 - (i + 1) * 0.0005);
      const amount = Math.random() * 2 + 0.1;
      bidTotal += amount;
      simulatedBids.push({
        price,
        amount,
        total: bidTotal
      });
    }
    
    return {
      asks: simulatedAsks,
      bids: simulatedBids,
      lastUpdateId: Date.now()
    };
  };

  // Keep simulated book in state
const [simulatedOrderBook, setSimulatedOrderBook] = useState(generateSimulatedOrderBook());

// Update gradually every second
useEffect(() => {
  const interval = setInterval(() => {
    setSimulatedOrderBook(prev => {
      if (!prev) return generateSimulatedOrderBook();

      // Drift asks slightly
      let askTotal = 0;
      const newAsks = prev.asks.map(ask => {
        const newPrice = ask.price * (1 + (Math.random() - 0.5) * 0.0002); // small random walk
        const newAmount = Math.max(0.01, ask.amount * (1 + (Math.random() - 0.5) * 0.05)); // ±5%
        askTotal += newAmount;
        return { ...ask, price: newPrice, amount: newAmount, total: askTotal };
      });

      // Drift bids slightly
      let bidTotal = 0;
      const newBids = prev.bids.map(bid => {
        const newPrice = bid.price * (1 + (Math.random() - 0.5) * 0.0002);
        const newAmount = Math.max(0.01, bid.amount * (1 + (Math.random() - 0.5) * 0.05));
        bidTotal += newAmount;
        return { ...bid, price: newPrice, amount: newAmount, total: bidTotal };
      });

      return { asks: newAsks, bids: newBids, lastUpdateId: Date.now() };
    });
  }, 1000); // update every 1s

  return () => clearInterval(interval);
}, [currentPrice]);

// Use real order book if available, otherwise the slower simulated one
const displayOrderBook = orderBook && orderBook.bids.length > 0 && orderBook.asks.length > 0
  ? orderBook
  : simulatedOrderBook;


  // Format price based on precision
  const formatPrice = (price: number) => {
    return usesNativeForexRate
      ? price.toFixed(precision)
      : formatFiatNumber(price, precision);
  };

  // Format amount
  const formatAmount = (amount: number) => {
    return amount.toFixed(4);
  };

  // Format total
  const formatTotal = (total: number) => {
    return usesNativeForexRate
      ? total.toFixed(4)
      : convertUsdToEur(total).toFixed(4);
  };

  // Calculate depth percentage for visualization
  const calculateDepthPercentage = (total: number, maxTotal: number) => {
    return (total / maxTotal) * 100;
  };

  // Get max total for visualization scaling
  const maxBidTotal = displayOrderBook.bids.length > 0
    ? displayOrderBook.bids[displayOrderBook.bids.length - 1].total
    : 0;
    
  const maxAskTotal = displayOrderBook.asks.length > 0
    ? displayOrderBook.asks[displayOrderBook.asks.length - 1].total
    : 0;

  return (
    <div className={`${panelSurfaceClass} flex h-full min-h-[320px] flex-col`} translate="no">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-slate-700 p-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-purple-400 font-semibold">Order Book</h3>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setDisplayMode('both')}
            className={`text-xs px-2 py-1 rounded ${
              displayMode === 'both'
                ? 'bg-gradient-to-r from-indigo-500/20 via-purple-500/22 to-fuchsia-500/18 text-purple-200'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Both
          </button>
          <button
            onClick={() => setDisplayMode('bids')}
            className={`text-xs px-2 py-1 rounded ${
              displayMode === 'bids'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Bids
          </button>
          <button
            onClick={() => setDisplayMode('asks')}
            className={`text-xs px-2 py-1 rounded ${
              displayMode === 'asks'
                ? 'bg-red-500/20 text-red-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Asks
          </button>
        </div>
      </div>

      {/* Order Book Content */}
      <div
        className={`flex-1 overflow-auto ${
          tradingMode === 'futures'
            ? '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
            : '[scrollbar-color:#fb923c_#1e293b] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-slate-800 [&::-webkit-scrollbar-thumb]:bg-orange-400 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-[2px] [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-slate-800'
        }`}
        translate="no"
      >
        {/* Column Headers */}
        <div className={`sticky top-0 grid grid-cols-3 border-b border-slate-700 p-2 text-[11px] text-slate-400 sm:text-xs ${headerSurfaceClass}`}>
          <div>Price ({usesNativeForexRate ? 'Rate' : 'EUR'})</div>
          <div className="text-right">Amount ({selectedPair.replace('USDT', '').substring(0, 3)})</div>
          <div className="text-right">Total</div>
        </div>

        {/* Asks (Sell Orders) - Only show if displayMode is 'both' or 'asks' */}
        {(displayMode === 'both' || displayMode === 'asks') && (
          <div className="border-b border-slate-700">
            {displayOrderBook.asks.slice().reverse().map((ask, index) => (
              <div key={`ask-${index}`} className="grid grid-cols-3 text-xs p-2 relative">
                <div className="text-red-400">{formatPrice(ask.price)}</div>
                <div className="text-right">{formatAmount(ask.amount)}</div>
                <div className="text-right">{formatTotal(ask.total)}</div>
                <div
                  className="absolute right-0 top-0 bottom-0 bg-red-500/10"
                  style={{ width: `${calculateDepthPercentage(ask.total, maxAskTotal)}%` }}
                ></div>
              </div>
            ))}
          </div>
        )}

        {/* Current Price */}
        {displayMode === 'both' && (
          <div className={`grid grid-cols-3 border-b border-slate-700 p-2 text-xs ${priceSurfaceClass}`}>
            <div className="text-cyan-400 font-bold">{formatPrice(currentPrice)}</div>
            <div className="text-right text-slate-400">Current Price</div>
            <div className="text-right"></div>
          </div>
        )}

        {/* Bids (Buy Orders) - Only show if displayMode is 'both' or 'bids' */}
        {(displayMode === 'both' || displayMode === 'bids') && (
          <div>
            {displayOrderBook.bids.map((bid, index) => (
              <div key={`bid-${index}`} className="grid grid-cols-3 text-xs p-2 relative">
                <div className="text-emerald-400">{formatPrice(bid.price)}</div>
                <div className="text-right">{formatAmount(bid.amount)}</div>
                <div className="text-right">{formatTotal(bid.total)}</div>
                <div
                  className="absolute right-0 top-0 bottom-0 bg-emerald-500/10"
                  style={{ width: `${calculateDepthPercentage(bid.total, maxBidTotal)}%` }}
                ></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-3 border-t border-slate-700 p-3 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-3 sm:justify-start">
          <span>Precision: </span>
          {isFuturesTheme ? (
            <OrderBookDropdown
              value={precision}
              options={precisionOptions}
              onChange={setPrecision}
              align="left"
            />
          ) : (
            <select
              value={precision}
              onChange={(e) => setPrecision(parseInt(e.target.value))}
              className="rounded border border-slate-600 bg-slate-700 px-2 py-1 text-white"
            >
              <option value="0">0</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
            </select>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-start">
          <span>Group: </span>
          {isFuturesTheme ? (
            <OrderBookDropdown
              value={grouping}
              options={groupingOptions}
              onChange={setGrouping}
              align="right"
            />
          ) : (
            <select
              value={grouping}
              onChange={(e) => setGrouping(parseFloat(e.target.value))}
              className="rounded border border-slate-600 bg-slate-700 px-2 py-1 text-white"
            >
              <option value="0.1">0.1</option>
              <option value="0.5">0.5</option>
              <option value="1">1.0</option>
              <option value="5">5.0</option>
            </select>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderBook;


