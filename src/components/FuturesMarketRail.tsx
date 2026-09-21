import React, { useState } from 'react';
import { BarChart3, BookOpen } from 'lucide-react';

interface FuturesMarketRailProps {
  orderBook: React.ReactNode;
  markets: React.ReactNode;
}

const FuturesMarketRail: React.FC<FuturesMarketRailProps> = ({ orderBook, markets }) => {
  const [activePanel, setActivePanel] = useState<'book' | 'markets'>('book');

  return (
    <aside className="futures-market-rail flex h-full min-h-[480px] flex-col overflow-hidden border border-white/[0.07] bg-[#0a0f1a] xl:min-h-0">
      <div className="flex h-11 shrink-0 items-end border-b border-white/[0.07] px-3">
        <button
          type="button"
          onClick={() => setActivePanel('book')}
          className={`flex h-11 items-center gap-2 border-b-2 px-3 text-xs font-semibold transition ${activePanel === 'book' ? 'border-violet-400 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
        >
          <BookOpen size={14} /> Order book
        </button>
        <button
          type="button"
          onClick={() => setActivePanel('markets')}
          className={`flex h-11 items-center gap-2 border-b-2 px-3 text-xs font-semibold transition ${activePanel === 'markets' ? 'border-violet-400 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
        >
          <BarChart3 size={14} /> Markets
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <div className={activePanel === 'book' ? 'h-full' : 'hidden'}>{orderBook}</div>
        <div className={activePanel === 'markets' ? 'h-full' : 'hidden'}>{markets}</div>
      </div>
    </aside>
  );
};

export default FuturesMarketRail;
