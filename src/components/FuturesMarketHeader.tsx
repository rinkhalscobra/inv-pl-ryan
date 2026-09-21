import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Check, ChevronDown, Search } from 'lucide-react';
import { useBybitData } from '../contexts/BybitDataContext';
import { useFiatCurrency } from '../hooks/useFiatCurrency';
import { TOP_CRYPTO_PAIRS } from '../constants/tradingPairs';

interface FuturesMarketHeaderProps {
  selectedPair: string;
  currentPrice: number;
  onSelectPair: (symbol: string) => void;
}

const FuturesMarketHeader: React.FC<FuturesMarketHeaderProps> = ({ selectedPair, currentPrice, onSelectPair }) => {
  const { getCryptoDataBySymbol, connectionState } = useBybitData();
  const { formatFiatPrice, formatFiatCompact, formatTradingPair } = useFiatCurrency();
  const [isPairMenuOpen, setIsPairMenuOpen] = useState(false);
  const [pairSearch, setPairSearch] = useState('');
  const pairMenuRef = useRef<HTMLDivElement>(null);
  const market = getCryptoDataBySymbol(selectedPair);
  const displayPrice = market?.price || currentPrice;
  const change = market?.change_24h ?? 0;
  const isPositive = change >= 0;

  const metrics = [
    { label: '24h change', value: `${isPositive ? '+' : ''}${change.toFixed(2)}%`, accent: isPositive ? 'text-emerald-400' : 'text-rose-400' },
    { label: '24h high', value: market ? formatFiatPrice(market.high_price_24h) : '--' },
    { label: '24h low', value: market ? formatFiatPrice(market.low_price_24h) : '--' },
    { label: '24h volume', value: market ? formatFiatCompact(market.volume_24h * market.price) : '--' },
  ];

  const filteredPairs = useMemo(() => {
    const search = pairSearch.trim().toLowerCase();
    return TOP_CRYPTO_PAIRS.filter((pair) => {
      if (!pair.active) return false;
      if (!search) return true;
      return pair.symbol.toLowerCase().includes(search) || pair.name.toLowerCase().includes(search);
    });
  }, [pairSearch]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!pairMenuRef.current?.contains(event.target as Node)) setIsPairMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsPairMenuOpen(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const handlePairSelect = (symbol: string) => {
    onSelectPair(symbol);
    setIsPairMenuOpen(false);
    setPairSearch('');
  };

  return (
    <section className="futures-ticker relative z-30 flex min-h-[64px] shrink-0 items-center gap-5 overflow-visible border-b border-[#252a33] bg-[#0b0e11] px-4 py-2.5 lg:px-5" translate="no">
      <div ref={pairMenuRef} className="relative flex min-w-[210px] items-center border-r border-white/[0.08] pr-5">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => setIsPairMenuOpen((open) => !open)}
            aria-haspopup="listbox"
            aria-expanded={isPairMenuOpen}
            className="flex items-center gap-1.5 rounded px-1 py-0.5 text-left text-base font-semibold text-white transition hover:bg-white/[0.04]"
          >
            {formatTradingPair(selectedPair)} <ChevronDown size={14} className="text-slate-500" />
          </button>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
            Perpetual <span className="rounded bg-sky-400/10 px-1.5 py-0.5 text-sky-300">USDT-M</span>
          </div>
        </div>

        {isPairMenuOpen && (
          <div className="absolute left-0 top-[calc(100%+12px)] z-50 w-[370px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-[#2b3139] bg-[#11151b] shadow-2xl shadow-black/60">
            <div className="border-b border-[#2b3139] p-3">
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  autoFocus
                  type="search"
                  value={pairSearch}
                  onChange={(event) => setPairSearch(event.target.value)}
                  placeholder="Search markets"
                  className="h-9 w-full rounded-md border border-[#2b3139] bg-[#0b0e11] pl-9 pr-3 text-xs text-white outline-none placeholder:text-slate-600 focus:border-violet-400/60"
                />
              </div>
            </div>

            <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-[#252a33] px-3 py-2 text-[10px] uppercase tracking-[0.1em] text-slate-600">
              <span>Contract</span><span>Last price</span><span>24h</span>
            </div>

            <div className="max-h-[360px] overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:#475569_transparent]">
              {filteredPairs.map((pair) => {
                const pairData = getCryptoDataBySymbol(pair.symbol);
                const pairChange = pairData?.change_24h ?? 0;
                const isSelected = pair.symbol === selectedPair;
                return (
                  <button
                    key={pair.symbol}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handlePairSelect(pair.symbol)}
                    className={`grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2.5 text-left transition ${isSelected ? 'bg-violet-500/10' : 'hover:bg-white/[0.04]'}`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-slate-100">{formatTradingPair(pair.symbol)}</span>
                        <span className="mt-0.5 block truncate text-[10px] text-slate-600">{pair.name} perpetual</span>
                      </span>
                      {isSelected && <Check size={13} className="shrink-0 text-violet-300" />}
                    </span>
                    <span className="min-w-[82px] text-right font-mono text-[11px] tabular-nums text-slate-300">
                      {pairData?.price ? formatFiatPrice(pairData.price) : '--'}
                    </span>
                    <span className={`min-w-[52px] text-right font-mono text-[11px] tabular-nums ${pairChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {pairChange >= 0 ? '+' : ''}{pairChange.toFixed(2)}%
                    </span>
                  </button>
                );
              })}
              {filteredPairs.length === 0 && <div className="px-4 py-10 text-center text-xs text-slate-500">No markets found</div>}
            </div>
          </div>
        )}
      </div>

      <div className="min-w-[150px]">
        <div className="font-mono text-lg font-semibold tabular-nums text-emerald-400">
          {displayPrice > 0 ? formatFiatPrice(displayPrice) : '--'}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
          <span className={`h-1.5 w-1.5 rounded-full ${connectionState === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          Mark price
        </div>
      </div>

      <div className="flex min-w-max flex-1 items-center gap-8">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-[96px]">
            <div className="text-[11px] text-slate-500">{metric.label}</div>
            <div className={`mt-1 font-mono text-xs font-medium tabular-nums text-slate-200 ${metric.accent ?? ''}`}>{metric.value}</div>
          </div>
        ))}
      </div>

      <div className="hidden shrink-0 items-center gap-2 rounded-md border border-emerald-400/15 bg-emerald-400/[0.06] px-2.5 py-1.5 text-[11px] text-emerald-300 2xl:flex">
        <Activity size={13} /> Live market
      </div>
    </section>
  );
};

export default FuturesMarketHeader;
