import React from 'react';
import { TrendingUp, TrendingDown, Flame } from 'lucide-react';
import { useMarketData } from '../contexts/MarketDataContext';
import { CFD_INSTRUMENTS } from '../constants/tradingPairs';

interface HotTradingPairsProps {
  onPairSelect: (symbol: string) => void;
  tradingMode: 'cfd' | 'futures';
}

export default function HotTradingPairs({ onPairSelect, tradingMode }: HotTradingPairsProps) {
  const { marketData, getMarketDataBySymbol } = useMarketData();

  const getTopPerformers = () => {
    const instruments = tradingMode === 'cfd' ? CFD_INSTRUMENTS.filter(i => i.active) : [];

    const performersWithData = instruments
      .map(instrument => {
        const data = getMarketDataBySymbol(instrument.symbol);
        return {
          symbol: instrument.symbol,
          name: instrument.name,
          type: instrument.type,
          price: data?.price || 0,
          change_24h: data?.change_24h || 0
        };
      })
      .filter(item => item.price > 0 && Math.abs(item.change_24h) > 0.1)
      .sort((a, b) => Math.abs(b.change_24h) - Math.abs(a.change_24h))
      .slice(0, 4);

    return performersWithData;
  };

  const topPerformers = getTopPerformers();

  if (topPerformers.length === 0) {
    return null;
  }

  const formatPairDisplay = (symbol: string, name: string) => {
    if (symbol.length === 6 && !symbol.includes('USDT')) {
      return `${symbol.substring(0, 3)}/${symbol.substring(3, 6)}`;
    }
    if (symbol.startsWith('XAU') || symbol.startsWith('XAG')) {
      return name;
    }
    return symbol;
  };

  const getPricePrecision = (symbol: string): number => {
    if (symbol.includes('/') && (symbol.includes('USD') || symbol.includes('EUR'))) {
      return 5;
    }
    if (symbol.startsWith('XAU') || symbol.startsWith('XPT')) {
      return 4;
    }
    if (symbol.startsWith('XAG')) {
      return 5;
    }
    return 2;
  };

  const getTypeColor = (type: string) => {
    switch(type) {
      case 'forex': return 'from-indigo-500/18 via-purple-500/16 to-fuchsia-500/16 border-purple-500/20';
      case 'commodity': return 'from-purple-500/18 via-fuchsia-500/14 to-indigo-500/16 border-purple-500/20';
      case 'stock': return 'from-indigo-500/16 via-purple-500/16 to-fuchsia-500/18 border-purple-500/20';
      case 'index': return 'from-purple-500/18 via-fuchsia-500/16 to-indigo-500/14 border-purple-500/20';
      default: return 'from-slate-500/20 to-slate-600/20 border-slate-500/30';
    }
  };

  return (
    <div className="rounded-xl app-surface-primary p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg app-icon-tile">
          <Flame className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Hot Trading Pairs</h3>
          <p className="text-xs text-slate-400">Top movers in the last 24h</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {topPerformers.map((pair) => {
          const isPositive = pair.change_24h >= 0;

          return (
            <div
              key={pair.symbol}
              onClick={() => onPairSelect(pair.symbol)}
              className={`bg-gradient-to-br ${getTypeColor(pair.type)} rounded-lg p-4 border cursor-pointer app-surface-hover transition-all duration-300 group hover:shadow-lg`}
            >
              <div className="space-y-2">
                <div className="text-xs font-medium text-slate-300 truncate">
                  {formatPairDisplay(pair.symbol, pair.name)}
                </div>

                <div className="text-base font-bold text-white">
                  ${pair.price.toFixed(getPricePrecision(pair.symbol))}
                </div>

                <div className="flex items-center justify-between">
                  <div className={`flex items-center gap-1 text-sm font-semibold ${
                    isPositive ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {isPositive ? (
                      <TrendingUp size={14} />
                    ) : (
                      <TrendingDown size={14} />
                    )}
                    <span>{isPositive ? '+' : ''}{pair.change_24h.toFixed(2)}%</span>
                  </div>

                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

