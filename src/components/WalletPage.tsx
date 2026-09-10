import { useWalletBreakdown } from '../hooks/useWalletBreakdown';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Landmark,
  BarChart3,
  Euro
} from 'lucide-react';
import NowPaymentsDeposit from './NowPaymentsDeposit';
import BankWithdrawalModal from './BankWithdrawalModal';
import CryptoWithdrawalModal from './CryptoWithdrawalModal';
import { Transaction } from '../App';
import CryptoHoldings from './CryptoHoldings';
import PnlStatement from './PnlStatement';
import { MarketData, DatabaseUserAsset } from '../hooks/useDatabase';
import { useDatabase } from '../hooks/useDatabase';
import { supabase } from '../lib/supabaseClient';
import WalletBreakdownCard from './WalletBreakdownCard';
import { useMarketData } from '../contexts/MarketDataContext';
import { useBybitData } from '../contexts/BybitDataContext';
import { useFiatCurrency } from '../hooks/useFiatCurrency';
import ManualDepositRequest from './ManualDepositRequest';

interface WalletBreakdown {
  totalBalance: number;
  usedMargin: number;
  unrealizedPnl: number;
  availableBalance: number;
  reserved: number;
}

interface WalletPageProps {
  usdtBalance: number;
  btcBalance: number;
  transactions: Transaction[];
  kycStatus: 'not_verified' | 'pending' | 'verified';
  setTradingMode?: (mode: string) => void;
  marketData: MarketData[];
  userAssets?: DatabaseUserAsset[];
  onWalletOperation?: (type: string, currency: string, amount: number) => Promise<void>;
  totalPortfolioValue: number;
  updateBalances?: (balances: any) => Promise<void>;
  addTransaction?: (transaction: any) => Promise<void>;
  setShowWithdrawalModal?: (show: boolean) => void;
  showWithdrawalModal?: boolean;
  walletBreakdown?: WalletBreakdown;
  currentBtcPrice?: number;
}

