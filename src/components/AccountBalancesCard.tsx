import { useFiatCurrency } from '../hooks/useFiatCurrency';

interface AccountBalancesCardProps {
  title: string;
  usdtBalance: number;
  usdBalance: number;
  btcBalance: number;
  currentPrice: number;
}

export default function AccountBalancesCard({
  title,
  usdtBalance,
  usdBalance,
  btcBalance,
  currentPrice,
}: AccountBalancesCardProps) {
  const { formatFiat } = useFiatCurrency();

  return (
    <div className="app-surface-primary rounded-xl p-5 sm:p-6">
      <h3 className="mb-3 text-base font-semibold text-white">{title}</h3>
      <div className="divide-y divide-white/[0.07]">
        <div className="flex min-w-0 items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-bold text-emerald-300">€</div>
            <div><div className="text-sm font-medium text-white">EUR</div><div className="text-xs text-slate-500">Cash balance</div></div>
          </div>
          <span className="truncate font-mono text-sm font-semibold text-white" title={formatFiat(usdtBalance)}>{formatFiat(usdtBalance)}</span>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-bold text-emerald-300">$</div>
            <div><div className="text-sm font-medium text-white">USD</div><div className="text-xs text-slate-500">Cash balance</div></div>
          </div>
          <span className="truncate font-mono text-sm font-semibold text-white">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(usdBalance)}</span>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-sm font-bold text-orange-300">₿</div>
            <div><div className="text-sm font-medium text-white">BTC</div><div className="text-xs text-slate-500">Crypto holding</div></div>
          </div>
          <div className="min-w-0 text-right"><div className="truncate font-mono text-sm font-semibold text-white" title={`${btcBalance.toFixed(8)} BTC`}>{btcBalance.toFixed(8)} BTC</div><div className="truncate text-xs text-slate-400">{formatFiat(btcBalance * currentPrice)}</div></div>
        </div>
      </div>
    </div>
  );
}
