import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Calendar, Activity, Info } from 'lucide-react';
import { CFD_INSTRUMENTS } from '../constants/tradingPairs';
import HotTradingPairs from './HotTradingPairs';
import { useMarketData } from '../contexts/MarketDataContext';
import { useFiatCurrency } from '../hooks/useFiatCurrency';

interface PairDetailsPanelProps {
  selectedPair: string;
  currentPrice: number;
  tradingMode: 'cfd' | 'futures';
  onPairSelect?: (symbol: string) => void;
  compact?: boolean;
}

interface PairStats {
  dayHigh: number;
  dayLow: number;
  prevClose: number;
  open: number;
  volume24h: number;
  priceChange24h: number;
  priceChangePercent24h: number;
}

export default function PairDetailsPanel({ selectedPair, currentPrice, tradingMode, onPairSelect, compact = false }: PairDetailsPanelProps) {
  const panelSurfaceClass = 'app-surface-primary';
  const itemSurfaceClass = 'app-surface-muted';
  const infoSurfaceClass = 'app-surface-raised';
  const [stats, setStats] = useState<PairStats>({
    dayHigh: 0,
    dayLow: 0,
    prevClose: 0,
    open: 0,
    volume24h: 0,
    priceChange24h: 0,
    priceChangePercent24h: 0
  });

  const { getMarketDataBySymbol } = useMarketData();
  const { code, formatFiatNumber, formatFiatCompact } = useFiatCurrency();
  const instrument = CFD_INSTRUMENTS.find(item => item.symbol === selectedPair);
  const pairName = instrument?.name || selectedPair;
  const pairType = instrument?.type || 'forex';

  useEffect(() => {
    const marketData = getMarketDataBySymbol(selectedPair);

    if (marketData && marketData.price > 0) {
      const changePercent24h = marketData.change_24h || 0;
      const prevClose = changePercent24h > -100
        ? marketData.price / (1 + (changePercent24h / 100)) : 0;
      const absoluteChange = marketData.price - prevClose;

      setStats({
        dayHigh: marketData.high_price_24h || 0,
        dayLow: marketData.low_price_24h || 0,
        prevClose: prevClose,
        open: prevClose,
        volume24h: marketData.volume_24h || 0,
        priceChange24h: absoluteChange,
        priceChangePercent24h: changePercent24h
      });
    } else {
      setStats({
        dayHigh: 0, dayLow: 0, prevClose: 0, open: 0,
        volume24h: 0, priceChange24h: 0, priceChangePercent24h: 0
      });
    }
  }, [currentPrice, selectedPair, getMarketDataBySymbol]);

  const marketData = getMarketDataBySymbol(selectedPair);
  const actualPrice = marketData?.price || currentPrice;

  const isPositive = stats.priceChange24h >= 0;
  const formatDisplayedPrice = (value: number) => value <= 0 ? '--' : pairType === 'forex'
    ? value.toFixed(5)
    : formatFiatNumber(value, 2);
  const displayPrice = formatDisplayedPrice(actualPrice);
  const dayRange = actualPrice > 0 && stats.dayHigh > stats.dayLow
    ? Math.max(0, Math.min(100, ((actualPrice - stats.dayLow) / (stats.dayHigh - stats.dayLow)) * 100)) : 50;
  const quoteTime = Date.parse(marketData?.timestamp || '');
  const lastUpdate = Number.isFinite(quoteTime) ? new Date(quoteTime).toLocaleTimeString() : '--';

  const getTypeLabel = (type: string) => {
    switch(type) {
      case 'forex': return 'FOREX';
      case 'commodity': return 'COMMODITY';
      case 'stock': return 'STOCK';
      case 'index': return 'INDEX';
      case 'crypto': return 'CRYPTO';
      default: return type.toUpperCase();
    }
  };

  const getTypeColor = (type: string) => {
    switch(type) {
      case 'forex': return 'bg-indigo-500/18 text-blue-400 border-purple-500/25';
      case 'commodity': return 'bg-indigo-500/18 text-yellow-400 border-purple-500/25';
      case 'stock': return 'bg-purple-500/18 text-green-400 border-purple-500/25';
      case 'index': return 'bg-gradient-to-r from-indigo-500/18 to-fuchsia-500/18 text-purple-300 border-purple-500/25';
      case 'crypto': return 'bg-indigo-500/18 text-orange-400 border-purple-500/25';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  return (
    <div className={`${compact ? 'cfd-details-compact' : ''} h-full flex flex-col`}>
      <div className="flex-1 overflow-y-auto hide-scrollbar">
        <div className="p-6 space-y-4">
          <div className={`${panelSurfaceClass} rounded-xl border border-purple-500/30 p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-white">{pairName}</h2>
              <span className={`px-3 py-1 rounded-lg text-xs font-semibold border ${getTypeColor(pairType)}`}>
                {getTypeLabel(pairType)}
              </span>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-bold text-white">
                  {displayPrice}
                </span>
                <span className="text-xl text-slate-400">
                  {pairType === 'forex' ? 'RATE' : code}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {isPositive ? (
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-red-400" />
                )}
                <span className={`text-lg font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isPositive ? '+' : ''}{formatDisplayedPrice(stats.priceChange24h)}
                </span>
                <span className={`text-lg font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isPositive ? '+' : ''}{stats.priceChangePercent24h.toFixed(2)}%
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Calendar className="w-4 h-4" />
              <span>Quote time: {lastUpdate}</span>
            </div>
          </div>

          <div className={`${itemSurfaceClass} rounded-xl border border-purple-500/25 p-6`}>
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-semibold text-white">Day Range</h3>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">{formatDisplayedPrice(stats.dayLow)}</span>
                <span className="text-slate-400">{formatDisplayedPrice(stats.dayHigh)}</span>
              </div>

              {stats.dayHigh > stats.dayLow && (
                <div className="relative h-2 overflow-hidden rounded-full bg-gradient-to-r from-indigo-500/12 via-purple-500/12 to-fuchsia-500/12">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 transition-all duration-500"
                    style={{ width: `${dayRange}%` }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg transition-all duration-500"
                    style={{ left: `calc(${dayRange}% - 6px)` }}
                  />
                </div>
              )}
            </div>
          </div>

          <div className={`${itemSurfaceClass} rounded-xl border border-purple-500/25 p-6`}>
            <div className="flex items-center gap-2 mb-4">
              <Info className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-semibold text-white">Market Statistics</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="text-xs text-slate-400">Previous Close</div>
                <div className="text-lg font-semibold text-white">
                  {formatDisplayedPrice(stats.prevClose)}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-slate-400">Open</div>
                <div className="text-lg font-semibold text-white">
                  {formatDisplayedPrice(stats.open)}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-slate-400">Day High</div>
                <div className="text-lg font-semibold text-emerald-400">
                  {formatDisplayedPrice(stats.dayHigh)}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-slate-400">Day Low</div>
                <div className="text-lg font-semibold text-red-400">
                  {formatDisplayedPrice(stats.dayLow)}
                </div>
              </div>

              <div className="space-y-1 col-span-2">
                <div className="text-xs text-slate-400">24h Volume</div>
                <div className="text-lg font-semibold text-white">
                  {stats.volume24h > 0 ? formatFiatCompact(stats.volume24h) : '--'}
                </div>
              </div>
            </div>
          </div>

          <div className={`${infoSurfaceClass} rounded-xl border border-purple-500/25 p-6`}>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-fuchsia-500/22">
                <Info className="w-5 h-5 text-cyan-400" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-white mb-1">Market Information</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Latest available {pairType} market data. Quote availability depends on the source and trading hours.
                  {pairType === 'forex' && ' Forex markets operate 24/5.'}
                  {pairType === 'stock' && ' Stock markets operate during exchange hours.'}
                  {pairType === 'commodity' && ' Commodity prices reflect spot market rates.'}
                </p>
              </div>
            </div>
          </div>

          {onPairSelect && (
            <HotTradingPairs
              onPairSelect={onPairSelect}
              tradingMode={tradingMode}
            />
          )}
        </div>
      </div>
    </div>
  );
}

