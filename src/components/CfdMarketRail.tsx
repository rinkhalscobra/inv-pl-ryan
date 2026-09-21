import { useState } from 'react';
import { BarChart3, Info } from 'lucide-react';

interface CfdMarketRailProps {
  details: React.ReactNode;
  markets: React.ReactNode;
}

export default function CfdMarketRail({ details, markets }: CfdMarketRailProps) {
  const [activePanel, setActivePanel] = useState<'details' | 'markets'>('markets');

  return (
    <aside className="cfd-market-rail flex h-full min-h-[480px] flex-col overflow-hidden border border-white/[0.07] bg-[#0a0f1a] xl:min-h-0">
      <div className="flex h-11 shrink-0 items-end border-b border-white/[0.07] px-3">
        <button type="button" onClick={() => setActivePanel('markets')}
          className={`flex h-11 items-center gap-2 border-b-2 px-3 text-xs font-semibold transition ${activePanel === 'markets' ? 'border-violet-400 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
          <BarChart3 size={14} /> Markets
        </button>
        <button type="button" onClick={() => setActivePanel('details')}
          className={`flex h-11 items-center gap-2 border-b-2 px-3 text-xs font-semibold transition ${activePanel === 'details' ? 'border-violet-400 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
          <Info size={14} /> Details
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <div className={activePanel === 'markets' ? 'h-full' : 'hidden'}>{markets}</div>
        <div className={activePanel === 'details' ? 'h-full' : 'hidden'}>{details}</div>
      </div>
    </aside>
  );
}
