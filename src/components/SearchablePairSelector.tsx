import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';
import { useMarketData } from '../contexts/MarketDataContext';
import { useBybitData } from '../contexts/BybitDataContext';
import { usePrevious } from '../hooks/usePrevious';
import { TOP_CRYPTO_PAIRS, CFD_INSTRUMENTS } from '../constants/tradingPairs';

interface SearchablePairSelectorProps {
  selectedPair: string;
  onPairSelect: (pair: string) => void;
  tradingMode: 'spot' | 'futures' | 'cfd' | 'binary' | 'robot' | 'wallet' | 'events';
  marketDataList?: any[];
}

const SearchablePairSelector: React.FC<SearchablePairSelectorProps> = ({
  selectedPair,
  onPairSelect,
  tradingMode,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [flashingPrices, setFlashingPrices] = useState<Map<string, 'up' | 'down'>>(new Map());
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { getPriceBySymbol: getCfdPrice, connectionState: cfdConnectionState } = useMarketData();
  const { getPriceBySymbol: getCryptoPrice, connectionState: cryptoConnectionState, getPriceDirection } = useBybitData();

  const connectionState = tradingMode === 'cfd' ? cfdConnectionState : cryptoConnectionState;

  const getPriceBySymbol = useCallback((symbol: string) => {
    if (tradingMode === 'cfd') {
      return getCfdPrice(symbol);
    }
    return getCryptoPrice(symbol);
  }, [tradingMode, getCfdPrice, getCryptoPrice]);

  const currentPrice = getPriceBySymbol(selectedPair);
  const previousPrice = usePrevious(currentPrice);

  useEffect(() => {
    if (previousPrice !== undefined && currentPrice !== previousPrice && currentPrice > 0) {
      const direction = currentPrice > previousPrice ? 'up' : 'down';
      setFlashingPrices(prev => {
        const newMap = new Map(prev);
        newMap.set(selectedPair, direction);
        return newMap;
      });

      const timeout = setTimeout(() => {
        setFlashingPrices(prev => {
          const newMap = new Map(prev);
          newMap.delete(selectedPair);
          return newMap;
        });
      }, 500);

      return () => clearTimeout(timeout);
    }
  }, [currentPrice, previousPrice, selectedPair]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const getFilteredTickers = useCallback(() => {
    if (tradingMode === 'cfd') {
      let cfdInstruments = [...CFD_INSTRUMENTS];

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        cfdInstruments = cfdInstruments.filter(ticker =>
          ticker.symbol.toLowerCase().includes(term) ||
          ticker.name.toLowerCase().includes(term) ||
          ticker.searchAliases?.some(alias => alias.toLowerCase().includes(term))
        );
      }

      return cfdInstruments;
    } else {
      let cryptoPairs = [...TOP_CRYPTO_PAIRS];

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        cryptoPairs = cryptoPairs.filter(ticker =>
          ticker.symbol.toLowerCase().includes(term) ||
          ticker.name.toLowerCase().includes(term)
        );
      }

      return cryptoPairs;
    }
  }, [tradingMode, searchTerm]);

  const handlePairSelect = (symbol: string) => {
    onPairSelect(symbol);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const clearSearch = () => {
    setSearchTerm('');
  };

  const formatPairDisplay = (symbol: string, name?: string, type?: string) => {
    if (type === 'stock' || type === 'index') {
      return name || symbol;
    }
    if (symbol.endsWith('USDT')) {
      return symbol.replace('USDT', '/USDT');
    }
    return symbol;
  };

  const formatPrice = (price: number, symbol: string, type?: string) => {
    if (price <= 0) return '-';

    if (type === 'forex') {
      if (symbol.includes('JPY')) {
        return price.toFixed(3);
      }
      return price.toFixed(5);
    }

    if (type === 'commodity') {
      if (symbol.includes('XAU') || symbol.includes('XPT') || symbol.includes('XPD')) {
        return price.toFixed(2);
      }
      if (symbol.includes('XAG')) {
        return price.toFixed(4);
      }
      return price.toFixed(4);
    }

    if (price >= 1000) return price.toFixed(2);
    if (price >= 1) return price.toFixed(4);
    return price.toFixed(6);
  };

  const getConnectionIndicator = () => {
    switch (connectionState) {
      case 'connected':
        return <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" title="Connected" />;
      case 'connecting':
        return <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse" title="Connecting..." />;
      case 'reconnecting':
        return <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" title="Reconnecting..." />;
      default:
        return <div className="w-2 h-2 bg-violet-500 rounded-full" title="Disconnected" />;
    }
  };

  const filteredTickers = getFilteredTickers();

  const getCurrentPairInfo = () => {
    if (tradingMode === 'cfd') {
      const instrument = CFD_INSTRUMENTS.find(i => i.symbol === selectedPair);
      return instrument;
    }
    const cryptoPair = TOP_CRYPTO_PAIRS.find(p => p.symbol === selectedPair);
    return cryptoPair;
  };

  const currentPairInfo = getCurrentPairInfo();
  const currentPairDisplay = currentPairInfo
    ? formatPairDisplay(selectedPair, currentPairInfo.name, currentPairInfo.type)
    : selectedPair;

  const flashDirection = flashingPrices.get(selectedPair);
  const priceFlashClass = flashDirection === 'up'
    ? 'animate-flash-green'
    : flashDirection === 'down'
    ? 'animate-flash-red'
    : '';

  const renderTickerRow = (ticker: typeof CFD_INSTRUMENTS[0] | typeof TOP_CRYPTO_PAIRS[0]) => {
    const price = getPriceBySymbol(ticker.symbol);
    const unavailable = ticker.active === false;
    const direction = tradingMode !== 'cfd' ? getPriceDirection(ticker.symbol) : 'neutral';
    const rowFlashDirection = flashingPrices.get(ticker.symbol);
    const rowFlashClass = rowFlashDirection === 'up'
      ? 'animate-flash-green'
      : rowFlashDirection === 'down'
      ? 'animate-flash-red'
      : '';

    return (
      <button
        key={ticker.symbol}
        onClick={() => handlePairSelect(ticker.symbol)}
        className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-center justify-between hover:bg-gradient-to-r hover:from-blue-500/10 hover:to-purple-500/12 ${unavailable ? 'opacity-65' : ''} ${
          selectedPair === ticker.symbol ? 'bg-gradient-to-r from-blue-500/18 to-purple-500/16 text-blue-400' : 'text-white'
        }`}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{formatPairDisplay(ticker.symbol, ticker.name, ticker.type)}</div>
            <div className="text-xs text-slate-400 truncate">
              {tradingMode === 'cfd' ? `${ticker.symbol}${unavailable ? ' · View only' : ''}` : ticker.name}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 ml-2">
          <span className={`text-sm font-mono tabular-nums transition-colors ${
            price > 0
              ? (rowFlashClass || (direction === 'up' ? 'text-emerald-400' : direction === 'down' ? 'text-red-400' : 'text-emerald-400'))
              : 'text-slate-500'
          }`}>
            {price > 0 ? formatPrice(price, ticker.symbol, ticker.type) : '-'}
          </span>
          <span className="text-xs text-slate-500 uppercase w-14 text-right">{ticker.type}</span>
        </div>
      </button>
    );
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 hover:bg-gradient-to-r hover:from-blue-500/10 hover:to-purple-500/12 px-3 py-2 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-2">
          {getConnectionIndicator()}
          <h1 className="text-2xl font-bold text-white">
            {currentPairDisplay}
            {tradingMode === 'futures' && <span className="text-sm text-slate-400 ml-2">Perp</span>}
            {tradingMode === 'cfd' && <span className="text-sm text-slate-400 ml-2">CFD</span>}
          </h1>
        </div>
        {currentPrice > 0 && (
          <span className={`text-lg font-mono text-emerald-400 ml-2 tabular-nums ${priceFlashClass}`}>
            ${formatPrice(currentPrice, selectedPair, currentPairInfo?.type)}
          </span>
        )}
        <ChevronDown size={16} className="text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 app-dropdown shadow-xl z-50 w-[420px] max-h-96 overflow-hidden">
          <div className="p-4 border-b border-slate-700">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                placeholder={`Search ${tradingMode === 'cfd' ? 'instruments' : 'pairs'}...`}
                value={searchTerm}
                onChange={handleSearchChange}
                className="w-full bg-gradient-to-br from-blue-500/10 via-indigo-500/8 to-purple-500/12 text-white pl-10 pr-10 py-2 rounded-xl border border-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {searchTerm && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {filteredTickers.length > 0 ? (
              <div className="p-2">
                {tradingMode === 'cfd' && (
                  <>
                    <div className="text-xs font-semibold text-slate-400 uppercase mt-2 mb-1 px-3">
                      Forex Pairs
                    </div>
                    {filteredTickers
                      .filter(ticker => ticker.type === 'forex')
                      .map(renderTickerRow)}

                    <div className="text-xs font-semibold text-slate-400 uppercase mt-4 mb-1 px-3">
                      Commodities
                    </div>
                    {filteredTickers
                      .filter(ticker => ticker.type === 'commodity')
                      .map(renderTickerRow)}

                    {filteredTickers.some(t => t.type === 'stock') && (
                      <>
                        <div className="text-xs font-semibold text-slate-400 uppercase mt-4 mb-1 px-3">
                          Stocks
                        </div>
                        {filteredTickers
                          .filter(ticker => ticker.type === 'stock')
                          .map(renderTickerRow)}
                      </>
                    )}

                    {filteredTickers.some(t => t.type === 'index') && (
                      <>
                        <div className="text-xs font-semibold text-slate-400 uppercase mt-4 mb-1 px-3">
                          Indices & ETFs
                        </div>
                        {filteredTickers
                          .filter(ticker => ticker.type === 'index')
                          .map(renderTickerRow)}
                      </>
                    )}
                  </>
                )}

                {tradingMode !== 'cfd' && filteredTickers.map(renderTickerRow)}
              </div>
            ) : (
              <div className="p-4 text-center text-slate-400">
                {searchTerm ? `No ${tradingMode === 'cfd' ? 'instruments' : 'pairs'} found` : `No ${tradingMode === 'cfd' ? 'instruments' : 'pairs'} available`}
              </div>
            )}
          </div>

          <div className="p-3 border-t border-slate-700 bg-gradient-to-br from-blue-500/10 via-indigo-500/8 to-purple-500/12">
            <div className="text-xs text-slate-400 text-center">
              {filteredTickers.length} {tradingMode === 'cfd' ? 'instruments' : 'pairs'} available
              {searchTerm && ` - Filtered by "${searchTerm}"`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchablePairSelector;



