interface AccountBalancesCardProps {
  title: string;
  usdtBalance: number;
  btcBalance: number;
  currentPrice: number;
}

export default function AccountBalancesCard({
  title,
  usdtBalance,
  btcBalance,
  currentPrice,
}: AccountBalancesCardProps) {
  return (
    <div className="app-surface-primary rounded-2xl p-6">
      <h3 className="mb-4 text-lg font-semibold text-white">{title}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="app-surface-muted rounded-lg p-4">
          <div className="mb-2 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/20">
                <span className="font-bold text-green-400">$</span>
              </div>
              <span className="font-medium text-white">USDT</span>
            </div>
            <span className="font-mono text-white">{usdtBalance.toFixed(2)}</span>
          </div>
          <div className="text-right text-xs text-slate-400">${usdtBalance.toFixed(2)} USD</div>
        </div>

        <div className="app-surface-muted rounded-lg p-4">
          <div className="mb-2 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/20">
                <span className="font-bold text-orange-400">₿</span>
              </div>
              <span className="font-medium text-white">BTC</span>
            </div>
            <span className="font-mono text-white">{btcBalance.toFixed(8)}</span>
          </div>
          <div className="text-right text-xs text-slate-400">
            ${(btcBalance * currentPrice).toFixed(2)} USD
          </div>
        </div>
      </div>
    </div>
  );
}
