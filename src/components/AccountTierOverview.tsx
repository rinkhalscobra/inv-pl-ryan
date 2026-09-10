import { Award, BarChart3, CheckCircle, TrendingUp } from 'lucide-react';
import { CFD_TIERS, CfdTier } from '../constants/tradingTiers';
import { UserStatus } from '../App';
import { useFiatCurrency } from '../hooks/useFiatCurrency';

interface AccountTierOverviewProps {
  userStatus: UserStatus;
  totalPortfolioValue: number;
  userCfdTier: CfdTier;
}

const portfolioTiers: Array<{ name: UserStatus; threshold: number }> = [
  { name: 'No-Coiner', threshold: 0 },
  { name: 'Shrimp', threshold: 250 },
  { name: 'Crab', threshold: 10_000 },
  { name: 'Octopus', threshold: 25_000 },
  { name: 'Dolphin', threshold: 50_000 },
  { name: 'Shark', threshold: 100_000 },
  { name: 'Whale', threshold: 500_000 },
  { name: 'Humpback', threshold: 2_000_000 },
];

export default function AccountTierOverview({
  userStatus,
  totalPortfolioValue,
  userCfdTier,
}: AccountTierOverviewProps) {
  const { formatFiatCompact, formatFiatWhole } = useFiatCurrency();

  return (
    <div className="space-y-6">
      <div className="app-surface-primary rounded-2xl p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/15 text-purple-400">
            <TrendingUp size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-white">Account Progression</h3>
            <p className="text-xs text-slate-400">Status and trading access at a glance</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
              <Award size={15} className="text-emerald-400" /> Portfolio status
            </div>
            <div className="text-lg font-bold text-emerald-400">{userStatus}</div>
            <div className="mt-1 text-xs text-slate-400">
              {formatFiatWhole(totalPortfolioValue)}
            </div>
          </div>

          <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
              <BarChart3 size={15} className="text-blue-400" /> CFD tier
            </div>
            <div className="text-lg font-bold text-blue-400">{userCfdTier.name}</div>
            <div className="mt-1 text-xs text-slate-400">Up to {userCfdTier.maxForex}x forex</div>
          </div>
        </div>
      </div>

      <div className="app-surface-primary rounded-2xl p-6">
        <div className="mb-5">
          <h3 className="font-semibold text-white">Portfolio Status Tiers</h3>
          <p className="mt-1 text-xs text-slate-400">Your status grows with your total portfolio value</p>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {portfolioTiers.map((tier) => {
            const isCurrent = tier.name === userStatus;
            return (
              <div
                key={tier.name}
                className={`rounded-xl border px-3 py-3 transition-colors ${
                  isCurrent
                    ? 'border-emerald-500/50 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
                    : 'border-slate-700/60 bg-slate-800/35'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`truncate text-sm font-semibold ${isCurrent ? 'text-emerald-400' : 'text-white'}`}>
                    {tier.name}
                  </span>
                  {isCurrent && <CheckCircle size={14} className="shrink-0 text-emerald-400" />}
                </div>
                <div className="mt-1 text-xs text-slate-400">From {formatFiatCompact(tier.threshold)}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="app-surface-primary rounded-2xl p-6">
        <div className="mb-5">
          <h3 className="font-semibold text-white">CFD Trading Tiers</h3>
          <p className="mt-1 text-xs text-slate-400">Maximum leverage available at each level</p>
        </div>

        <div className="space-y-2.5">
          {CFD_TIERS.map((tier) => {
            const isCurrent = tier.name === userCfdTier.name;
            return (
              <div
                key={tier.name}
                className={`rounded-xl border p-3.5 ${
                  isCurrent
                    ? 'border-blue-500/50 bg-blue-500/10 shadow-lg shadow-blue-500/10'
                    : 'border-slate-700/60 bg-slate-800/35'
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold ${isCurrent ? 'text-blue-400' : 'text-white'}`}>{tier.name}</span>
                      {isCurrent && (
                        <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-300">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">From {formatFiatCompact(tier.minEquity)}</div>
                  </div>
                  <div className="grid shrink-0 grid-cols-3 gap-3 text-center">
                    <div><div className="text-sm font-bold text-emerald-400">{tier.maxForex}x</div><div className="text-[10px] text-slate-500">FX</div></div>
                    <div><div className="text-sm font-bold text-blue-400">{tier.maxCommodities}x</div><div className="text-[10px] text-slate-500">CMD</div></div>
                    <div><div className="text-sm font-bold text-purple-400">{tier.maxStocks}x</div><div className="text-[10px] text-slate-500">STK</div></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
