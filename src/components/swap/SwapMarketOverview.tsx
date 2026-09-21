import { RefreshCw } from 'lucide-react';
import type { SwapMarketPrice } from './types';

interface SwapMarketOverviewProps {
  prices: SwapMarketPrice[];
  formatFiat: (value: number) => string;
  onRefresh: () => void;
}

export default function SwapMarketOverview({ prices, formatFiat, onRefresh }: SwapMarketOverviewProps) {
  return (
    <section className="min-h-[280px] border-b border-white/[0.07] p-4 sm:p-5" aria-label="Swap market overview">
      <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold text-white">Market overview</h2><button type="button" onClick={onRefresh} aria-label="Refresh market prices" className="text-slate-400 transition-colors hover:text-white"><RefreshCw size={16} /></button></div>
      <div className="space-y-3">
        {prices.map(data => (
          <div key={data.symbol} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full app-icon-tile">
                {data.iconUrl && <img src={data.iconUrl} alt="" className="h-full w-full object-cover" loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling?.classList.remove('hidden'); event.currentTarget.nextElementSibling?.classList.add('flex'); }} />}
                <span className={`absolute inset-0 items-center justify-center text-xs font-bold text-white ${data.iconUrl ? 'hidden' : 'flex'}`}>{data.baseSymbol.substring(0, 2)}</span>
              </span>
              <span className="truncate font-medium text-white">{data.baseSymbol}</span>
            </div>
            <span className="shrink-0 font-mono text-sm text-white">{formatFiat(data.price)}</span>
          </div>
        ))}
        {prices.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Prices are unavailable</p>}
      </div>
    </section>
  );
}
