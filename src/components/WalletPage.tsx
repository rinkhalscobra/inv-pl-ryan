import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownLeft,
  Bitcoin,
  DollarSign,
  Banknote,
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  EyeOff,
  Info,
  Layers,
  CreditCard as Card,
  ArrowRight,
  BarChart3,
  Euro
} from 'lucide-react';
import NowPaymentsDeposit from './NowPaymentsDeposit';
import BankWithdrawalModal from './BankWithdrawalModal';
import CryptoWithdrawalModal from './CryptoWithdrawalModal';
import CryptoHoldings from './CryptoHoldings';
import PnlStatement from './PnlStatement';
import { MarketData, DatabaseTransaction, DatabaseUserAsset, DatabaseUserStake } from '../hooks/useDatabase';
import { supabase } from '../lib/supabaseClient';
import WalletBreakdownCard from './WalletBreakdownCard';
import { WalletBreakdown } from '../hooks/useWalletBreakdown';
import { useBybitData } from '../contexts/BybitDataContext';
import { useFiatCurrency } from '../hooks/useFiatCurrency';
import ManualDepositRequest from './ManualDepositRequest';

interface WalletPageProps {
  usdtBalance: number;
  usdBalance: number;
  btcBalance: number;
  transactions: DatabaseTransaction[];
  kycStatus: 'not_verified' | 'pending' | 'verified';
  setTradingMode?: (mode: string) => void;
  marketData: MarketData[];
  userAssets?: DatabaseUserAsset[];
  userStakes: DatabaseUserStake[];
  calculateCurrentEarnings: (stake: DatabaseUserStake) => number;
  walletBreakdown: WalletBreakdown & { refreshBreakdown: () => Promise<void> };
}

interface BankTransferDetails {
  bank_name?: string | null;
  account_number?: string | null;
  routing_number?: string | null;
  swift_code?: string | null;
  beneficiary_name?: string | null;
  iban?: string | null;
}

const errorMessage = (error: unknown, fallback: string) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : fallback;

