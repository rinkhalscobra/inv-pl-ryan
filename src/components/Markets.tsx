import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Star, TrendingUp, TrendingDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useFavorites } from '../hooks/useFavorites';
import { TradingMode } from '../App';
import { TOP_CRYPTO_PAIRS, CFD_INSTRUMENTS, getCfdInstrument } from '../constants/tradingPairs';
import { useMarketData } from '../contexts/MarketDataContext';
import { useBybitData } from '../contexts/BybitDataContext';

interface MarketData {
  symbol: string;
  price: number;
  change_24h: number;
  volume_24h: number;
  timestamp: string;
  isLive: boolean;
  isTradable: boolean;
  category?: string;
}

interface MarketsProps {
  selectedPair: string;
  setSelectedPair: (pair: string) => void;
  currentPrice: number;
  tradingMode?: TradingMode;
}

const Markets: React.FC<MarketsProps> = ({
  selectedPair,
  setSelectedPair,
  currentPrice,
  tradingMode
}) => {
  const { t } = useTranslation();
  const { marketData, isConnected: realtimeConnected, error: realtimeError, getMarketDataBySymbol, getPriceBySymbol: getCfdPrice, connectionState: cfdConnectionState } = useMarketData();
  const { getPriceBySymbol: getCryptoPrice, connectionState: cryptoConnectionState, getPriceDirection, getCryptoDataBySymbol } = useBybitData();
  const isFuturesTheme = tradingMode === 'futures';
  const isCfdTheme = tradingMode === 'cfd';
  const isGlassTheme = isFuturesTheme || isCfdTheme;
  const panelSurfaceClass = isFuturesTheme
    ? 'app-surface-primary'
    : isCfdTheme
    ? 'app-surface-primary'
    : '';
  const searchSurfaceClass = isFuturesTheme
    ? 'app-input'
    : isCfdTheme
    ? 'app-input'
    : 'bg-slate-800/50 focus:bg-slate-800';
  const rowHoverSurfaceClass = isFuturesTheme
    ? 'app-surface-hover'
    : isCfdTheme
    ? 'app-surface-hover'
    : 'hover:bg-slate-800/80';
  const selectedRowSurfaceClass = isFuturesTheme
    ? 'app-action-soft border border-sky-400/35 shadow-lg shadow-sky-500/10'
    : isCfdTheme
    ? 'app-action-soft border border-sky-400/35 shadow-lg shadow-sky-500/10'
    : 'bg-gradient-to-r from-purple-500/35 to-violet-500/25 border border-purple-400/80 shadow-lg shadow-purple-500/25';
  const updatedRowSurfaceClass = isFuturesTheme
    ? 'app-surface-muted border border-sky-500/20'
    : isCfdTheme
    ? 'app-surface-muted border border-sky-500/20'
    : 'bg-gradient-to-r from-purple-500/10 to-violet-500/5 border border-purple-400/30';
  const defaultRowSurfaceClass = isFuturesTheme
    ? 'app-surface-muted hover:border-sky-500/25'
    : isCfdTheme
    ? 'app-surface-muted hover:border-sky-500/25'
    : 'bg-gradient-to-r from-purple-500/10 to-violet-500/5 border border-purple-400/20 hover:border-purple-400/40';
  const categorySurfaceClass = isCfdTheme
    ? 'app-control'
    : 'bg-slate-800/50';
  const categoryArrowHoverClass = isCfdTheme
    ? 'app-surface-hover'
    : 'hover:bg-slate-700/50';
  const categoryActiveSurfaceClass = isCfdTheme
    ? 'app-action-primary text-white shadow-lg shadow-sky-500/15'
    : '';
  const cfdScrollbarClass = '[scrollbar-color:#8b5cf6_#0f172a] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-slate-900 [&::-webkit-scrollbar-thumb]:bg-violet-400 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-[2px] [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-slate-900';

  const connectionState = tradingMode === 'cfd' ? cfdConnectionState : cryptoConnectionState;

  const getPriceBySymbol = useCallback((symbol: string) => {
    if (tradingMode === 'cfd') {
      return getCfdPrice(symbol);
    }
    return getCryptoPrice(symbol);
  }, [tradingMode, getCfdPrice, getCryptoPrice]);

  const [searchTerm, setSearchTerm] = useState('');
  const [cfdCategory, setCfdCategory] = useState<'forex' | 'commodity' | 'stock' | 'index'>('forex');
  const [stockCategory, setStockCategory] = useState<'all' | 'technology' | 'fintech' | 'finance' | 'automotive' | 'energy-materials' | 'private'>('all');
  const { favorites, isFavorite, toggleFavorite, loading: favoritesLoading } = useFavorites();

  const [flashingPrices, setFlashingPrices] = useState<Map<string, 'up' | 'down'>>(new Map());
  const previousPricesRef = useRef<Map<string, number>>(new Map());

  const getInstrumentType = useCallback((symbol: string): string => {
    const cryptoPair = TOP_CRYPTO_PAIRS.find(pair => pair.symbol === symbol);
    if (cryptoPair) return 'crypto';

    const cfdInstrument = CFD_INSTRUMENTS.find(instrument => instrument.symbol === symbol);
    if (cfdInstrument) return cfdInstrument.type;

    return 'unknown';
  }, []);

  const formatPairDisplay = (symbol: string) => {
    if (tradingMode === 'cfd') {
      const instrument = CFD_INSTRUMENTS.find(item => item.symbol === symbol);

      if (instrument) {
        if (instrument.type === 'stock' || instrument.type === 'index') {
          return instrument.name;
        }
      }

      if (symbol.length === 6 && !symbol.includes('USDT') && (symbol.endsWith('USD') || symbol.endsWith('EUR') || symbol.endsWith('JPY') || symbol.endsWith('CHF') || symbol.endsWith('CAD') || symbol.endsWith('AUD') || symbol.endsWith('GBP') || symbol.endsWith('NZD'))) {
        return `${symbol.substring(0, 3)}/${symbol.substring(3, 6)}`;
      }
      switch (symbol) {
        case 'XAUUSD': return 'Gold/USD';
        case 'XAUEUR': return 'Gold/EUR';
        case 'XAGUSD': return 'Silver/USD';
        case 'XAGEUR': return 'Silver/EUR';
        case 'XPTUSD': return 'Platinum/USD';
        case 'XPDUSD': return 'Palladium/USD';
        case 'NATGASUSD': return 'Natural Gas';
        case 'BRN': return 'Brent Crude';
        case 'WTIUSD': return 'WTI Crude Oil';
        case 'CORNUSD': return 'Corn';
        case 'WHEATUSD': return 'Wheat';
        case 'SUGARUSD': return 'Sugar';
        default: return symbol;
      }
    }

    if (symbol.endsWith('USDT')) {
      return symbol.replace('USDT', '/USDT');
    }
    return symbol;
  };

  const getPricePrecision = useCallback((symbol: string): number => {
    if (tradingMode === 'cfd') {
      if (symbol.includes('/') && (symbol.includes('USD') || symbol.includes('EUR') || symbol.includes('JPY') || symbol.includes('GBP') || symbol.includes('CHF') || symbol.includes('CAD') || symbol.includes('AUD') || symbol.includes('NZD'))) {
        return 5;
      }
      if (symbol.startsWith('XAU') || symbol.startsWith('XAUEUR') || symbol.startsWith('XPT') || symbol.startsWith('XPD')) {
        return 4;
      }
      if (symbol.startsWith('XAG')) {
        return 5;
      }
      if (symbol === 'WTIUSD' || symbol === 'BRN') {
        return 4;
      }
      if (symbol === 'NATGASUSD') {
        return 5;
      }
      if (['CORNUSD', 'WHEATUSD', 'SOYBNUSD'].includes(symbol)) {
        return 4;
      }
      if (['SUGARUSD', 'COFFEEUSD', 'COTTONUSD', 'COCOAUSD'].includes(symbol)) {
        return 5;
      }
      const stockSymbols = ['BA', 'JPM'];
      if (stockSymbols.includes(symbol)) {
        return 3;
      }
    }

    return 2;
  }, [tradingMode]);

  const getFilteredMarketData = useCallback(() => {
    const predefinedList = tradingMode === 'cfd' ? CFD_INSTRUMENTS : TOP_CRYPTO_PAIRS;

    let filteredByCategory = predefinedList;
    if (tradingMode === 'cfd') {
      filteredByCategory = CFD_INSTRUMENTS.filter(instrument => instrument.type === cfdCategory);
      if (cfdCategory === 'stock' && stockCategory !== 'all') {
        filteredByCategory = filteredByCategory.filter(instrument => instrument.category === stockCategory);
      }
    }

    let filtered: MarketData[] = filteredByCategory.map(item => {
      if (tradingMode === 'cfd') {
        const instrument = getCfdInstrument(item.symbol);
        const marketDataItem = getMarketDataBySymbol(item.symbol);
        if (marketDataItem) {
          return {
            symbol: item.symbol,
            price: marketDataItem.price || 0,
            change_24h: marketDataItem.change_24h || 0,
            volume_24h: marketDataItem.volume_24h || 0,
            timestamp: marketDataItem.timestamp || new Date().toISOString(),
            isLive: true,
            isTradable: instrument?.tradable !== false,
            category: instrument?.category
          };
        }
        return {
          symbol: item.symbol,
          price: 0,
          change_24h: 0,
          volume_24h: 0,
          timestamp: new Date().toISOString(),
          isLive: false,
          isTradable: instrument?.tradable !== false,
          category: instrument?.category
        };
      }

      const cryptoData = getCryptoDataBySymbol(item.symbol);
      const price = cryptoData?.price || getPriceBySymbol(item.symbol);
      return {
        symbol: item.symbol,
        price: price,
        change_24h: cryptoData?.change_24h || 0,
        volume_24h: cryptoData?.volume_24h || 0,
        timestamp: new Date().toISOString(),
        isLive: price > 0,
        isTradable: item.active,
        category: 'crypto'
      };
    });

    if (tradingMode !== 'cfd') {
      filtered = filtered.filter(item => item.price > 0);
    }

    filtered.sort((a, b) => {
      const aIsFavorite = isFavorite(a.symbol);
      const bIsFavorite = isFavorite(b.symbol);

      if (aIsFavorite && !bIsFavorite) return -1;
      if (!aIsFavorite && bIsFavorite) return 1;

      return sortByPredefinedOrder(a, b);
    });

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(data =>
        data.symbol.toLowerCase().includes(term) ||
        formatPairDisplay(data.symbol).toLowerCase().includes(term) ||
        getCfdInstrument(data.symbol)?.searchAliases?.some(alias => alias.toLowerCase().includes(term))
      );
    }

    return filtered;
  }, [tradingMode, cfdCategory, stockCategory, getMarketDataBySymbol, getPriceBySymbol, getCryptoDataBySymbol, isFavorite, searchTerm]);

  const sortByPredefinedOrder = (a: MarketData, b: MarketData) => {
    if (tradingMode === 'cfd') {
      const typeOrder: Record<string, number> = { 'forex': 1, 'commodity': 2, 'stock': 3 };
      const aInstrument = CFD_INSTRUMENTS.find(i => i.symbol === a.symbol);
      const bInstrument = CFD_INSTRUMENTS.find(i => i.symbol === b.symbol);

      if (aInstrument && bInstrument) {
        const typeComparison = (typeOrder[aInstrument.type] || 4) - (typeOrder[bInstrument.type] || 4);
        if (typeComparison !== 0) return typeComparison;

        return CFD_INSTRUMENTS.indexOf(aInstrument) - CFD_INSTRUMENTS.indexOf(bInstrument);
      }

      return a.symbol.localeCompare(b.symbol);
    } else {
      const aIndex = TOP_CRYPTO_PAIRS.findIndex(pair => pair.symbol === a.symbol);
      const bIndex = TOP_CRYPTO_PAIRS.findIndex(pair => pair.symbol === b.symbol);

      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }

      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;

      return a.symbol.localeCompare(b.symbol);
    }
  };

  const filteredMarketData = getFilteredMarketData();

  useEffect(() => {
    const newFlashing = new Map<string, 'up' | 'down'>();

    filteredMarketData.forEach(market => {
      const prevPrice = previousPricesRef.current.get(market.symbol);
      if (prevPrice !== undefined && market.price !== prevPrice && market.price > 0) {
        newFlashing.set(market.symbol, market.price > prevPrice ? 'up' : 'down');
      }
      if (market.price > 0) {
        previousPricesRef.current.set(market.symbol, market.price);
      }
    });

    if (newFlashing.size > 0) {
      setFlashingPrices(prev => {
        const merged = new Map(prev);
        newFlashing.forEach((direction, symbol) => merged.set(symbol, direction));
        return merged;
      });

      const timeout = setTimeout(() => {
        setFlashingPrices(prev => {
          const updated = new Map(prev);
          newFlashing.forEach((_, symbol) => updated.delete(symbol));
          return updated;
        });
      }, 500);

      return () => clearTimeout(timeout);
    }
  }, [filteredMarketData]);

  const getConnectionIndicator = () => {
    switch (connectionState) {
      case 'connected':
        return <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" title="Connected" />;
      case 'connecting':
        return <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" title="Connecting..." />;
      case 'reconnecting':
        return <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" title="Reconnecting..." />;
      default:
        return <div className="w-2 h-2 bg-red-500 rounded-full" title="Disconnected" />;
    }
  };

  return (
    <div
      className={`min-h-[360px] flex flex-col ${
        tradingMode === 'futures' ? 'h-auto xl:h-full' : 'h-full'
      } ${panelSurfaceClass}`}
      translate="no"
    >
      <div className="border-b border-slate-700/30 p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {getConnectionIndicator()}
            <h3 className="text-white font-bold text-xl">
              {tradingMode === 'cfd' ? t('cfd.title') : t('sidebar.marketOverview')}
            </h3>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder={`${t('common.search')}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`${searchSurfaceClass} w-full rounded-xl border border-slate-700/50 py-3 pl-10 pr-4 text-sm text-white transition-all hover:border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/50`}
          />
        </div>
      </div>

      {tradingMode === 'cfd' && (
        <div className="space-y-3 border-b border-slate-700/30 px-6 py-4">
          <div className={`flex items-center justify-between rounded-xl border border-slate-700/50 p-2 ${categorySurfaceClass}`}>
            <button
              onClick={() => {
                const categories = ['forex', 'commodity', 'stock', 'index'];
                const currentIndex = categories.indexOf(cfdCategory);
                const prevIndex = currentIndex === 0 ? categories.length - 1 : currentIndex - 1;
                setCfdCategory(categories[prevIndex] as 'forex' | 'commodity' | 'stock' | 'index');
              }}
              className={`text-slate-400 hover:text-white transition-colors p-2 rounded-lg ${categoryArrowHoverClass}`}
            >
              <ChevronLeft size={20} />
            </button>

            <div className={`flex items-center gap-3 px-6 py-2.5 rounded-lg font-semibold transition-all duration-300 ${
              cfdCategory === 'forex'
                ? categoryActiveSurfaceClass || 'bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-lg shadow-purple-500/25'
                : cfdCategory === 'commodity'
                ? categoryActiveSurfaceClass || 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25'
                : cfdCategory === 'stock'
                ? categoryActiveSurfaceClass || 'bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-lg shadow-emerald-500/25'
                : categoryActiveSurfaceClass || 'bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white shadow-lg shadow-purple-500/25'
            }`}>
              <span className="text-xl">
                {cfdCategory === 'forex' ? '💱' :
                 cfdCategory === 'commodity' ? '🥇' :
                 cfdCategory === 'stock' ? '📈' : '📊'}
              </span>
              <span className="text-sm md:text-base">
                {cfdCategory === 'forex' ? t('cfd.forexPairs') :
                 cfdCategory === 'commodity' ? t('cfd.commodities') :
                 cfdCategory === 'stock' ? t('cfd.stocks') : 'Indices'}
              </span>
            </div>

            <button
              onClick={() => {
                const categories = ['forex', 'commodity', 'stock', 'index'];
                const currentIndex = categories.indexOf(cfdCategory);
                const nextIndex = currentIndex === categories.length - 1 ? 0 : currentIndex + 1;
                setCfdCategory(categories[nextIndex] as 'forex' | 'commodity' | 'stock' | 'index');
              }}
              className={`text-slate-400 hover:text-white transition-colors p-2 rounded-lg ${categoryArrowHoverClass}`}
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {cfdCategory === 'stock' && (
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[
                ['all', 'All'],
                ['technology', 'Technology'],
                ['fintech', 'Fintech'],
                ['finance', 'Finance'],
                ['automotive', 'Auto'],
                ['energy-materials', 'Energy'],
                ['private', 'Private']
              ].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setStockCategory(value as typeof stockCategory)}
                  className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    stockCategory === value
                      ? 'border-purple-400/50 bg-purple-500/20 text-purple-200'
                      : 'border-slate-700/50 text-slate-400 hover:border-slate-600 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div
        className={`flex-1 space-y-2 px-4 py-4 sm:px-6 ${
          tradingMode === 'futures'
            ? 'overflow-visible xl:overflow-y-auto xl:[scrollbar-width:none] xl:[-ms-overflow-style:none] xl:[&::-webkit-scrollbar]:hidden'
            : tradingMode === 'cfd'
            ? `overflow-y-auto ${cfdScrollbarClass}`
            : 'overflow-y-auto [scrollbar-color:#fb923c_#1e293b] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-slate-800 [&::-webkit-scrollbar-thumb]:bg-orange-400 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-[2px] [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-slate-800'
        }`}
        translate="no"
      >
        {filteredMarketData.map((market) => {
          const isRecentlyUpdated = market.timestamp &&
            new Date(market.timestamp).getTime() > Date.now() - 30000;

          const flashDirection = flashingPrices.get(market.symbol);
          const priceDirection = tradingMode !== 'cfd' ? getPriceDirection(market.symbol) : 'neutral';
          const priceColorClass = flashDirection === 'up'
            ? 'animate-flash-green'
            : flashDirection === 'down'
            ? 'animate-flash-red'
            : priceDirection === 'up'
            ? 'text-emerald-400'
            : priceDirection === 'down'
            ? 'text-red-400'
            : 'text-slate-400';
          const instrument = tradingMode === 'cfd' ? getCfdInstrument(market.symbol) : undefined;

          return (
            <div
              key={market.symbol}
              onClick={() => setSelectedPair(market.symbol)}
              className={`flex cursor-pointer items-center justify-between rounded-xl px-4 py-3 transition-all duration-300 ${rowHoverSurfaceClass} ${market.isTradable ? '' : 'opacity-65'} ${
                selectedPair === market.symbol
                  ? selectedRowSurfaceClass
                  : isRecentlyUpdated
                  ? updatedRowSurfaceClass
                  : defaultRowSurfaceClass
              }`}
            >
              <div className="flex items-start gap-3 flex-1">
                <Star
                  size={16}
                  className={`transition-colors cursor-pointer flex-shrink-0 mt-1 ${
                    isFavorite(market.symbol)
                      ? 'text-yellow-400 fill-yellow-400'
                      : 'text-slate-600 hover:text-yellow-400'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(market.symbol);
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-white font-semibold text-sm leading-tight line-clamp-2 break-words">
                    {formatPairDisplay(market.symbol)}
                  </div>
                  {tradingMode === 'cfd' && market.category && (
                    <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {instrument?.type === 'stock' ? `${market.symbol} · ` : ''}{market.category.replace('-', ' & ')}
                    </div>
                  )}
                  <div className={`text-xs font-medium mt-1 font-mono tabular-nums transition-colors ${priceColorClass}`}>
                    {market.price > 0 ? `$${market.price.toFixed(getPricePrecision(market.symbol))}` : '—'}
                  </div>
                  {!market.isTradable && (
                    <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                      View only
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className={`text-sm font-bold ${
                    market.change_24h >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {market.change_24h >= 0 ? '+' : ''}{market.change_24h.toFixed(2)}%
                  </div>
                  <div className="flex items-center justify-end gap-1 mt-1">
                    {market.change_24h >= 0 ? (
                      <TrendingUp size={12} className="text-emerald-400" />
                    ) : (
                      <TrendingDown size={12} className="text-red-400" />
                    )}
                    {market.isLive && (
                      <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};

export default Markets;
