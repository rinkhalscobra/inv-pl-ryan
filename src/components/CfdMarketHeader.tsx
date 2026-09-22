import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Check, ChevronDown, Search } from 'lucide-react';
import { CFD_INSTRUMENTS, getCfdInstrument } from '../constants/tradingPairs';
import { useMarketData } from '../contexts/MarketDataContext';
import { useFiatCurrency } from '../hooks/useFiatCurrency';

interface CfdMarketHeaderProps {
  selectedPair: string;
  currentPrice: number;
  onSelectPair: (symbol: string) => void;
}

export default function CfdMarketHeader({ selectedPair, currentPrice, onSelectPair }: CfdMarketHeaderProps) {
  const { getMarketDataBySymbol, getPriceBySymbol, connectionState } = useMarketData();
  const { formatFiatPrice, formatFiatCompact } = useFiatCurrency();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [, setQuoteClock] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const instrument = getCfdInstrument(selectedPair);
  const quote = getMarketDataBySymbol(selectedPair);
  const price = getPriceBySymbol(selectedPair) || currentPrice;
  const quoteTimestamp = Date.parse(quote?.timestamp || '');
  const quoteIsFresh = Number.isFinite(quoteTimestamp) && quoteTimestamp <= Date.now() + 60_000
    && Date.now() - quoteTimestamp < 2 * 60_000;

  useEffect(() => {
    if (!Number.isFinite(quoteTimestamp)) return;
    const untilStale = quoteTimestamp + 2 * 60_000 - Date.now();
    if (untilStale <= 0) return;
    const timer = window.setTimeout(() => setQuoteClock(Date.now()), untilStale + 1);
    return () => window.clearTimeout(timer);
  }, [quoteTimestamp]);
  const isForex = instrument?.type === 'forex';
  const formatPrice = (value: number) => isForex ? value.toFixed(5) : formatFiatPrice(value);
  const change = quote?.change_24h ?? 0;
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return CFD_INSTRUMENTS.filter((item) => item.active && (!term ||
      item.symbol.toLowerCase().includes(term) || item.name.toLowerCase().includes(term)));
  }, [search]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const metrics = [
    { label: '24h change', value: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`, accent: change >= 0 ? 'text-emerald-400' : 'text-rose-400' },
    { label: '24h high', value: quote?.high_price_24h ? formatPrice(quote.high_price_24h) : '--' },
    { label: '24h low', value: quote?.low_price_24h ? formatPrice(quote.low_price_24h) : '--' },
    { label: '24h volume', value: quote?.volume_24h ? formatFiatCompact(quote.volume_24h * (isForex ? 1 : price)) : '--' },
  ];

  return (
    <section className="relative z-30 flex min-h-[64px] shrink-0 flex-wrap items-center gap-x-5 gap-y-3 border-b border-[#252a33] bg-[#0b0e11] px-4 py-2.5 text-slate-100 lg:px-5" translate="no">
      <div ref={menuRef} className="relative min-w-[210px] border-r border-white/[0.08] pr-5">
        <button type="button" onClick={() => setIsOpen((value) => !value)} aria-haspopup="listbox" aria-expanded={isOpen}
          className="flex items-center gap-1.5 rounded px-1 py-0.5 text-left text-base font-semibold text-white hover:bg-white/[0.04]">
          {selectedPair} <ChevronDown size={14} className="text-slate-500" />
        </button>
        <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
          {instrument?.name || 'CFD instrument'} <span className="ml-1 rounded bg-violet-400/10 px-1.5 py-0.5 text-violet-300">CFD</span>
        </div>
        {isOpen && (
          <div className="absolute left-0 top-[calc(100%+12px)] z-50 w-[370px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-[#2b3139] bg-[#11151b] shadow-2xl shadow-black/60">
            <div className="relative border-b border-[#2b3139] p-3">
              <Search size={15} className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-slate-500" />
              <input autoFocus type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search instruments"
                className="h-9 w-full rounded-md border border-[#2b3139] bg-[#0b0e11] pl-9 pr-3 text-xs text-white outline-none placeholder:text-slate-600 focus:border-violet-400/60" />
            </div>
            <div role="listbox" className="max-h-[360px] overflow-y-auto overscroll-contain [scrollbar-width:thin]">
              {filtered.map((item) => {
                const itemQuote = getMarketDataBySymbol(item.symbol);
                const selected = item.symbol === selectedPair;
                return (
                  <button key={item.symbol} type="button" role="option" aria-selected={selected}
                    onClick={() => { onSelectPair(item.symbol); setIsOpen(false); setSearch(''); }}
                    className={`grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.04] ${selected ? 'bg-violet-500/10' : ''}`}>
                    <span className="min-w-0"><span className="flex items-center gap-1 text-xs font-semibold text-slate-100">{item.symbol}{selected && <Check size={12} className="text-violet-300" />}</span>
                      <span className="block truncate text-[10px] text-slate-600">{item.name}</span></span>
                    <span className="font-mono text-[11px] text-slate-300">{itemQuote?.price ? (item.type === 'forex' ? itemQuote.price.toFixed(5) : formatFiatPrice(itemQuote.price)) : '--'}</span>
                    <span className={`font-mono text-[11px] ${itemQuote && itemQuote.change_24h !== undefined && itemQuote.change_24h < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {itemQuote?.change_24h === undefined ? '--' : `${itemQuote.change_24h >= 0 ? '+' : ''}${itemQuote.change_24h.toFixed(2)}%`}
                    </span>
                  </button>
                );
              })}
              {filtered.length === 0 && <div className="px-4 py-10 text-center text-xs text-slate-500">No instruments found</div>}
            </div>
          </div>
        )}
      </div>
      <div className="min-w-[140px]">
        <div className="font-mono text-lg font-semibold tabular-nums text-emerald-400">{price > 0 ? formatPrice(price) : '--'}</div>
        <a href="https://twelvedata.com" target="_blank" rel="noopener noreferrer" className="text-[10px] text-slate-500 underline decoration-slate-700 underline-offset-2 hover:text-slate-300">Primary data by Twelve Data</a>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500"><span className={`h-1.5 w-1.5 rounded-full ${quoteIsFresh ? 'bg-emerald-400' : 'bg-amber-400'}`} />{quoteIsFresh ? 'Recent quote' : 'Delayed quote'} {isForex ? '· rate' : '· EUR'}</div>
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-8 gap-y-2">
        {metrics.map((metric) => <div key={metric.label} className="min-w-[90px]"><div className="text-[11px] text-slate-500">{metric.label}</div><div className={`mt-1 font-mono text-xs tabular-nums text-slate-200 ${metric.accent || ''}`}>{metric.value}</div></div>)}
      </div>
      <div className={`hidden items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px] 2xl:flex ${quoteIsFresh && connectionState === 'connected' ? 'border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-300' : 'border-amber-400/15 bg-amber-400/[0.06] text-amber-300'}`}>
        <Activity size={13} />{quoteIsFresh && connectionState === 'connected' ? 'Recent quote' : 'Quote delayed'}
      </div>
    </section>
  );
}
