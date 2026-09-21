import { ArrowRightLeft } from 'lucide-react';

interface SwapWorkspaceHeaderProps {
  fromSymbol: string;
  toSymbol: string;
}

export default function SwapWorkspaceHeader({ fromSymbol, toSymbol }: SwapWorkspaceHeaderProps) {
  return (
    <header className="flex min-h-[64px] flex-wrap items-center gap-4 border-b border-[#252a33] bg-[#0b0e11] px-4 py-3 text-slate-100 lg:px-6">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-violet-400/20 bg-violet-400/10 text-violet-300"><ArrowRightLeft size={18} /></div>
      <div className="min-w-0"><h1 className="text-base font-semibold text-white">Asset swap</h1><p className="text-[11px] text-slate-500">Exchange between your available assets</p></div>
      <div className="ml-auto rounded-md border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 font-mono text-xs text-slate-300">{fromSymbol} <span className="px-1 text-violet-300">→</span> {toSymbol}</div>
    </header>
  );
}
