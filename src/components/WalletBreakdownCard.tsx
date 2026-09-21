import React from 'react';
import { Wallet, TrendingUp, TrendingDown, Lock, Euro, Info, Layers, Activity, Package } from 'lucide-react';
import { useFiatCurrency } from '../hooks/useFiatCurrency';

interface WalletBreakdownCardProps {
  totalBalance: number;
  usedMargin: number;
  futuresUsedMargin: number;
  futuresOrdersReserved: number;
  unrealizedPnl: number;
  availableBalance: number;
  robotAllocatedBalance: number;
  stakedAmount: number;
  loading?: boolean;
  showDetails?: boolean;
  showBalance?: boolean;
}

const WalletBreakdownCard: React.FC<WalletBreakdownCardProps> = ({
  totalBalance,
  usedMargin,
  futuresUsedMargin,
  futuresOrdersReserved,
  unrealizedPnl,
  availableBalance,
  robotAllocatedBalance,
  stakedAmount,
  loading = false,
  showDetails = true,
  showBalance = true
}) => {
  const { formatFiat: formatCurrency } = useFiatCurrency();
  const displayCurrency = (amount: number) => showBalance ? formatCurrency(amount) : '••••••';

  if (loading) {
    return (
      <div className="app-surface-primary rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/25">
            <Wallet size={20} className="text-white" />
          </div>
          <h3 className="text-lg font-semibold text-white">Wallet Breakdown</h3>
        </div>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-slate-700 rounded w-3/4"></div>
          <div className="h-4 bg-slate-700 rounded w-1/2"></div>
          <div className="h-4 bg-slate-700 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-surface-primary rounded-xl p-5">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-violet-400/20 bg-violet-500/15">
          <Wallet size={18} className="text-violet-200" />
        </div>
        <h3 className="text-base font-semibold text-white">Balance breakdown</h3>
      </div>

      <div className="space-y-3.5">
        {/* Total Balance */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Euro size={16} className="text-blue-400" />
            <span className="text-slate-300">Total Balance</span>
          </div>
          <span className="font-mono text-base font-semibold text-white">{displayCurrency(totalBalance)}</span>
        </div>

        {showDetails && (
          <>
            {/* Used Margin with breakdown */}
            {usedMargin > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Lock size={16} className="text-orange-400" />
                    <span className="text-slate-300">Used Margin</span>
                  </div>
                  <span className="font-mono font-medium text-orange-400">{displayCurrency(usedMargin)}</span>
                </div>
                
                {/* Margin breakdown */}
                <div className="ml-6 space-y-1">
                  {futuresUsedMargin > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        <Activity size={12} className="text-orange-300" />
                        <span className="text-slate-400">Futures Positions</span>
                      </div>
                      <span className="font-mono text-orange-300">{displayCurrency(futuresUsedMargin)}</span>
                    </div>
                  )}
                  {futuresOrdersReserved > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        <Package size={12} className="text-orange-300" />
                        <span className="text-slate-400">Futures Orders</span>
                      </div>
                      <span className="font-mono text-orange-300">{displayCurrency(futuresOrdersReserved)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Unrealized PnL */}
            {unrealizedPnl !== 0 && (
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  {unrealizedPnl >= 0 ? (
                    <TrendingUp size={16} className="text-emerald-400" />
                  ) : (
                    <TrendingDown size={16} className="text-red-400" />
                  )}
                  <span className="text-slate-300">Unrealized PnL</span>
                </div>
                <span className={`font-medium ${unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {showBalance && unrealizedPnl >= 0 ? '+' : ''}{displayCurrency(unrealizedPnl)}
                </span>
              </div>
            )}

            {/* Robot Allocated Balance */}
            {robotAllocatedBalance > 0 && (
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Lock size={16} className="text-purple-400" />
                  <span className="text-slate-300">Reserved (Robot)</span>
                </div>
                <span className="font-mono font-medium text-purple-400">{displayCurrency(robotAllocatedBalance)}</span>
              </div>
            )}

            {/* Staked Amount */}
            {stakedAmount > 0 && (
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Layers size={16} className="text-indigo-400" />
                  <span className="text-slate-300">Staked Assets</span>
                </div>
                <span className="font-mono font-medium text-indigo-400">{displayCurrency(stakedAmount)}</span>
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-slate-700/50 my-4"></div>
          </>
        )}

        {/* Available Balance */}
        <div className="flex justify-between items-center app-surface-muted rounded-xl p-4">
          <div className="flex items-center gap-2">
            <Wallet size={16} className="text-emerald-400" />
            <span className="text-white font-semibold">Available Balance</span>
          </div>
          <span className="font-mono text-lg font-bold text-emerald-400">{displayCurrency(availableBalance)}</span>
        </div>

        {/* Info note */}
        <div className="flex items-start gap-2 border-t border-white/[0.07] pt-3 text-xs leading-relaxed text-slate-500">
          <Info size={14} className="mt-0.5 flex-shrink-0" />
          <div>
            Available balance reflects funds after trading margin. Robot allocations and staked assets remain part of total value.
          </div>
        </div>
      </div>
    </div>
  );
};

export default WalletBreakdownCard;
