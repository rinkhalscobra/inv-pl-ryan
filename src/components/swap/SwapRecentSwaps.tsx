import { Clock, Package } from 'lucide-react';
import type { DatabaseTransaction } from '../../hooks/useDatabase';

interface SwapRecentSwapsProps {
  transactions: DatabaseTransaction[];
  formatEur: (value: number) => string;
  formatFiat: (value: number) => string;
}

export default function SwapRecentSwaps({ transactions, formatEur, formatFiat }: SwapRecentSwapsProps) {
  return (
    <section className="min-h-[240px] p-4 sm:p-5" aria-label="Recent swaps">
      <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold text-white">Recent swaps</h2><Clock size={16} className="text-slate-400" /></div>
      <div className="max-h-64 space-y-3 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {transactions.length > 0 ? transactions.map(tx => (
          <div key={tx.id} className="rounded-lg app-surface-muted p-3">
            <div className="mb-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="break-words text-sm font-medium text-white">{tx.description}</span>
              <span className={`shrink-0 text-xs ${tx.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {tx.amount > 0 ? '+' : ''}{tx.currency?.toUpperCase() === 'EUR' ? formatEur(tx.amount) : formatFiat(tx.amount)}
              </span>
            </div>
            <div className="text-xs text-slate-400">{new Date(tx.created_at).toLocaleString()}</div>
          </div>
        )) : <div className="py-8 text-center text-slate-400"><Package size={32} className="mx-auto mb-2 opacity-50" /><p>No swap history yet</p></div>}
      </div>
    </section>
  );
}
