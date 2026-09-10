import React, { useState } from 'react';
import { Copy, Users, TrendingUp, Euro, Calendar, CheckCircle, Gift, Share2, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { useReferrals } from '../hooks/useReferrals';
import { useTranslation } from 'react-i18next';
import { formatReferralCode } from '../utils/formatReferralCode';
import { useFiatCurrency } from '../hooks/useFiatCurrency';

const ReferralTab: React.FC = () => {
  const { t } = useTranslation();
  const { formatFiat } = useFiatCurrency();
  const {
    loading,
    referralCode,
    referralEarnings,
    referralStats,
    referredUsers,
    copyReferralLink,
    copyReferralCode,
  } = useReferrals();

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const handleCopyCode = () => {
    copyReferralCode();
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    copyReferralLink();
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const referralLink = referralCode ? `${window.location.origin}/signup?ref=${referralCode}` : '';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
          <h2 className="text-xl font-bold text-white mb-2">Loading Referral Data</h2>
          <p className="text-slate-400">Please wait while we fetch your referral information</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 backdrop-blur-sm rounded-2xl p-8 border border-blue-500/30 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl flex items-center justify-center">
            <Gift size={24} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Referral Program</h2>
            <p className="text-slate-300 text-sm">
              {(() => {
                const count = referralStats.totalReferrals;
                let rate = '1%';
                let nextTier = '';

                if (count >= 100) {
                  rate = '5%';
                  nextTier = 'Maximum tier reached!';
                } else if (count >= 50) {
                  rate = '4%';
                  nextTier = `${100 - count} more to reach 5%`;
                } else if (count >= 25) {
                  rate = '3%';
                  nextTier = `${50 - count} more to reach 4%`;
                } else if (count >= 10) {
                  rate = '2%';
                  nextTier = `${25 - count} more to reach 3%`;
                } else if (count >= 3) {
                  rate = '1.5%';
                  nextTier = `${10 - count} more to reach 2%`;
                } else {
                  rate = '1%';
                  nextTier = `${3 - count} more to reach 1.5%`;
                }

                return (
                  <>
                    Current tier: <span className="font-bold text-emerald-400">{rate}</span> commission
                    {count < 100 && <span className="text-slate-400"> • {nextTier}</span>}
                  </>
                );
              })()}
            </p>
          </div>
        </div>

        <div className="app-surface-muted rounded-xl p-6 mb-6">
          <div className="text-slate-400 text-sm mb-2">Your Referral Code</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-slate-800/50 text-white px-4 py-3 rounded-lg font-mono text-lg tracking-widest">
              {formatReferralCode(referralCode)}
            </code>
            <button
              onClick={handleCopyCode}
              className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg transition-colors flex items-center gap-2"
            >
              {copiedCode ? <CheckCircle size={20} /> : <Copy size={20} />}
              {copiedCode && <span className="text-sm">Copied!</span>}
            </button>
          </div>
        </div>

        <div className="app-surface-muted rounded-xl p-6">
          <div className="text-slate-400 text-sm mb-2">Your Referral Link</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-slate-800/50 text-white px-4 py-3 rounded-lg font-mono text-sm overflow-hidden text-ellipsis whitespace-nowrap">
              {referralLink || 'Loading...'}
            </div>
            <button
              onClick={handleCopyLink}
              className="bg-purple-600 hover:bg-purple-700 text-white p-3 rounded-lg transition-colors flex items-center gap-2"
            >
              {copiedLink ? <CheckCircle size={20} /> : <Share2 size={20} />}
              {copiedLink && <span className="text-sm">Copied!</span>}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <Users size={20} className="text-blue-400" />
            </div>
            <div className="text-slate-400 text-sm">Total Referrals</div>
          </div>
          <div className="text-3xl font-bold text-white">{referralStats.totalReferrals}</div>
          <div className="text-emerald-400 text-sm mt-1">
            {referralStats.activeReferrals} active this month
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
              <Euro size={20} className="text-emerald-400" />
            </div>
            <div className="text-slate-400 text-sm">Total Earnings</div>
          </div>
          <div className="text-3xl font-bold text-white">
            {formatFiat(referralStats.totalEarnings)}
          </div>
          <div className="text-slate-400 text-sm mt-1">Lifetime commission</div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <TrendingUp size={20} className="text-purple-400" />
            </div>
            <div className="text-slate-400 text-sm">This Month</div>
          </div>
          <div className="text-3xl font-bold text-white">
            {formatFiat(referralStats.earningsThisMonth)}
          </div>
          <div className="text-slate-400 text-sm mt-1">Current month earnings</div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
              <Calendar size={20} className="text-amber-400" />
            </div>
            <div className="text-slate-400 text-sm">Today</div>
          </div>
          <div className="text-3xl font-bold text-white">
            {formatFiat(referralStats.earningsToday)}
          </div>
          <div className="text-slate-400 text-sm mt-1">Today's earnings</div>
        </div>
      </div>

      <div className="app-surface-primary rounded-2xl p-6">
        <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <Users size={20} className="text-blue-400" />
          Your Referrals
        </h3>

        {referredUsers.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users size={32} className="text-slate-500" />
            </div>
            <p className="text-slate-400 mb-2">No referrals yet</p>
            <p className="text-slate-500 text-sm">Share your referral link to start earning commissions</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left text-slate-400 text-sm font-medium py-3 px-2">User</th>
                  <th className="text-left text-slate-400 text-sm font-medium py-3 px-2">Joined</th>
                  <th className="text-right text-slate-400 text-sm font-medium py-3 px-2">Total Earned</th>
                  <th className="text-right text-slate-400 text-sm font-medium py-3 px-2">Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {referredUsers.map((referredUser) => (
                  <tr key={referredUser.id} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                    <td className="py-3 px-2">
                      <div className="text-white font-medium">{referredUser.email}</div>
                    </td>
                    <td className="py-3 px-2 text-slate-400 text-sm">
                      {new Date(referredUser.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-2 text-right">
                      <span className="text-emerald-400 font-semibold">
                        {formatFiat(referredUser.total_earned_from_user)}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right text-slate-400 text-sm">
                      {referredUser.last_earning_date
                        ? new Date(referredUser.last_earning_date).toLocaleDateString()
                        : 'No activity'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="app-surface-primary rounded-2xl p-6">
        <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <TrendingUp size={20} className="text-emerald-400" />
          Recent Commission Earnings
        </h3>

        {referralEarnings.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Euro size={32} className="text-slate-500" />
            </div>
            <p className="text-slate-400 mb-2">No earnings yet</p>
            <p className="text-slate-500 text-sm">You'll earn 1% commission when your referrals close winning positions</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 mb-4">
              {referralEarnings
                .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                .map((earning) => (
                  <div
                    key={earning.id}
                    className="app-surface-muted rounded-lg p-4 border border-slate-700/50 hover:border-emerald-500/30 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                          <Euro size={20} className="text-emerald-400" />
                        </div>
                        <div>
                          <div className="text-white font-semibold">
                            +{formatFiat(earning.commission_amount)}
                          </div>
                          <div className="text-slate-400 text-sm">
                            {earning.referred_user_email || 'User'}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-slate-300 font-medium">
                          {earning.position_symbol} {earning.position_side}
                        </div>
                        <div className="text-slate-500 text-sm">
                          PnL: {formatFiat(earning.position_pnl)}
                        </div>
                      </div>
                    </div>
                    <div className="text-slate-500 text-xs">
                      {new Date(earning.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
            </div>

            {referralEarnings.length > itemsPerPage && (
              <div className="flex items-center justify-between pt-4 border-t border-slate-700/50">
                <div className="text-slate-400 text-sm">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to{' '}
                  {Math.min(currentPage * itemsPerPage, referralEarnings.length)} of{' '}
                  {referralEarnings.length} earnings
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="flex items-center gap-1 px-3 py-2 bg-slate-700/50 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    <ChevronLeft size={16} />
                    Previous
                  </button>
                  <div className="text-slate-400 text-sm px-3">
                    Page {currentPage} of {Math.ceil(referralEarnings.length / itemsPerPage)}
                  </div>
                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, Math.ceil(referralEarnings.length / itemsPerPage)))}
                    disabled={currentPage === Math.ceil(referralEarnings.length / itemsPerPage)}
                    className="flex items-center gap-1 px-3 py-2 bg-slate-700/50 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    Next
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="app-surface-primary rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Commission Tiers</h3>
        <div className="space-y-3 mb-6">
          <div className="flex items-center justify-between app-surface-muted rounded-lg p-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-600/20 rounded-lg flex items-center justify-center">
                <span className="text-slate-400 font-bold text-sm">0-2</span>
              </div>
              <div className="text-slate-300">0-2 referrals</div>
            </div>
            <div className="text-white font-bold">1%</div>
          </div>
          <div className="flex items-center justify-between app-surface-muted rounded-lg p-3 border border-blue-500/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <span className="text-blue-400 font-bold text-sm">3-9</span>
              </div>
              <div className="text-blue-300">3-9 referrals</div>
            </div>
            <div className="text-blue-400 font-bold">1.5%</div>
          </div>
          <div className="flex items-center justify-between app-surface-muted rounded-lg p-3 border border-cyan-500/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center">
                <span className="text-cyan-400 font-bold text-sm">10-24</span>
              </div>
              <div className="text-cyan-300">10-24 referrals</div>
            </div>
            <div className="text-cyan-400 font-bold">2%</div>
          </div>
          <div className="flex items-center justify-between app-surface-muted rounded-lg p-3 border border-emerald-500/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                <span className="text-emerald-400 font-bold text-sm">25-49</span>
              </div>
              <div className="text-emerald-300">25-49 referrals</div>
            </div>
            <div className="text-emerald-400 font-bold">3%</div>
          </div>
          <div className="flex items-center justify-between app-surface-muted rounded-lg p-3 border border-amber-500/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                <span className="text-amber-400 font-bold text-sm">50-99</span>
              </div>
              <div className="text-amber-300">50-99 referrals</div>
            </div>
            <div className="text-amber-400 font-bold">4%</div>
          </div>
          <div className="flex items-center justify-between bg-gradient-to-r from-purple-900/50 to-pink-900/50 rounded-lg p-3 border border-purple-500/50 shadow-lg shadow-purple-500/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-500/30 rounded-lg flex items-center justify-center">
                <span className="text-purple-300 font-bold text-sm">100+</span>
              </div>
              <div className="text-purple-300 font-semibold">100+ referrals</div>
            </div>
            <div className="text-purple-400 font-bold text-lg">5%</div>
          </div>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <TrendingUp size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-200">
              <span className="font-semibold">Unlock higher earnings!</span> Your commission rate automatically increases as you refer more friends. Start at 1% and work your way up to 5% by building a strong referral network.
            </div>
          </div>
        </div>
      </div>

      <div className="app-surface-primary rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">How It Works</h3>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-blue-400 font-bold">1</span>
            </div>
            <div>
              <div className="text-white font-medium">Share Your Link</div>
              <div className="text-slate-400 text-sm">
                Copy your unique referral link and share it with friends
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-purple-400 font-bold">2</span>
            </div>
            <div>
              <div className="text-white font-medium">They Sign Up & Trade</div>
              <div className="text-slate-400 text-sm">
                When they join using your link and start trading, you're connected
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-emerald-400 font-bold">3</span>
            </div>
            <div>
              <div className="text-white font-medium">Earn Commission</div>
              <div className="text-slate-400 text-sm">
                Every time they close a winning position, you automatically earn commission on their profit
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReferralTab;