const WalletPage: React.FC<WalletPageProps> = ({
  usdtBalance,
  usdBalance,
  btcBalance,
  transactions,
  kycStatus,
  setTradingMode,
  userAssets = [],
  userStakes,
  calculateCurrentEarnings,
  walletBreakdown: walletBreakdownData,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { getPriceBySymbol: getBybitPrice, getCryptoDataBySymbol } = useBybitData();
  const { convertUsdToEur, formatEur, formatFiat } = useFiatCurrency();

  // Helper function to format date safely
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleDateString();
    } catch {
      return 'N/A';
    }
  };
  // State for wallet operations
  const [activeTab, setActiveTab] = useState('overview');
  const [depositMethod, setDepositMethod] = useState<'bank_transfer' | 'nowpayments' | 'btc_direct'>('bank_transfer');
  const [showBalance, setShowBalance] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [showBankWithdrawalModal, setShowBankWithdrawalModal] = useState(false);
  const [fiatCurrency, setFiatCurrency] = useState<'EUR' | 'USD'>('EUR');
  const [showCryptoWithdrawalModal, setShowCryptoWithdrawalModal] = useState(false);
  
  const actualBtcPrice = getBybitPrice('BTCUSDT');
  const wsGetPrice = useCallback((symbol: string): number => getBybitPrice(symbol), [getBybitPrice]);

  // State for bank transfer details
  const [bankDetails, setBankDetails] = useState<BankTransferDetails | null>(null);
  const [loadingBankDetails, setLoadingBankDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get user ID from Supabase auth
  const [userId, setUserId] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchUserId = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    };
    
    fetchUserId();
  }, []);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  // Fetch bank details when bank transfer tab is active
  const fetchBankDetails = useCallback(async () => {
    if (!userId) return;
    setLoadingBankDetails(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('client_bank_details')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 means "no rows found"
        throw error;
      }
      setBankDetails(data);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to load bank details.'));
      setBankDetails(null);
    } finally {
      setLoadingBankDetails(false);
    }
  }, [userId]);

  useEffect(() => {
    if (activeTab === 'deposit' && depositMethod === 'bank_transfer') {
      fetchBankDetails();
    }
  }, [activeTab, depositMethod, fetchBankDetails]);

  // Reserve funds and create the request together in the database.
  const handleBankWithdrawalSubmit = async (amount: number, bankDetails: {
    bankName: string;
    accountNumber: string;
    routingNumber: string;
    beneficiaryName: string;
  }): Promise<string> => {
    try {
      if (kycStatus !== 'verified') throw new Error('Identity verification is required before withdrawing funds.');
      const { data, error: rpcError } = await supabase.rpc('request_fiat_withdrawal', {
        p_currency: fiatCurrency,
        p_amount: amount,
        p_bank_name: bankDetails.bankName,
        p_account_number: bankDetails.accountNumber,
        p_routing_number: bankDetails.routingNumber,
        p_beneficiary_name: bankDetails.beneficiaryName,
      });
      if (rpcError) throw rpcError;
      const transactionId = typeof data === 'string' ? data : data?.transaction_id;
      if (!transactionId) throw new Error('The withdrawal request did not return a transaction reference.');
      await walletBreakdownData.refreshBreakdown();
      setMessage({ type: 'success', text: 'Bank withdrawal initiated successfully' });
      setShowBankWithdrawalModal(false);
      return transactionId;
    } catch (error: unknown) {
      console.error('Error processing bank withdrawal:', error);
      const reason = errorMessage(error, 'Withdrawal failed. Please try again.');
      setMessage({ type: 'error', text: reason });
      throw new Error(reason);
    }
  };

  const handleCryptoWithdrawal = async (amount: number, address: string, network: string): Promise<string> => {
    try {
      if (kycStatus !== 'verified') throw new Error('Identity verification is required before withdrawing funds.');
      const { data, error: rpcError } = await supabase.rpc('request_btc_withdrawal', {
        p_amount_btc: amount,
        p_address: address,
        p_network: network,
      });
      if (rpcError) throw rpcError;
      const transactionId = typeof data === 'string' ? data : data?.transaction_id;
      if (!transactionId) throw new Error('The withdrawal request did not return a transaction reference.');
      await walletBreakdownData.refreshBreakdown();
      setMessage({ type: 'success', text: 'BTC withdrawal initiated successfully' });
      setShowCryptoWithdrawalModal(false);
      return transactionId;
    } catch (error: unknown) {
      console.error('Error processing crypto withdrawal:', error);
      const reason = errorMessage(error, 'Withdrawal failed. Please try again.');
      setMessage({ type: 'error', text: reason });
      throw new Error(reason);
    }
  };

  const totalStakedValue = userStakes.reduce((total, stake) => {
    if (stake.status !== 'active') return total;
    
    const symbol = stake.asset_symbol.toUpperCase();
    const price = symbol === 'USDT' ? 1 : wsGetPrice(`${symbol}USDT`);
    const stakedValue = parseFloat(stake.staked_amount.toString()) * price;
    
    return total + stakedValue;
  }, 0);

  // Calculate total earnings from staking
  const totalStakingEarnings = userStakes.reduce((total, stake) => {
    const symbol = stake.asset_symbol.toUpperCase();
    const price = symbol === 'USDT' ? 1 : wsGetPrice(`${symbol}USDT`);
    return total + calculateCurrentEarnings(stake) * price;
  }, 0);

  // Calculate 24h change
  const btc24hChange = getCryptoDataBySymbol('BTCUSDT')?.change_24h || 0;
  const portfolioChange24h = (btcBalance * actualBtcPrice * (btc24hChange / 100));
  
  const formatCurrency = formatFiat;

  const formatTransactionAmount = (transaction: { amount: number; currency?: string; description?: string }) => {
    const transactionAmount = Number(transaction.amount);
    const currency = transaction.currency?.toUpperCase() ||
      (transaction.description?.startsWith('CRM BTC balance adjustment:') ? 'BTC' : '');
    if (currency === 'EUR') return formatEur(transactionAmount);
    if (currency === 'USD') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(transactionAmount);
    if (currency === 'BTC') return `${transactionAmount.toFixed(8)} BTC`;
    return formatFiat(transactionAmount);
  };

  const formatCrypto = (amount: number, symbol: string) => {
    const decimals = symbol === 'BTC' ? 6 : 2;
    return `${amount.toFixed(decimals)} ${symbol}`;
  };

  const isPositiveTransaction = (type: string) => (
    type === 'deposit' ||
    type === 'nowpayments_deposit' ||
    type === 'robot_profit' ||
    type === 'staking_profit'
  );

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'deposit':
      case 'nowpayments_deposit':
        return <ArrowDownLeft size={16} className="text-green-400" />;
      case 'withdrawal':
        return <ArrowUpRight size={16} className="text-red-400" />;
      case 'trade':
        return <TrendingUp size={16} className="text-blue-400" />;
      case 'robot_profit':
        return <TrendingUp size={16} className="text-purple-400" />;
      case 'binary_trade':
        return <TrendingUp size={16} className="text-orange-400" />;
      case 'stake':
        return <Layers size={16} className="text-indigo-400" />;
      case 'staking_profit':
        return <TrendingUp size={16} className="text-green-400" />;
      case 'staking_return':
        return <ArrowDownLeft size={16} className="text-blue-400" />;
      default:
        return <DollarSign size={16} className="text-slate-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-400';
      case 'pending':
        return 'text-yellow-400';
      case 'failed':
        return 'text-red-400';
      default:
        return 'text-slate-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={14} className="text-green-400" />;
      case 'pending':
        return <Clock size={14} className="text-yellow-400" />;
      case 'failed':
        return <AlertTriangle size={14} className="text-red-400" />;
      default:
        return <Clock size={14} className="text-slate-400" />;
    }
  };

  return (
    <div className="min-h-screen app-page-bg text-white">
      {/* Message Display */}
      {message && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-lg border ${
          message.type === 'success' 
            ? 'bg-green-500/10 border-green-500/30 text-green-400' 
            : message.type === 'error'
            ? 'bg-red-500/10 border-red-500/30 text-red-400'
            : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
        }`}>
          <div className="flex items-center gap-2">
            {message.type === 'success' && <CheckCircle size={18} />}
            {message.type === 'error' && <AlertTriangle size={18} />}
            {message.type === 'warning' && <AlertTriangle size={18} />}
            <span className="font-medium">{message.text}</span>
          </div>
        </div>
      )}

      {walletBreakdownData.error && (
        <div className="mx-4 mt-4 flex items-center justify-between gap-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300 sm:mx-6 lg:mx-8">
          <span>{walletBreakdownData.error}. Values are not estimated.</span>
          <button onClick={() => void walletBreakdownData.refreshBreakdown()} className="shrink-0 font-medium text-amber-200 hover:text-white">Retry</button>
        </div>
      )}

      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-5 flex flex-col items-stretch gap-4 border-b border-white/[0.08] pb-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/15">
              <Wallet size={21} className="text-violet-200" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">
                {t('wallet.title')}
              </h1>
              <p className="mt-0.5 text-sm text-slate-400">
                {t('wallet.subtitle')}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 md:shrink-0">
            <button
              onClick={() => navigate('/trading-fees')}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/[0.07] hover:text-white md:flex-none"
            >
              <Info size={18} />
              <span className="text-sm">Trading Fees</span>
            </button>

            <button
              onClick={() => setShowBalance(!showBalance)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/[0.07] hover:text-white md:flex-none"
            >
              {showBalance ? <Eye size={18} /> : <EyeOff size={18} />}
              <span className="text-sm">{showBalance ? 'Hide' : 'Show'} Balance</span>
            </button>
          </div>
        </div>

        {/* Portfolio Overview */}
        <div className="mb-5 grid items-start gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
          {/* Total Portfolio Value */}
          <div className="app-surface-primary rounded-xl p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-300">Total Portfolio Value</h2>
              <div className="flex items-center gap-2">
                {portfolioChange24h >= 0 ? (
                  <TrendingUp size={18} className="text-green-400" />
                ) : (
                  <TrendingDown size={18} className="text-red-400" />
                )}
                <span className={`text-sm font-medium ${portfolioChange24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {showBalance ? `${portfolioChange24h >= 0 ? '+' : ''}${formatCurrency(portfolioChange24h)}` : '••••••'}
                </span>
              </div>
            </div>
            
            <div className="mb-5">
              <div className="mb-1 font-mono text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {showBalance ? formatCurrency(walletBreakdownData?.totalBalance || 0) : '••••••'}
              </div>
              <div className="text-slate-400 text-sm">
                Available Balance: {showBalance ? formatCurrency(walletBreakdownData?.availableBalance || 0) : '••••••'}
              </div>
            </div>

            {/* Asset Breakdown */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="app-surface-muted min-w-0 rounded-xl border border-white/[0.06] p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                    <span className="text-xs font-bold text-white">€</span>
                  </div>
                  <span className="text-slate-300 font-medium">EUR</span>
                </div>
                <div className="text-xl font-bold text-white">
                  {showBalance ? formatFiat(usdtBalance) : '••••••'}
                </div>
                <div className="text-slate-400 text-sm">
                  {showBalance ? `Spendable cash: ${formatCurrency(walletBreakdownData.fiatAvailableBalance)}` : '••••••'}
                </div>
                <div className="flex flex-col md:flex-row gap-3 mt-4">
                  <button
                    onClick={() => { setFiatCurrency('EUR'); setDepositMethod('bank_transfer'); setActiveTab('deposit'); }}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 md:gap-2 md:text-sm"
                  >
                    <ArrowDownLeft size={16} />
                    Deposit
                  </button>
                  <button 
                    onClick={() => { setFiatCurrency('EUR'); setShowBankWithdrawalModal(true); }}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/20 md:gap-2 md:text-sm">
                      <ArrowUpRight size={16} />
                      Withdraw
                    </button>
                </div>
              </div>

              <div className="app-surface-muted min-w-0 rounded-xl border border-white/[0.06] p-4">
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500"><DollarSign size={18} className="text-white" /></div>
                  <span className="font-medium text-slate-300">USD</span>
                </div>
                <div className="text-xl font-bold text-white">
                  {showBalance ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(usdBalance) : '••••••'}
                </div>
                <div className="text-sm text-slate-400">
                  {showBalance ? `Spendable cash: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(walletBreakdownData.usdAvailableBalance)}` : '••••••'}
                </div>
                <div className="mt-4 flex flex-col gap-3 md:flex-row">
                  <button onClick={() => { setFiatCurrency('USD'); setDepositMethod('bank_transfer'); setActiveTab('deposit'); }} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"><ArrowDownLeft size={16} />Deposit</button>
                  <button onClick={() => { setFiatCurrency('USD'); setShowBankWithdrawalModal(true); }} className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/20"><ArrowUpRight size={16} />Withdraw</button>
                </div>
              </div>

              <div className="app-surface-muted min-w-0 rounded-xl border border-white/[0.06] p-4">
                <div className="flex items-center gap-3 mb-2">
                  <Bitcoin size={20} className="text-orange-400" />
                  <span className="text-slate-300 font-medium">BTC</span>
                </div>
                <div className="text-xl font-bold text-white">
                  {showBalance ? formatCrypto(btcBalance, 'BTC') : '••••••'}
                </div>
                <div className="text-slate-400 text-sm">
                  {showBalance ? formatCurrency(btcBalance * actualBtcPrice) : '••••••'}
                </div>
                <div className="flex flex-col md:flex-row gap-3 mt-4">
                  <button
                    onClick={() => { setDepositMethod('btc_direct'); setActiveTab('deposit'); }}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 md:gap-2 md:text-sm"
                  >
                    <ArrowDownLeft size={16} />
                    Deposit
                  </button>
                  <button 
                    onClick={() => setShowCryptoWithdrawalModal(true)}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/20 md:gap-2 md:text-sm">
                      <ArrowUpRight size={16} />
                      Withdraw
                    </button>
                </div>
              </div>
            </div>
          </div>

          {/* Wallet Breakdown */}
          <div>
            {walletBreakdownData && !walletBreakdownData.loading ? (
              <WalletBreakdownCard
                totalBalance={walletBreakdownData.totalBalance}
                usedMargin={walletBreakdownData.usedMargin}
                futuresUsedMargin={walletBreakdownData.futuresUsedMargin}
                futuresOrdersReserved={walletBreakdownData.futuresOrdersReserved}
                unrealizedPnl={walletBreakdownData.unrealizedPnl}
                availableBalance={walletBreakdownData.availableBalance}
                robotAllocatedBalance={walletBreakdownData.robotAllocatedBalance}
                stakedAmount={walletBreakdownData.stakedAmount}
                loading={walletBreakdownData.loading}
                showBalance={showBalance}
              />
            ) : (
              <div className="app-surface-primary rounded-2xl p-6">
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
            )}

          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-white/[0.1]" aria-label="Wallet sections">
          {[
            { id: 'overview', label: 'Overview', icon: Wallet },
            { id: 'deposit', label: 'Deposit', icon: ArrowDownLeft },
            { id: 'transactions', label: 'Transactions', icon: Clock },
            { id: 'staking', label: 'Staking', icon: Layers },
            { id: 'holdings', label: 'Holdings', icon: TrendingUp },
            { id: 'pnl', label: 'PnL Statement', icon: BarChart3 }
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              aria-current={activeTab === id ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                activeTab === id
                  ? 'border-violet-400 text-white'
                  : 'border-transparent text-slate-400 hover:border-white/[0.18] hover:text-white'
              }`}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,1fr)]">
            {/* Recent Transactions */}
            <div className="app-surface-primary rounded-xl p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-white">Recent Transactions</h3>
                <button
                  onClick={() => setActiveTab('transactions')}
                  className="text-blue-400 hover:text-blue-300 text-sm font-medium flex items-center gap-1"
                >
                  View All
                  <ArrowRight size={14} />
                </button>
              </div>
              
              <div className="space-y-3">
                {transactions.slice(0, 5).map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl border border-slate-700/50">
                    <div className="flex items-center gap-3">
                      {getTransactionIcon(transaction.type)}
                      <div>
                        <div className="text-white font-medium text-sm">
                          {transaction.description}
                        </div>
                        <div className="text-slate-400 text-xs">
                          {formatDate(transaction.created_at)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-medium text-sm ${
                        isPositiveTransaction(transaction.type)
                          ? 'text-green-400' 
                          : transaction.type === 'withdrawal'
                          ? 'text-red-400'
                          : 'text-white'
                      }`}>
                        {showBalance ? `${isPositiveTransaction(transaction.type) ? '+' : ''}${formatTransactionAmount(transaction)}` : '••••••'}
                      </div>
                      <div className="flex items-center gap-1">
                        {getStatusIcon(transaction.status)}
                        <span className={`text-xs ${getStatusColor(transaction.status)}`}>
                          {transaction.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                
                {transactions.length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    <Clock size={48} className="mx-auto mb-4 opacity-50" />
                    <p>No transactions yet</p>
                  </div>
                )}
              </div>
            </div>

            {/* Portfolio Performance */}
            <div className="app-surface-primary rounded-xl p-5 sm:p-6">
              <h3 className="mb-5 text-lg font-semibold text-white">Portfolio Performance</h3>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 app-surface-muted rounded-xl">
                  <span className="text-slate-300">Total Value</span>
                  <span className="text-white font-bold">
                    {showBalance ? formatCurrency(walletBreakdownData?.totalBalance || 0) : '••••••'}
                  </span>
                </div>
                
                <div className="flex justify-between items-center p-4 app-surface-muted rounded-xl">
                  <span className="text-slate-300">Available Balance</span>
                  <span className="text-white font-bold">
                    {showBalance ? formatCurrency(walletBreakdownData?.availableBalance || 0) : '••••••'}
                  </span>
                </div>
                
                <div className="flex justify-between items-center p-4 app-surface-muted rounded-xl">
                  <span className="text-slate-300">Staked Assets</span>
                  <span className="text-white font-bold">
                    {showBalance ? formatCurrency(walletBreakdownData.stakedAmount) : '••••••'}
                  </span>
                </div>
                
                <div className="flex justify-between items-center p-4 app-surface-muted rounded-xl">
                  <span className="text-slate-300">Staking Earnings</span>
                  <span className="text-green-400 font-bold">
                    {showBalance ? `+${formatCurrency(totalStakingEarnings)}` : '••••••'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'deposit' && (
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
            <div className="min-w-0">
              <div className="app-surface-primary rounded-xl p-5 sm:p-6">
                <div className="mb-5 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-green-500 to-green-600 rounded-lg flex items-center justify-center shadow-lg shadow-green-500/25">
                    <ArrowDownLeft size={20} className="text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white">Deposit Funds</h3>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-white">
                    <Euro size={18} className="text-emerald-400" />
                    <span className="font-medium">Deposit value is entered in Euro (EUR)</span>
                  </div>

                  {/* Deposit Method Selector */}
                  <div className="mb-6">
                    <label className="block text-slate-400 text-sm mb-3">Select Deposit Method</label>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        onClick={() => setDepositMethod('btc_direct')}
                        className={`py-3 px-4 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-2 ${
                          depositMethod === 'btc_direct'
                            ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/25 transform scale-105'
                            : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/50 hover:text-white border border-slate-600/30'
                        }`}
                      >
                        <Bitcoin size={18} className={depositMethod === 'btc_direct' ? 'text-white' : 'text-orange-400'} />
                        Pay with BTC
                      </button>
                      <button
                        onClick={() => setDepositMethod('nowpayments')}
                        className={`py-3 px-4 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-2 ${
                          depositMethod === 'nowpayments'
                            ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25 transform scale-105'
                            : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/50 hover:text-white border border-slate-600/30'
                        }`}
                      >
                        <Card size={18} className={depositMethod === 'nowpayments' ? 'text-white' : 'text-slate-400'} />
                        Crypto
                      </button>
                      <button
                        onClick={() => setDepositMethod('bank_transfer')}
                        className={`py-3 px-4 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-2 ${
                          depositMethod === 'bank_transfer'
                            ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg shadow-green-500/25 transform scale-105'
                            : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/50 hover:text-white border border-slate-600/30'
                        }`}
                      >
                        <Banknote size={18} className={depositMethod === 'bank_transfer' ? 'text-white' : 'text-slate-400'} />
                        Bank
                      </button>
                    </div>
                  </div>

                  {depositMethod === 'btc_direct' ? (
                    userId ? (
                      <NowPaymentsDeposit
                        userId={userId}
                        fixedPayCurrency="BTC"
                        buttonLabel="Get BTC Deposit Address"
                        onSuccess={() => {
                          setMessage({ type: 'success', text: 'Crypto payment credited to your EUR balance.' });
                        }}
                      />
                    ) : (
                      <div className="text-center py-8 text-slate-500">
                        <p>Loading user information...</p>
                      </div>
                    )
                  ) : depositMethod === 'nowpayments' ? (
                    userId ? (
                      <NowPaymentsDeposit
                        userId={userId}
                        onSuccess={() => {
                          setDepositMethod('bank_transfer');
                        }}
                      />
                    ) : (
                      <div className="text-center py-8 text-slate-500">
                        <p>Loading user information...</p>
                      </div>
                    )
                  ) : (
                    <div className="space-y-6">
                      <div className="app-surface-muted rounded-xl p-6">
                        <h3 className="text-lg font-semibold text-white mb-4">Bank Transfer Details</h3>
                        {loadingBankDetails ? (
                          <div className="text-center py-8 text-slate-500">
                            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                            Loading bank details...
                          </div>
                        ) : error ? (
                          <div className="text-center py-8 text-red-400">
                            <AlertTriangle size={24} className="mx-auto mb-2" />
                            {error}
                          </div>
                        ) : bankDetails ? (
                          <div className="space-y-3">
                            <div>
                              <div className="text-sm text-slate-400">Bank Name</div>
                              <div className="text-white font-medium">{bankDetails.bank_name || 'Not Yet Available'}</div>
                            </div>
                            <div>
                              <div className="text-sm text-slate-400">Account Number</div>
                              <div className="text-white font-medium">{bankDetails.account_number || 'Not Yet Available'}</div>
                            </div>
                            <div>
                              <div className="text-sm text-slate-400">Routing Number</div>
                              <div className="text-white font-medium">{bankDetails.routing_number || 'Not Yet Available'}</div>
                            </div>
                            <div>
                              <div className="text-sm text-slate-400">SWIFT/BIC Code</div>
                              <div className="text-white font-medium">{bankDetails.swift_code || 'Not Yet Available'}</div>
                            </div>
                            <div>
                              <div className="text-sm text-slate-400">Beneficiary Name</div>
                              <div className="text-white font-medium">{bankDetails.beneficiary_name || 'Not Yet Available'}</div>
                            </div>
                            <div>
                              <div className="text-sm text-slate-400">IBAN</div>
                              <div className="break-all text-white font-medium">{bankDetails.iban || 'Not Yet Available'}</div>
                            </div>
                            <div>
                              <div className="text-sm text-slate-400">Currency</div>
                              <div className="text-white font-medium">{fiatCurrency}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-8 text-slate-500">
                            <Banknote size={48} className="mx-auto mb-4 opacity-50" />
                            <p className="mb-2">Bank transfer details are not yet available for your account.</p>
                            <p className="text-sm">Please contact support for assistance.</p>
                          </div>
                        )}
                      </div>

                      <ManualDepositRequest
                        key={fiatCurrency}
                        defaultCurrency={fiatCurrency}
                        onSubmitted={() => setMessage({
                          type: 'success',
                          text: `${fiatCurrency} bank deposit request submitted for CRM review.`,
                        })}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Info Section */}
            <div className="app-surface-primary rounded-xl p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <Info size={20} className="text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">About Deposits</h3>
                  <p className="text-slate-300 text-sm mb-4">
                    All deposits are processed securely. For bank transfers, please ensure the beneficiary name matches your registered account name to avoid delays.
                  </p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="app-surface-muted rounded-lg p-3">
                      <div className="text-slate-400 mb-1">Processing Time</div>
                      <ul className="text-slate-300 space-y-1">
                        <li>• Crypto: Instant (after confirmations)</li>
                        <li>• Bank Transfer: 1-3 business days</li>
                      </ul>
                    </div>
                    <div className="app-surface-muted rounded-lg p-3">
                      <div className="text-slate-400 mb-1">Fees</div>
                      <ul className="text-slate-300 space-y-1">
                        <li>• Crypto: Network fees apply</li>
                        <li>• Bank Transfer: No platform fees</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="app-surface-primary rounded-xl p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/25">
                <Clock size={20} className="text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white">Transaction History</h3>
            </div>

            <div className="space-y-3">
              {transactions.map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between p-4 app-surface-muted rounded-xl hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-center gap-4">
                    {getTransactionIcon(transaction.type)}
                    <div>
                      <div className="text-white font-medium">
                        {transaction.description}
                      </div>
                      <div className="text-slate-400 text-sm">
                        {new Date(transaction.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${
                      isPositiveTransaction(transaction.type)
                        ? 'text-green-400' 
                        : transaction.type === 'withdrawal'
                        ? 'text-red-400'
                        : 'text-white'
                    }`}>
                      {showBalance ? `${isPositiveTransaction(transaction.type) ? '+' : ''}${formatTransactionAmount(transaction)}` : '••••••'}
                    </div>
                    <div className="flex items-center gap-1">
                      {getStatusIcon(transaction.status)}
                      <span className={`text-sm ${getStatusColor(transaction.status)}`}>
                        {transaction.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              
              {transactions.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  <Clock size={64} className="mx-auto mb-4 opacity-50" />
                  <h4 className="text-xl font-medium mb-2">No transactions yet</h4>
                  <p>Your transaction history will appear here</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'staking' && (
          <div className="space-y-8">
            <div className="app-surface-primary rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-purple-500/25">
                  <Layers size={20} className="text-white" />
                </div>
                <h3 className="text-xl font-semibold text-white">Active Stakes</h3>
              </div>

              <div className="space-y-4">
                {userStakes.filter(stake => stake.status === 'active').map((stake) => {
                  const currentEarnings = calculateCurrentEarnings(stake);
                  const progress = ((Date.now() - new Date(stake.start_date).getTime()) / (new Date(stake.end_date).getTime() - new Date(stake.start_date).getTime())) * 100;
                  
                  return (
                    <div key={stake.id} className="app-surface-muted rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {stake.asset_symbol === 'BTC' ? (
                            <Bitcoin size={20} className="text-orange-400" />
                          ) : (
                            <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                              <Euro size={13} className="text-white" />
                            </div>
                          )}
                          <span className="text-white font-medium">{stake.asset_symbol === 'USDT' ? 'EUR' : stake.asset_symbol}</span>
                        </div>
                        <span className="text-green-400 font-bold text-sm">
                          {stake.apy_rate}% APY
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                          <div className="text-slate-400 text-xs">Staked Amount</div>
                          <div className="text-white font-medium">
                            {showBalance ? (stake.asset_symbol === 'USDT' ? formatFiat(Number(stake.staked_amount)) : formatCrypto(Number(stake.staked_amount), stake.asset_symbol)) : '••••••'}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-400 text-xs">Current Earnings</div>
                          <div className="text-green-400 font-medium">
                            {showBalance ? `+${stake.asset_symbol === 'USDT' ? formatFiat(currentEarnings) : formatCrypto(currentEarnings, stake.asset_symbol)}` : '••••••'}
                          </div>
                        </div>
                      </div>
                      
                      <div className="mb-3">
                        <div className="flex justify-between text-xs text-slate-400 mb-1">
                          <span>Progress</span>
                          <span>{Math.min(progress, 100).toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-slate-700 rounded-full h-2">
                          <div 
                            className="bg-gradient-to-r from-purple-500 to-purple-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(progress, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center text-xs text-slate-400">
                        <span>End Date: {new Date(stake.end_date).toLocaleDateString()}</span>
                        <span className="font-medium text-slate-500">Locked until maturity</span>
                      </div>
                    </div>
                  );
                })}
                
                {userStakes.filter(stake => stake.status === 'active').length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    <Layers size={48} className="mx-auto mb-4 opacity-50" />
                    <p>No active stakes</p>
                    <p className="text-sm">Start staking to earn passive income</p>
                  </div>
                )}
              </div>
            </div>

            {/* Staking Summary */}
            <div className="app-surface-primary rounded-2xl p-6">
              <h3 className="text-xl font-semibold text-white mb-6">Staking Summary</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="app-surface-muted rounded-xl p-4">
                  <div className="text-slate-400 text-sm mb-1">Total Staked Value</div>
                  <div className="text-2xl font-bold text-white">
                    {showBalance ? formatCurrency(totalStakedValue) : '••••••'}
                  </div>
                </div>
                
                <div className="app-surface-muted rounded-xl p-4">
                  <div className="text-slate-400 text-sm mb-1">Total Earnings</div>
                  <div className="text-2xl font-bold text-green-400">
                    {showBalance ? `+${formatCurrency(totalStakingEarnings)}` : '••••••'}
                  </div>
                </div>
                
                <div className="app-surface-muted rounded-xl p-4">
                  <div className="text-slate-400 text-sm mb-1">Active Stakes</div>
                  <div className="text-2xl font-bold text-white">
                    {userStakes.filter(stake => stake.status === 'active').length}
                  </div>
                </div>
              </div>
              
              <button
                onClick={() => setTradingMode && setTradingMode('staking')}
                className="w-full mt-6 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white py-3 rounded-xl font-medium transition-all duration-300 shadow-lg shadow-purple-500/25"
              >
                Start New Stake
              </button>
            </div>
          </div>
        )}

        {activeTab === 'holdings' && (
          <CryptoHoldings
            usdtBalance={usdtBalance}
            usdBalance={usdBalance}
            btcBalance={btcBalance}
            currentBtcPrice={actualBtcPrice}
            userAssets={userAssets}
          />
        )}

        {activeTab === 'pnl' && (
          <PnlStatement />
        )}
      </div>

      {/* Withdrawal Modal */}
      <BankWithdrawalModal 
        isOpen={showBankWithdrawalModal}
        onClose={() => setShowBankWithdrawalModal(false)}
        currency={fiatCurrency}
        availableBalance={fiatCurrency === 'EUR' ? convertUsdToEur(walletBreakdownData.fiatAvailableBalance) : walletBreakdownData.usdAvailableBalance}
        onWithdraw={handleBankWithdrawalSubmit} 
      />

      {/* Crypto Withdrawal Modal */}
      <CryptoWithdrawalModal
        isOpen={showCryptoWithdrawalModal}
        onClose={() => setShowCryptoWithdrawalModal(false)}
        btcBalance={walletBreakdownData.btcAvailableBalance}
        currentBtcPrice={actualBtcPrice}
        onWithdraw={handleCryptoWithdrawal}
      />
    </div>
  );
};

export default WalletPage;


