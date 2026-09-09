import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Info, TrendingUp, Clock, Users, Award, Zap, DollarSign } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SPREAD_RANGES, DEFAULT_SPREADS } from '../constants/spreadConfig';
import { SWAP_RATES_BY_TYPE } from '../constants/swapConfig';
import { CFD_TIERS } from '../constants/tradingTiers';

const TradingFeesPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'spreads' | 'swaps' | 'leverage' | 'referral'>('spreads');

  const sampleSpreads = useMemo(() => Object.entries(DEFAULT_SPREADS).slice(0, 15), []);

  return (
    <div className="min-h-screen app-page-bg text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>

        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            Trading Fees & Conditions
          </h1>
          <p className="text-slate-400 text-lg">
            Transparent pricing for all instruments and trading conditions
          </p>
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
          <button
            onClick={() => setActiveTab('spreads')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
              activeTab === 'spreads'
                ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg'
                : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50'
            }`}
          >
            <TrendingUp className="w-5 h-5" />
            Spreads
          </button>
          <button
            onClick={() => setActiveTab('swaps')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
              activeTab === 'swaps'
                ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg'
                : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50'
            }`}
          >
            <Clock className="w-5 h-5" />
            Swap Fees
          </button>
          <button
            onClick={() => setActiveTab('leverage')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
              activeTab === 'leverage'
                ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg'
                : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50'
            }`}
          >
            <Zap className="w-5 h-5" />
            Leverage Tiers
          </button>
          <button
            onClick={() => setActiveTab('referral')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
              activeTab === 'referral'
                ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg'
                : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50'
            }`}
          >
            <Users className="w-5 h-5" />
            Referral Program
          </button>
        </div>

        {activeTab === 'spreads' && (
          <div className="space-y-6">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
              <div className="flex items-start gap-3 mb-6">
                <div className="p-3 bg-blue-500/10 rounded-xl">
                  <Info className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold mb-2">What are Spreads?</h2>
                  <p className="text-slate-400">
                    A spread is the difference between the buy and sell price of an instrument. It's charged once when you open a position and once when you close it. Lower spreads mean lower trading costs.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(SPREAD_RANGES).map(([key, config]) => (
                <div
                  key={key}
                  className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50 hover:border-blue-500/50 transition-all"
                >
                  <h3 className="text-lg font-bold mb-2 text-blue-400">{config.description}</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Range:</span>
                      <span className="font-mono text-white">{config.range}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Typical:</span>
                      <span className="font-mono text-emerald-400">{config.typical}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
              <h3 className="text-xl font-bold mb-4">Example Spreads</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 text-slate-400 font-medium">Instrument</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium">Type</th>
                      <th className="text-right py-3 px-4 text-slate-400 font-medium">Spread %</th>
                      <th className="text-right py-3 px-4 text-slate-400 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sampleSpreads.map(([symbol, config]) => (
                      <tr key={symbol} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                        <td className="py-3 px-4 font-medium">{symbol}</td>
                        <td className="py-3 px-4 text-slate-400 capitalize">{config.instrumentType}</td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-400">
                          {(config.spreadPercentage * 100).toFixed(4)}%
                        </td>
                        <td className="py-3 px-4 text-right text-slate-400">
                          {config.description || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-slate-500 mt-4">Showing top 15 instruments. Spreads are dynamic and may vary based on market conditions.</p>
            </div>
          </div>
        )}

        {activeTab === 'swaps' && (
          <div className="space-y-6">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
              <div className="flex items-start gap-3 mb-6">
                <div className="p-3 bg-purple-500/10 rounded-xl">
                  <Clock className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold mb-2">What are Swap Fees?</h2>
                  <p className="text-slate-400 mb-3">
                    Swap fees (also called overnight fees or rollover fees) are charged for holding leveraged positions overnight. These fees reflect the cost of borrowing capital to maintain your leveraged position.
                  </p>
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                    <p className="text-yellow-400 text-sm font-medium">
                      Important: Swap fees are automatically applied daily at 00:00 UTC for all open positions held longer than 24 hours.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(SWAP_RATES_BY_TYPE).map(([key, config]) => (
                <div
                  key={key}
                  className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50 hover:border-purple-500/50 transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-purple-400 mb-1">{config.description}</h3>
                      <p className="text-sm text-slate-400">{config.notes}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-t border-slate-700/50">
                      <span className="text-slate-400">Daily Rate:</span>
                      <span className="font-mono text-xl font-bold text-white">
                        {(config.dailySwapRate * 100).toFixed(4)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Annualized:</span>
                      <span className="font-mono text-emerald-400">
                        {(config.annualizedRate * 100).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
              <h3 className="text-xl font-bold mb-4">Example: Swap Cost Calculation</h3>
              <div className="app-surface-muted rounded-xl p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-slate-400 mb-2">Position Details:</p>
                    <ul className="space-y-2 text-sm">
                      <li className="flex justify-between">
                        <span className="text-slate-500">Symbol:</span>
                        <span className="font-mono">EUR/USD</span>
                      </li>
                      <li className="flex justify-between">
                        <span className="text-slate-500">Position Size:</span>
                        <span className="font-mono">$10,000</span>
                      </li>
                      <li className="flex justify-between">
                        <span className="text-slate-500">Leverage:</span>
                        <span className="font-mono">10x</span>
                      </li>
                      <li className="flex justify-between">
                        <span className="text-slate-500">Daily Swap Rate:</span>
                        <span className="font-mono text-purple-400">0.002%</span>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <p className="text-slate-400 mb-2">Swap Costs:</p>
                    <ul className="space-y-2 text-sm">
                      <li className="flex justify-between">
                        <span className="text-slate-500">Per Day:</span>
                        <span className="font-mono text-red-400">$0.20</span>
                      </li>
                      <li className="flex justify-between">
                        <span className="text-slate-500">Per Week (7 days):</span>
                        <span className="font-mono text-red-400">$1.40</span>
                      </li>
                      <li className="flex justify-between">
                        <span className="text-slate-500">Per Month (30 days):</span>
                        <span className="font-mono text-red-400">$6.00</span>
                      </li>
                      <li className="flex justify-between border-t border-slate-700 pt-2">
                        <span className="text-slate-500">Per Year (365 days):</span>
                        <span className="font-mono text-red-400 font-bold">$73.00</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'leverage' && (
          <div className="space-y-6">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
              <div className="flex items-start gap-3 mb-6">
                <div className="p-3 bg-orange-500/10 rounded-xl">
                  <Zap className="w-6 h-6 text-orange-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold mb-2">Leverage Tiers</h2>
                  <p className="text-slate-400">
                    Your available leverage depends on your account equity. Higher equity unlocks higher leverage limits for better capital efficiency.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {CFD_TIERS.map((tier, index) => (
                <div
                  key={tier.name}
                  className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50 hover:border-orange-500/50 transition-all relative overflow-hidden"
                >
                  {index === CFD_TIERS.length - 1 && (
                    <div className="absolute top-4 right-4">
                      <Award className="w-8 h-8 text-yellow-400" />
                    </div>
                  )}
                  <div className="mb-4">
                    <h3 className="text-2xl font-bold text-orange-400 mb-1">{tier.name}</h3>
                    <p className="text-sm text-slate-400">{tier.description}</p>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-t border-slate-700/50">
                      <span className="text-slate-400">Min. Equity:</span>
                      <span className="font-mono text-lg font-bold text-white">
                        ${tier.minEquity.toLocaleString()}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="app-surface-muted rounded-lg p-3 text-center">
                        <p className="text-xs text-slate-500 mb-1">Forex</p>
                        <p className="font-mono text-lg font-bold text-emerald-400">{tier.maxForex}x</p>
                      </div>
                      <div className="app-surface-muted rounded-lg p-3 text-center">
                        <p className="text-xs text-slate-500 mb-1">Commodities</p>
                        <p className="font-mono text-lg font-bold text-blue-400">{tier.maxCommodities}x</p>
                      </div>
                      <div className="app-surface-muted rounded-lg p-3 text-center">
                        <p className="text-xs text-slate-500 mb-1">Stocks</p>
                        <p className="font-mono text-lg font-bold text-purple-400">{tier.maxStocks}x</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/30 rounded-xl p-6">
              <h3 className="text-lg font-bold mb-3 text-orange-400">Risk Warning</h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                Trading with high leverage can amplify both profits and losses. While leverage allows you to control larger positions with less capital, it also increases the risk of significant losses. Always use appropriate risk management and never trade with money you cannot afford to lose.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'referral' && (
          <div className="space-y-6">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
              <div className="flex items-start gap-3 mb-6">
                <div className="p-3 bg-green-500/10 rounded-xl">
                  <Users className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold mb-2">Referral Commission Program</h2>
                  <p className="text-slate-400">
                    Earn passive income by referring traders to our platform. You'll receive a percentage of the profits your referrals make from their trades.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="app-surface-primary rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-lg bg-slate-500/10 flex items-center justify-center">
                    <span className="text-sm font-bold text-slate-400">0-2</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-white">Beginner</h3>
                    <p className="text-sm text-slate-400">0-2 referrals</p>
                  </div>
                </div>
                <div className="app-surface-muted rounded-lg p-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-slate-400">1%</span>
                    <span className="text-slate-400">commission</span>
                  </div>
                </div>
              </div>

              <div className="app-surface-primary rounded-xl p-6 border border-sky-500/30">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <span className="text-sm font-bold text-blue-400">3-9</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-white">Bronze</h3>
                    <p className="text-sm text-slate-400">3-9 referrals</p>
                  </div>
                </div>
                <div className="app-surface-muted rounded-lg p-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-blue-400">1.5%</span>
                    <span className="text-slate-400">commission</span>
                  </div>
                </div>
              </div>

              <div className="app-surface-primary rounded-xl p-6 border border-cyan-500/30">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                    <span className="text-xs font-bold text-cyan-400">10-24</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-white">Silver</h3>
                    <p className="text-sm text-slate-400">10-24 referrals</p>
                  </div>
                </div>
                <div className="app-surface-muted rounded-lg p-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-cyan-400">2%</span>
                    <span className="text-slate-400">commission</span>
                  </div>
                </div>
              </div>

              <div className="app-surface-primary rounded-xl p-6 border border-emerald-500/30">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <span className="text-xs font-bold text-emerald-400">25-49</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-white">Gold</h3>
                    <p className="text-sm text-slate-400">25-49 referrals</p>
                  </div>
                </div>
                <div className="app-surface-muted rounded-lg p-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-emerald-400">3%</span>
                    <span className="text-slate-400">commission</span>
                  </div>
                </div>
              </div>

              <div className="app-surface-primary rounded-xl p-6 border border-orange-500/30">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-lg bg-orange-500/10 flex items-center justify-center">
                    <span className="text-xs font-bold text-orange-400">50-99</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-white">Platinum</h3>
                    <p className="text-sm text-slate-400">50-99 referrals</p>
                  </div>
                </div>
                <div className="app-surface-muted rounded-lg p-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-orange-400">4%</span>
                    <span className="text-slate-400">commission</span>
                  </div>
                </div>
              </div>

              <div className="app-surface-primary rounded-xl p-6 border border-violet-500/30 md:col-span-2 lg:col-span-1">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <Award className="w-6 h-6 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">Diamond</h3>
                    <p className="text-sm text-slate-400">100+ referrals</p>
                  </div>
                </div>
                <div className="app-surface-muted rounded-lg p-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-purple-400">5%</span>
                    <span className="text-slate-400">commission</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
              <h3 className="text-xl font-bold mb-4">How It Works</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <DollarSign className="w-8 h-8 text-blue-400" />
                  </div>
                  <h4 className="font-bold mb-2">Share Your Link</h4>
                  <p className="text-sm text-slate-400">
                    Get your unique referral code and share it with potential traders
                  </p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-500/10 flex items-center justify-center">
                    <TrendingUp className="w-8 h-8 text-purple-400" />
                  </div>
                  <h4 className="font-bold mb-2">They Trade</h4>
                  <p className="text-sm text-slate-400">
                    When your referrals make profitable trades, you earn a commission
                  </p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <Award className="w-8 h-8 text-emerald-400" />
                  </div>
                  <h4 className="font-bold mb-2">Get Paid</h4>
                  <p className="text-sm text-slate-400">
                    Commission is automatically added to your balance instantly
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-xl p-6">
              <h3 className="text-lg font-bold mb-3 text-green-400">Important Notes</h3>
              <ul className="space-y-2 text-sm text-slate-300">
                <li className="flex gap-2">
                  <span className="text-green-400">•</span>
                  <span>You earn commission ONLY on your referrals' profitable trades (not on losses)</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-green-400">•</span>
                  <span>Commission is calculated on net profit after all trading costs (spreads, swaps)</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-green-400">•</span>
                  <span>Your tier automatically upgrades as you refer more users - start at 1% and work your way up to 5%</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-green-400">•</span>
                  <span>No minimum payout threshold - earnings are credited immediately</span>
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TradingFeesPage;