const WalletPage: React.FC<WalletPageProps> = ({
  usdtBalance,
  btcBalance,
  setTradingMode,
  marketData,
  userAssets = [],
  currentBtcPrice,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { userStakes, calculateCurrentEarnings, cancelUserStake, transactions } = useDatabase();
  const { marketData: contextMarketData, snapshotData, getSnapshotPriceBySymbol } = useMarketData();
  const { getPriceBySymbol: getBybitPrice } = useBybitData();
  const { convertEurToUsd, convertUsdToEur, eurUsdRate, formatEur, formatFiat } = useFiatCurrency();

  // Helper function to format date safely
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleDateString();
    } catch (error) {
      return 'N/A';
    }
  };
  // State for wallet operations
  const [activeTab, setActiveTab] = useState('overview');
  const [depositMethod, setDepositMethod] = useState<'bank_transfer' | 'nowpayments' | 'btc_direct'>('bank_transfer');
  const [depositAmount, setDepositAmount] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState<'USDT' | 'BTC'>('USDT');
  const [showBalance, setShowBalance] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [showBankWithdrawalModal, setShowBankWithdrawalModal] = useState(false);
  const [showCryptoWithdrawalModal, setShowCryptoWithdrawalModal] = useState(false);
  const [selectedCryptoForWithdrawal, setSelectedCryptoForWithdrawal] = useState<'USDT' | 'BTC'>('USDT');
  
  // Get the actual BTC price to use (moved here so it can be used in hooks)
  const actualBtcPrice = useMemo(() => {
    // Strategy 1: Try websocket data first (most real-time)
    const bybitPrice = getBybitPrice('BTCUSDT');
    if (bybitPrice > 0) {
      return bybitPrice;
    }

    // Strategy 2: Try snapshot data (stable fallback)
    const snapshotPrice = getSnapshotPriceBySymbol('BTCUSDT');
    if (snapshotPrice > 0) {
      return snapshotPrice;
    }

    // Strategy 3: Try direct contextMarketData lookup
    const marketDataItem = contextMarketData.find(item => item.symbol === 'BTCUSDT');
    if (marketDataItem && marketDataItem.price > 0) {
      return marketDataItem.price;
    }

    // Strategy 4: Try snapshotData direct lookup
    const snapshotItem = snapshotData.find(item => item.symbol === 'BTCUSDT');
    if (snapshotItem && snapshotItem.price > 0) {
      return snapshotItem.price;
    }

    // Strategy 5: Try prop marketData
    const propMarketDataItem = marketData.find(item => item.symbol === 'BTCUSDT');
    if (propMarketDataItem && propMarketDataItem.price > 0) {
      return propMarketDataItem.price;
    }

    // Strategy 6: Use prop as final fallback
    if (currentBtcPrice && currentBtcPrice > 0) {
      return currentBtcPrice;
    }

    return 0;
  }, [getBybitPrice, getSnapshotPriceBySymbol, contextMarketData, snapshotData, marketData, currentBtcPrice]);

  const wsGetPrice = useCallback((symbol: string): number => {
    const bybitPrice = getBybitPrice(symbol);
    if (bybitPrice > 0) return bybitPrice;
    const snapshotPrice = getSnapshotPriceBySymbol(symbol);
    if (snapshotPrice > 0) return snapshotPrice;
    const md = contextMarketData.find(item => item.symbol === symbol);
    return md?.price || 0;
  }, [getBybitPrice, getSnapshotPriceBySymbol, contextMarketData]);

  const walletBreakdownData = useWalletBreakdown(
    usdtBalance,
    btcBalance,
    actualBtcPrice,
    wsGetPrice
  );
  
  // State for bank transfer details
  const [bankDetails, setBankDetails] = useState<any>(null);
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
    } catch (err: any) {
      setError(err.message || 'Failed to load bank details.');
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

  // Handle crypto withdrawal button click
  const handleCryptoWithdrawalClick = (currency: 'USDT' | 'BTC') => {
    setSelectedCryptoForWithdrawal(currency);
    setShowCryptoWithdrawalModal(true);
  };

  // Handle withdrawal submission
  const handleBankWithdrawalSubmit = async (amount: number, bankDetails: {
    bankName: string;
    accountNumber: string;
    routingNumber: string;
    beneficiaryName: string;
  }): Promise<boolean> => {
    try {
      const ledgerAmount = convertEurToUsd(amount);
      // Create transaction with withdrawal details using direct Supabase insert
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error: transactionError } = await supabase
        .from('transactions')
        .insert([{
          user_id: user.id,
          type: 'withdrawal',
          amount: -ledgerAmount,
          description: `Bank withdrawal of ${formatEur(amount)} via ${bankDetails.bankName} (Acc: ••••${bankDetails.accountNumber.slice(-4)})`,
          status: 'pending',
          withdrawal_details: {
            currency: 'EUR',
            amount,
            source_amount_usd: ledgerAmount,
            payout_currency: 'EUR',
            estimated_payout_eur: amount * 0.995,
            eur_usd_rate: eurUsdRate || null,
            bank_name: bankDetails.bankName,
            account_number: bankDetails.accountNumber,
            routing_number: bankDetails.routingNumber,
            beneficiary_name: bankDetails.beneficiaryName,
            withdrawal_type: 'bank',
            created_at: new Date().toISOString()
          }
        }]);

      if (transactionError) {
        throw new Error(`Failed to create withdrawal transaction: ${transactionError.message}`);
      }
      
      // Set success message
      setMessage({ type: 'success', text: 'Bank withdrawal initiated successfully' });
      
      // Close modal after successful withdrawal
      setShowBankWithdrawalModal(false);
      return true;
    } catch (error) {
      console.error('Error processing bank withdrawal:', error);
      setMessage({ type: 'error', text: 'Withdrawal failed. Please try again.' });
      return false;
    }
  };

  // Handle crypto withdrawal
  const handleCryptoWithdrawal = async (currency: 'USDT' | 'BTC', amount: number, address: string, network: string): Promise<boolean> => {
    try {
      // Check available balance for withdrawal
      const withdrawalValueUSD = currency === 'USDT' ? amount : amount * actualBtcPrice;

      if (walletBreakdownData && withdrawalValueUSD > walletBreakdownData.availableBalance) {
        throw new Error(`Insufficient available balance. Required: ${formatFiat(withdrawalValueUSD)}, Available: ${formatFiat(walletBreakdownData.availableBalance)}`);
      }
      
      // Create transaction with withdrawal details using direct Supabase insert
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error: transactionError } = await supabase
        .from('transactions')
        .insert([{
          user_id: user.id,
          type: 'withdrawal',
          amount: -amount,
          description: `${currency} withdrawal of ${amount} ${currency} to ${address.substring(0, 8)}...${address.substring(address.length - 8)}`,
          status: 'pending',
          withdrawal_details: {
            currency: currency,
            amount: amount,
            recipient_address: address,
            network: network,
            withdrawal_type: 'crypto',
            created_at: new Date().toISOString()
          }
        }]);

      if (transactionError) {
        throw new Error(`Failed to create withdrawal transaction: ${transactionError.message}`);
      }
      
      // Set success message
      setMessage({ type: 'success', text: 'Crypto withdrawal initiated successfully' });
      
      // Close modal after successful withdrawal
      setShowCryptoWithdrawalModal(false);
      return true;
    } catch (error) {
      console.error('Error processing crypto withdrawal:', error);
      setMessage({ type: 'error', text: 'Withdrawal failed. Please try again.' });
      return false;
    }
  };

  const totalStakedValue = userStakes.reduce((total, stake) => {
    if (stake.status !== 'active') return total;
    
    const stakedValue = stake.asset_symbol === 'USDT' 
      ? parseFloat(stake.staked_amount.toString())
      : parseFloat(stake.staked_amount.toString()) * (marketData.find(m => m.symbol === 'BTCUSDT')?.price || 0);
    
    return total + stakedValue;
  }, 0);

  // Calculate total earnings from staking
  const totalStakingEarnings = userStakes.reduce((total, stake) => {
    const earnings = calculateCurrentEarnings(stake);
    return total + earnings;
  }, 0);

  // Calculate 24h change
  const btc24hChange = marketData.find(m => m.symbol === 'BTCUSDT')?.change_24h || 0;
  const portfolioChange24h = (btcBalance * actualBtcPrice * (btc24hChange / 100));
  
  // Handle stake cancellation
  const handleCancelStake = async (stakeId: string) => {
    try {
      await cancelUserStake(stakeId);
    } catch (error) {
      console.error('Error cancelling stake:', error);
    }
  };

  const formatCurrency = formatFiat;

  const formatTransactionAmount = (transaction: { amount: number; currency?: string }) => {
    const transactionAmount = Number(transaction.amount);
    return transaction.currency?.toUpperCase() === 'EUR'
      ? formatEur(transactionAmount)
      : formatFiat(transactionAmount);
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

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
              <Wallet size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
                {t('wallet.title')}
              </h1>
              <p className="text-slate-400">
                {t('wallet.subtitle')}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/trading-fees')}
              className="flex items-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 px-4 py-2 rounded-xl transition-colors border border-blue-500/30 text-blue-400 hover:text-blue-300"
            >
              <Info size={18} />
              <span className="text-sm">Trading Fees</span>
            </button>

            <button
              onClick={() => setShowBalance(!showBalance)}
              className="flex items-center gap-2 bg-slate-800/50 hover:bg-slate-700/50 px-4 py-2 rounded-xl transition-colors border border-slate-700/50"
            >
              {showBalance ? <Eye size={18} /> : <EyeOff size={18} />}
              <span className="text-sm">{showBalance ? 'Hide' : 'Show'} Balance</span>
            </button>
          </div>
        </div>

        {/* Portfolio Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Total Portfolio Value */}
          <div className="lg:col-span-2 app-surface-primary rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-300">Total Portfolio Value</h3>
              <div className="flex items-center gap-2">
                {portfolioChange24h >= 0 ? (
                  <TrendingUp size={18} className="text-green-400" />
                ) : (
                  <TrendingDown size={18} className="text-red-400" />
                )}
                <span className={`text-sm font-medium ${portfolioChange24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {portfolioChange24h >= 0 ? '+' : ''}{formatCurrency(portfolioChange24h)}
                </span>
              </div>
            </div>
            
            <div className="mb-6">
              <div className="text-4xl font-bold text-white mb-2">
                {showBalance ? formatCurrency(walletBreakdownData?.totalBalance || 0) : '••••••'}
              </div>
              <div className="text-slate-400 text-sm">
                Available Balance: {showBalance ? formatCurrency(walletBreakdownData?.availableBalance || 0) : '••••••'}
              </div>
            </div>

            {/* Asset Breakdown */}
            <div className="grid grid-cols-2 gap-4">
              <div className="app-surface-muted rounded-xl p-4">
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
                  {showBalance ? formatCurrency(usdtBalance) : '••••••'}
                </div>
                <div className="flex flex-col md:flex-row gap-3 mt-4">
                  <button
                    onClick={() => setActiveTab('deposit')}
                    className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white px-3 py-2 rounded-lg text-xs md:text-sm font-medium transition-all duration-300 shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-1 md:gap-2"
                  >
                    <ArrowDownLeft size={16} />
                    Deposit
                  </button>
                  <button 
                    onClick={() => setShowBankWithdrawalModal(true)}
                    className="flex-1 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-3 py-2 rounded-lg text-xs md:text-sm font-medium transition-all duration-300 shadow-lg shadow-red-500/25 flex items-center justify-center gap-1 md:gap-2">
                      <ArrowUpRight size={16} />
                      Withdraw
                    </button>
                </div>
              </div>

              <div className="app-surface-muted rounded-xl p-4">
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
                    onClick={() => setActiveTab('deposit')}
                    className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white px-3 py-2 rounded-lg text-xs md:text-sm font-medium transition-all duration-300 shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-1 md:gap-2"
                  >
                    <ArrowDownLeft size={16} />
                    Deposit
                  </button>
                  <button 
                    onClick={() => handleCryptoWithdrawalClick('BTC')}
                    className="flex-1 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-3 py-2 rounded-lg text-xs md:text-sm font-medium transition-all duration-300 shadow-lg shadow-red-500/25 flex items-center justify-center gap-1 md:gap-2">
                      <ArrowUpRight size={16} />
                      Withdraw
                    </button>
                </div>
              </div>
            </div>
          </div>

          {/* Wallet Breakdown */}
          <div className="space-y-6">
            {walletBreakdownData && !walletBreakdownData.loading ? (
              <WalletBreakdownCard
                totalBalance={walletBreakdownData.totalBalance}
                usedMargin={walletBreakdownData.usedMargin}
                futuresUsedMargin={walletBreakdownData.futuresUsedMargin}
                propUsedMargin={walletBreakdownData.propUsedMargin}
                futuresOrdersReserved={walletBreakdownData.futuresOrdersReserved}
                propOrdersReserved={walletBreakdownData.propOrdersReserved}
                unrealizedPnl={walletBreakdownData.unrealizedPnl}
                availableBalance={walletBreakdownData.availableBalance}
                robotAllocatedBalance={walletBreakdownData.robotAllocatedBalance}
                stakedAmount={walletBreakdownData.stakedAmount}
                loading={walletBreakdownData.loading}
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

            {/* Quick Actions */}
            <div className="app-surface-primary rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-6">Quick Actions</h3>
              
              <div className="space-y-3">
                <button
                  onClick={() => setActiveTab('deposit')}
                  className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white py-3 px-4 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-green-500/25"
                >
                  <ArrowDownLeft size={18} />
                  Deposit
                </button>
                
                <button
                  onClick={() => setShowBankWithdrawalModal(true)}
                  className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white py-3 px-4 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-red-500/25"
                >
                  <Landmark size={16} />
                  Bank Withdrawal
                </button>
                
                <button
                  onClick={() => setTradingMode && setTradingMode('staking')}
                  className="w-full bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white py-3 px-4 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25"
                >
                  <Layers size={18} />
                  Staking
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 mb-8 bg-slate-800/50 p-2 rounded-2xl border border-slate-700/50">
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
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-300 ${
                activeTab === id
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/25'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Icon size={16} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Recent Transactions */}
            <div className="app-surface-primary rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-white">Recent Transactions</h3>
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
                        {isPositiveTransaction(transaction.type) ? '+' : ''}
                        {formatTransactionAmount(transaction)}
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
            <div className="app-surface-primary rounded-2xl p-6">
              <h3 className="text-xl font-semibold text-white mb-6">Portfolio Performance</h3>
              
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <div className="app-surface-primary rounded-2xl p-8">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 bg-gradient-to-r from-green-500 to-green-600 rounded-lg flex items-center justify-center shadow-lg shadow-green-500/25">
                    <ArrowDownLeft size={20} className="text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white">Deposit Funds</h3>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-slate-400 text-sm mb-3">
                      {depositMethod === 'bank_transfer' ? 'Fiat Currency' : 'Select Currency'}
                    </label>
                    <div className="flex gap-3">
                      {depositMethod === 'bank_transfer' ? (
                        <div className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-white">
                          <Euro size={18} className="text-emerald-400" />
                          <span className="font-medium">Euro (EUR)</span>
                        </div>
                      ) : (
                        <>
                      <button
                        onClick={() => setSelectedCurrency('USDT')}
                        className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-2 ${
                          selectedCurrency === 'USDT'
                            ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg shadow-green-500/25 transform scale-105'
                            : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/50 hover:text-white border border-slate-600/30'
                        }`}
                      >
                        <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                          <span className="text-xs font-bold text-white">$</span>
                        </div>
                        USDT
                      </button>
                      <button
                        onClick={() => setSelectedCurrency('BTC')}
                        className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-2 ${
                          selectedCurrency === 'BTC'
                            ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/25 transform scale-105'
                            : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/50 hover:text-white border border-slate-600/30'
                        }`}
                      >
                        <Bitcoin size={18} className="text-orange-400" />
                        BTC
                      </button>
                        </>
                      )}
                    </div>
                  </div>

                  {depositMethod !== 'bank_transfer' && <div>
                    <div className="flex justify-between text-sm text-slate-400 mb-2">
                      <span>Amount</span>
                      <span>Min: 10 {selectedCurrency}</span>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        placeholder={`Enter ${selectedCurrency} amount`}
                        className="w-full app-input text-white px-4 py-3 rounded-xl transition-all"
                      />
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 bg-slate-600/50 px-2 py-1 rounded text-sm text-slate-300">
                        {selectedCurrency}
                      </div>
                    </div>
                  </div>}

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
                        BTC Direct
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
                        initialAmount={depositAmount}
                        fixedPayCurrency="BTC"
                        buttonLabel="Get BTC Deposit Address"
                        onSuccess={() => {
                          setMessage({ type: 'success', text: 'BTC deposit credited to your account!' });
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
                              <div className="text-white font-medium">EUR</div>
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
                        onSubmitted={() => setMessage({
                          type: 'success',
                          text: 'EUR bank deposit request submitted for CRM review.',
                        })}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Info Section */}
            <div className="app-surface-primary rounded-2xl p-6">
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
          <div className="app-surface-primary rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-8">
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
                      {isPositiveTransaction(transaction.type) ? '+' : ''}
                      {formatTransactionAmount(transaction)}
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
                              <span className="text-xs font-bold text-white">$</span>
                            </div>
                          )}
                          <span className="text-white font-medium">{stake.asset_symbol}</span>
                        </div>
                        <span className="text-green-400 font-bold text-sm">
                          {stake.apy_rate}% APY
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                          <div className="text-slate-400 text-xs">Staked Amount</div>
                          <div className="text-white font-medium">
                            {formatCrypto(parseFloat(stake.staked_amount.toString()), stake.asset_symbol)}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-400 text-xs">Current Earnings</div>
                          <div className="text-green-400 font-medium">
                            +{formatCrypto(currentEarnings, stake.asset_symbol)}
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
                        <button
                          onClick={() => handleCancelStake(stake.id)}
                          className="text-red-400 hover:text-red-300 font-medium"
                        >
                          Cancel
                        </button>
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
        usdtBalance={walletBreakdownData?.availableBalance || 0}
        onWithdraw={handleBankWithdrawalSubmit} 
      />

      {/* Crypto Withdrawal Modal */}
      <CryptoWithdrawalModal
        isOpen={showCryptoWithdrawalModal}
        onClose={() => setShowCryptoWithdrawalModal(false)}
        usdtBalance={walletBreakdownData?.availableBalance || 0}
        btcBalance={btcBalance}
        currentBtcPrice={actualBtcPrice}
        initialCurrency={selectedCryptoForWithdrawal}
        onWithdraw={handleCryptoWithdrawal}
      />
    </div>
  );
};

export default WalletPage;


