import { RefreshCw } from 'lucide-react';
import type { SwapMarketPrice } from './types';

interface SwapMarketOverviewProps {
  prices: SwapMarketPrice[];
  formatFiat: (value: number) => string;
  onRefresh: () => void;
}

export default function SwapMarketOverview({ prices, formatFiat, onRefresh }: SwapMarketOverviewProps) {
  return (
    <section className="rounded-xl border border-white/[0.08] bg-[#11151b] p-4 shadow-lg shadow-black/10 sm:p-5" aria-label="Swap market overview">
      <div className="mb-3 flex items-center justify-between border-b border-white/[0.07] pb-3"><div><h2 className="text-sm font-semibold text-white">Market overview</h2><p className="mt-0.5 text-xs text-slate-500">Current asset prices</p></div><button type="button" onClick={onRefresh} aria-label="Refresh market prices" className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"><RefreshCw size={16} /></button></div>
      <div className="divide-y divide-white/[0.05]">
        {prices.map(data => (
          <div key={data.symbol} className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full app-icon-tile">
                {data.iconUrl && <img src={data.iconUrl} alt="" className="h-full w-full object-cover" loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling?.classList.remove('hidden'); event.currentTarget.nextElementSibling?.classList.add('flex'); }} />}
                <span className={`absolute inset-0 items-center justify-center text-xs font-bold text-white ${data.iconUrl ? 'hidden' : 'flex'}`}>{data.baseSymbol.substring(0, 2)}</span>
              </span>
              <span className="min-w-0"><span className="block truncate text-sm font-medium text-white">{data.baseSymbol}</span><span className="block truncate text-xs text-slate-500">{data.name}</span></span>
            </div>
            <span className="shrink-0 text-right font-mono text-sm text-white">{formatFiat(data.price)}</span>
          </div>
        ))}
        {prices.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Prices are unavailable</p>}
      </div>
    </section>
  );
}
