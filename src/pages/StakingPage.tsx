import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMarketData } from '../contexts/MarketDataContext';
import { 
  Wallet, 
  Check,
  ChevronDown,
  Plus, 
  Minus, 
  ArrowUpRight, 
  ArrowDownLeft, 
  DollarSign, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  XCircle,
  CreditCard,
  Banknote,
  Bitcoin,
  Eye,
  EyeOff,
  Shield,
  Info,
  Layers,
  Calendar,
  Percent,
  Calculator,
  ArrowRight,
  Lock,
  X
} from 'lucide-react';
import { useDatabase } from '../hooks/useDatabase';

interface StakingPageProps {
  usdtBalance: number;
  btcBalance: number;
  currentBtcPrice: number;
  availableBalance?: number;
  refreshBalances?: () => Promise<void>;
  refreshBreakdown?: () => void;
}

interface StakingAsset {
  id: string;
  name: string;
  symbol: string;
  iconUrl: string;
  apy: number;
  minStake: number;
  lockPeriods: number[]; // in days
  totalStaked: number;
  balance?: number;
  price?: number;
}

interface StakingSelectOption {
  value: string;
  label: string;
}

interface StakingDropdownProps {
  value: string;
  options: StakingSelectOption[];
  onChange: (value: string) => void;
}

const StakingDropdown: React.FC<StakingDropdownProps> = ({
  value,
  options,
  onChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const selectedOption = options.find((option) => option.value === value) || options[0];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-600/50 bg-slate-900/80 bg-gradient-to-br from-blue-500/10 via-indigo-500/8 to-purple-500/12 px-4 py-3 text-left text-white transition-all hover:border-purple-500/40 hover:bg-blue-500/10 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
      >
        <span className="truncate">{selectedOption?.label || ''}</span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-purple-300 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-slate-700/50 bg-slate-950/95 bg-gradient-to-br from-blue-500/10 via-indigo-500/8 to-purple-500/12 shadow-2xl backdrop-blur-xl">
          <div className="max-h-64 overflow-y-auto py-2">
            {options.map((option) => {
              const isSelected = option.value === value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-white transition-all ${
                    isSelected
                      ? 'bg-gradient-to-r from-blue-500/18 to-purple-500/16'
                      : 'hover:bg-blue-500/10'
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && <Check size={16} className="shrink-0 text-purple-300" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const StakingPage: React.FC<StakingPageProps> = ({
  usdtBalance,
  btcBalance,
  currentBtcPrice,
  availableBalance,
  refreshBalances,
  refreshBreakdown
}) => {
  const { t } = useTranslation();
  const { isConnected: isRealtimeConnected } = useMarketData();
  const { userStakes, addUserStake, calculateCurrentEarnings, cancelUserStake, claimUserStake, fetchUserStakes, coingeckoMarketCapData } = useDatabase();
  const homeBackgroundClass = 'app-page-bg';
  const primaryCardBackgroundClass = 'app-surface-raised';
  const secondaryCardBackgroundClass = 'app-surface-primary';
  const itemCardBackgroundClass = 'app-surface-muted';
  const pillBackgroundClass = 'app-action-soft';
  const inputBackgroundClass = 'app-input';
  const softPanelBackgroundClass = 'app-surface-muted';
  const controlBackgroundClass = 'app-control';
  const bluePurpleBackgroundClass = 'app-action-primary';
  const bluePurpleHoverBackgroundClass = '';
  const fallbackIconBackgroundClass = 'app-icon-tile';
  
  // State for staking form
  const [stakingAmount, setStakingAmount] = useState('');
  const [stakingDuration, setStakingDuration] = useState(30);
  const [selectedAsset, setSelectedAsset] = useState<StakingAsset | null>(null);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  
  // State for staking operations
  const [isStaking, setIsStaking] = useState(false);
  const [stakingMessage, setStakingMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  
  // State for expanded asset details
  const [expandedAssetId, setExpandedAssetId] = useState<string | null>(null);
  
  // State for calculator
  const [calculatorAsset, setCalculatorAsset] = useState('btc-stake');
  const [calculatorAmount, setCalculatorAmount] = useState('1');
  const [calculatorDuration, setCalculatorDuration] = useState('30');
  const [claimingStakes, setClaimingStakes] = useState<Record<string, boolean>>({});
  const [calculatorResults, setCalculatorResults] = useState({
    estimatedEarnings: 0,
    estimatedEarningsUsd: 0,
    daily: 0,
    weekly: 0,
    monthly: 0,
    yearly: 0
  });

  // Helper function to render crypto icon with fallback
  const renderCryptoIcon = (currency: { symbol: string, iconUrl: string }) => {
    return (
      <div className={`relative w-10 h-10 rounded-full overflow-hidden ${fallbackIconBackgroundClass} flex items-center justify-center`}>
        <img 
          src={currency.iconUrl} 
          alt={currency.symbol}
          className="w-full h-full object-contain"
          onError={(e) => {
            // On error, replace with text icon
            e.currentTarget.style.display = 'none';
            e.currentTarget.nextElementSibling?.classList.remove('hidden');
          }}
        />
        <div className="absolute inset-0 hidden flex items-center justify-center text-white font-bold">
          {currency.symbol.substring(0, 2)}
        </div>
      </div>
    );
  };

  // Available staking assets
  const [availableStakingAssets, setAvailableStakingAssets] = useState<StakingAsset[]>([
    {
      id: 'btc-stake',
      name: 'Bitcoin',
      symbol: 'BTC',
      iconUrl: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
      apy: 5.5,
      minStake: 0.001,
      lockPeriods: [30, 60, 90, 180, 365],
      totalStaked: 1250.75,
      balance: btcBalance,
      price: currentBtcPrice
    },
    {
      id: 'usdt-stake',
      name: 'Tether',
      symbol: 'USDT',
      iconUrl: 'https://assets.coingecko.com/coins/images/325/large/Tether.png',
      apy: 12.0,
      minStake: 100,
      lockPeriods: [30, 60, 90, 180, 365],
      totalStaked: 5750000,
      balance: availableBalance || 0,
      price: 1
    },
    {
      id: 'eth-stake',
      name: 'Ethereum',
      symbol: 'ETH',
      iconUrl: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
      apy: 7.2,
      minStake: 0.01,
      lockPeriods: [30, 60, 90, 180, 365],
      totalStaked: 32500.5,
      balance: 0,
      price: 3500
    },
    {
      id: 'sol-stake',
      name: 'Solana',
      symbol: 'SOL',
      iconUrl: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
      apy: 9.8,
      minStake: 1,
      lockPeriods: [30, 60, 90, 180, 365],
      totalStaked: 185000,
      balance: 0,
      price: 150
    }
  ]);

  // Update icon URLs from CoinGecko data when available
  useEffect(() => {
    if (coingeckoMarketCapData && coingeckoMarketCapData.length > 0) {
      setAvailableStakingAssets(prev => 
        prev.map(asset => {
          const coinData = coingeckoMarketCapData.find(
            coin => coin.symbol.toLowerCase() === asset.symbol.toLowerCase()
          );
          
          if (coinData && coinData.image) {
            return { ...asset, iconUrl: coinData.image };
          }
          return asset;
        })
      );
    }
  }, [coingeckoMarketCapData]);

  // Fetch user stakes on mount
  useEffect(() => {
    fetchUserStakes();
  }, [fetchUserStakes]);

  // Update asset balances when they change
  useEffect(() => {
    setAvailableStakingAssets(prev => 
      prev.map(asset => {
        if (asset.symbol === 'BTC') {
          return { ...asset, balance: btcBalance, price: currentBtcPrice };
        } else if (asset.symbol === 'USDT') {
          return { ...asset, balance: availableBalance || usdtBalance, price: 1 };
        }
        return asset;
      })
    );
  }, [btcBalance, usdtBalance, currentBtcPrice, availableBalance]);

  // Clear staking message after 5 seconds
  useEffect(() => {
    if (stakingMessage) {
      const timer = setTimeout(() => {
        setStakingMessage(null);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [stakingMessage]);

  // Update calculator results when inputs change
  useEffect(() => {
    const updateCalculatorResults = () => {
      const asset = availableStakingAssets.find(a => a.id === calculatorAsset);
      if (!asset) return;

      const amount = parseFloat(calculatorAmount) || 0;
      const days = parseInt(calculatorDuration) || 30;
      const apy = asset.apy;

      // Calculate daily rate
      const dailyRate = apy / 365 / 100;
      
      // Calculate earnings
      const estimatedEarnings = amount * dailyRate * days;
      const estimatedEarningsUsd = estimatedEarnings * (asset.price || 0);
      
      // Calculate periodic earnings
      const daily = amount * dailyRate;
      const weekly = daily * 7;
      const monthly = daily * 30;
      const yearly = amount * (apy / 100);
      
      setCalculatorResults({
        estimatedEarnings,
        estimatedEarningsUsd,
        daily,
        weekly,
        monthly,
        yearly
      });
    };
    
    updateCalculatorResults();
  }, [calculatorAsset, calculatorAmount, calculatorDuration, availableStakingAssets]);

  // Calculate estimated return based on amount, duration, and APY
  const calculateEstimatedReturn = (amount: number, durationDays: number, apy: number) => {
    // Convert APY to daily rate
    const dailyRate = apy / 365 / 100;
    
    // Calculate interest for the staking period
    const interest = amount * dailyRate * durationDays;
    
    return interest;
  };

  // Handle stake button click
  const handleStakeClick = (asset: StakingAsset) => {
    setSelectedAsset(asset);
    setStakingAmount('');
    setStakingDuration(asset.lockPeriods[0]);
    setShowConfirmationModal(true);
  };

  // Check if user already has an active stake for the selected asset
  const hasActiveStakeForAsset = (assetSymbol: string) => {
    return userStakes.some(stake => 
      stake.asset_symbol === assetSymbol && 
      stake.status === 'active'
    );
  };

  // Confirm stake
  const confirmStake = async () => {
    if (!selectedAsset) return;
    
    const amount = parseFloat(stakingAmount);
    
    // Validate input
    if (isNaN(amount) || amount <= 0) {
      setStakingMessage({
        type: 'error',
        text: t('staking.enterValidAmount')
      });
      return;
    }
    
    // Check minimum stake
    if (amount < selectedAsset.minStake) {
      setStakingMessage({
        type: 'error',
        text: t('staking.minimumStakeAmount', { amount: selectedAsset.minStake, asset: selectedAsset.symbol })
      });
      return;
    }
    
    // Check available balance
    const stakingValueUSD = selectedAsset.symbol === 'USDT' ? amount : amount * currentBtcPrice;
    
    if (availableBalance !== undefined && stakingValueUSD > availableBalance) {
      setStakingMessage({
        type: 'error',
        text: t('staking.insufficientAvailableBalance', { 
          required: stakingValueUSD.toFixed(2), 
          available: availableBalance.toFixed(2) 
        })
      });
      return;
    }
    
    // Check balance
    const actualBalance = selectedAsset.symbol === 'USDT' && availableBalance !== undefined 
      ? Math.min(selectedAsset.balance || 0, availableBalance) 
      : selectedAsset.balance;
    
    if (actualBalance && amount > actualBalance) {
      setStakingMessage({
        type: 'error',
        text: t('staking.insufficientBalance', { asset: selectedAsset.symbol })
      });
      return;
    }
    
    // Check if user already has an active stake for this asset
    if (hasActiveStakeForAsset(selectedAsset.symbol)) {
      setStakingMessage({
        type: 'error',
        text: t('staking.alreadyHaveActiveStake', { asset: selectedAsset.symbol })
      });
      return;
    }
    
    setIsStaking(true);
    
    try {
      // Call the addUserStake function
      const success = await addUserStake(
        selectedAsset.symbol,
        amount,
        stakingDuration
      );
      
      if (success) {
        setStakingMessage({
          type: 'success',
          text: t('staking.stakingSuccessful', { 
            amount: amount, 
            asset: selectedAsset.symbol, 
            duration: stakingDuration 
          })
        });
        
        // Close modal and reset form
        setShowConfirmationModal(false);
        setStakingAmount('');
        setSelectedAsset(null);
        
        await Promise.all([
          fetchUserStakes(),
          refreshBalances?.()
        ]);
        refreshBreakdown?.();
      } else {
        throw new Error('Staking failed');
      }
    } catch (error: any) {
      setStakingMessage({
        type: 'error',
        text: error.message || t('staking.stakingFailed')
      });
    } finally {
      setIsStaking(false);
    }
  };

  // Handle max button click
  const handleMaxClick = () => {
    if (selectedAsset) {
      const actualBalance = selectedAsset.symbol === 'USDT' ? (availableBalance || usdtBalance) : selectedAsset.balance;
      
      if (actualBalance) {
        setStakingAmount(actualBalance.toString());
      }
    }
  };

  // Toggle asset details expansion
  const toggleAssetDetails = (assetId: string) => {
    if (expandedAssetId === assetId) {
      setExpandedAssetId(null);
    } else {
      setExpandedAssetId(assetId);
    }
  };

  // Calculate time remaining for a stake
  const calculateTimeRemaining = (endDate: string) => {
    const now = new Date();
    const end = new Date(endDate);
    const diff = end.getTime() - now.getTime();
    
    if (diff <= 0) return t('staking.completed');
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    return `${days}d ${hours}h ${t('staking.remaining')}`;
  };

  // Calculate progress percentage for a stake
  const calculateProgress = (startDate: string, endDate: string) => {
    const now = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const total = end.getTime() - start.getTime();
    const elapsed = now.getTime() - start.getTime();
    
    if (elapsed <= 0) return 0;
    if (elapsed >= total) return 100;
    
    return (elapsed / total) * 100;
  };

  // Get active stakes
  const activeStakes = userStakes.filter(stake => stake.status === 'active');
  
  // Get completed stakes that can be claimed
  const claimableStakes = userStakes.filter(stake => 
    stake.status === 'active' && new Date(stake.end_date) <= new Date()
  );
  
  // Get completed stakes
  const completedStakes = userStakes.filter(stake => stake.status === 'completed');

  const calculatorAssetOptions: StakingSelectOption[] = availableStakingAssets.map((asset) => ({
    value: asset.id,
    label: `${asset.name} (${asset.apy}% APY)`
  }));

  const calculatorDurationOptions: StakingSelectOption[] = ['30', '60', '90', '180', '365'].map((period) => ({
    value: period,
    label: `${period} ${t('staking.days')}`
  }));

  const stakingDurationOptions: StakingSelectOption[] = selectedAsset
    ? selectedAsset.lockPeriods.map((period) => ({
        value: period.toString(),
        label: `${period} ${t('staking.days')}`
      }))
    : [];

  return (
    <div className={`min-h-screen p-8 ${homeBackgroundClass}`}>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-red-400 bg-clip-text text-transparent mb-2">
            {t('staking.title')}
          </h1>
        </div>
        <p className="text-slate-400">
          {t('staking.subtitle')}
        </p>
      </div>

      {/* Status Messages */}
      {stakingMessage && (
        <div className={`mb-6 p-4 rounded-xl border flex items-center gap-3 ${
          stakingMessage.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {stakingMessage.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
          {stakingMessage.text}
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column - Available Staking Assets */}
        <div className="lg:col-span-2 space-y-8">
          {/* Available Staking Assets */}
          <div className={`${secondaryCardBackgroundClass} backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-2xl`}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 ${bluePurpleBackgroundClass} rounded-lg flex items-center justify-center shadow-lg shadow-purple-500/25`}>
                  <Layers size={20} className="text-white" />
                </div>
                <h2 className="text-xl font-semibold text-white">{t('staking.availableStakingAssets')}</h2>
              </div>
              <div className={`text-sm text-slate-400 ${pillBackgroundClass} px-3 py-1 rounded-full`}>
                {availableStakingAssets.length} {t('staking.assets')}
              </div>
            </div>
            
            <div className="space-y-4">
              {availableStakingAssets.map((asset) => {
                const hasActiveStake = hasActiveStakeForAsset(asset.symbol);
                
                return (
                  <div key={asset.id} className={`${itemCardBackgroundClass} rounded-xl border border-slate-700/50 overflow-hidden`}>
                    {/* Asset Header */}
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {renderCryptoIcon(asset)}
                        <div>
                          <div className="font-semibold text-white">{asset.name}</div>
                          <div className="text-sm text-slate-400">{asset.symbol}</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 md:gap-4 flex-1 justify-end">
                        <div className="text-right hidden sm:block">
                          <div className="text-xs md:text-sm text-slate-400">APY</div>
                          <div className="text-emerald-400 font-bold text-sm md:text-base">{asset.apy}%</div>
                        </div>
                        
                        <div className="text-right mr-2">
                          <div className="text-xs md:text-sm text-slate-400">{t('common.balance')}</div>
                          <div className="text-white font-medium text-sm md:text-base">
                            {(asset.symbol === 'USDT' 
                              ? (availableBalance !== undefined ? availableBalance : usdtBalance)
                              : asset.balance || 0
                            ).toFixed(asset.symbol === 'USDT' ? 2 : 6)} {asset.symbol}
                          </div>
                        </div>
                        
                        <button
                          onClick={() => toggleAssetDetails(asset.id)}
                          className={`w-8 h-8 ${controlBackgroundClass} rounded-lg flex items-center justify-center transition-colors flex-shrink-0`}
                        >
                          {expandedAssetId === asset.id ? (
                            <Minus size={18} className="text-slate-400" />
                          ) : (
                            <Plus size={18} className="text-slate-400" />
                          )}
                        </button>
                      </div>
                    </div>
                    
                    {/* Expanded Details */}
                    {expandedAssetId === asset.id && (
                      <div className={`p-4 border-t border-slate-700/50 ${softPanelBackgroundClass}`}>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                          <div>
                            <div className="text-sm text-slate-400 mb-1">{t('common.min')} Stake</div>
                            <div className="text-white font-medium">{asset.minStake} {asset.symbol}</div>
                          </div>
                          <div>
                            <div className="text-sm text-slate-400 mb-1">Total Staked</div>
                            <div className="text-white font-medium">{asset.totalStaked.toLocaleString()} {asset.symbol}</div>
                          </div>
                          <div>
                            <div className="text-sm text-slate-400 mb-1">{t('common.price')}</div>
                            <div className="text-white font-medium">${(asset.price || 0).toLocaleString()}</div>
                          </div>
                        </div>
                        
                        <div className="mb-4">
                          <div className="text-sm text-slate-400 mb-2">Available Lock Periods</div>
                          <div className="flex flex-wrap gap-2">
                            {asset.lockPeriods.map((period) => (
                              <div key={period} className={`px-3 py-1 ${softPanelBackgroundClass} rounded-lg text-sm text-slate-300 border border-slate-700/50`} translate="no">
                                {period} {t('staking.days')}
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        <div className="flex justify-end">
                          <button
                            onClick={() => handleStakeClick(asset)} 
                            disabled={!asset.balance || asset.balance < asset.minStake || hasActiveStake}
                            className={`${bluePurpleBackgroundClass} ${bluePurpleHoverBackgroundClass} disabled:from-slate-700 disabled:to-slate-800 text-white px-4 md:px-6 py-2 rounded-xl font-medium transition-all duration-300 shadow-lg shadow-purple-500/25 flex items-center gap-2 ${
                              hasActiveStake ? 'cursor-not-allowed opacity-70' : ''
                            }`}
                          >
                            <Layers size={16} />
                            {hasActiveStake ? t('staking.alreadyStaked') : `${t('staking.stake')} ${asset.symbol}`}
                          </button>
                        </div>
                        
                        {hasActiveStake && (
                          <div className="mt-3 text-xs text-amber-400 flex items-center gap-1">
                            <AlertTriangle size={12} />
                            <span>{t('staking.alreadyHaveActiveStake', { asset: asset.symbol })}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Active Stakes */}
          <div className={`${secondaryCardBackgroundClass} backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-2xl`}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-green-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/25">
                <TrendingUp size={20} className="text-white" />
              </div>
              <h2 className="text-xl font-semibold text-white">{t('staking.yourActiveStakes')}</h2>
            </div>
            
            {activeStakes.length > 0 ? (
              <div className="space-y-4">
                {activeStakes.map((stake) => {
                  const asset = availableStakingAssets.find(a => a.symbol === stake.asset_symbol);
                  const progress = calculateProgress(stake.start_date, stake.end_date);
                  const timeRemaining = calculateTimeRemaining(stake.end_date);
                  const currentEarnings = calculateCurrentEarnings(stake);
                  const isMatured = new Date(stake.end_date) <= new Date();
                  
                  return (
                    <div key={stake.id} className={`${itemCardBackgroundClass} rounded-xl p-4 border border-slate-700/50`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {asset ? renderCryptoIcon(asset) : (
                            <div className={`w-10 h-10 rounded-full ${fallbackIconBackgroundClass} flex items-center justify-center text-white font-bold`}>
                              {stake.asset_symbol.substring(0, 2)}
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-white">{asset?.name || stake.asset_symbol}</div>
                            <div className="text-xs text-slate-400" translate="no">{stake.staked_amount.toFixed(stake.asset_symbol === 'USDT' ? 2 : 6)} {stake.asset_symbol}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-emerald-400 font-bold">{stake.apy_rate}% APY</div>
                          <div className="text-xs text-slate-400">
                            {new Date(stake.end_date).toLocaleDateString()} {t('staking.endDate')}
                          </div>
                        </div>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="w-full h-2 bg-purple-950/60 rounded-full mb-2">
                        <div 
                          className="h-2 bg-gradient-to-r from-emerald-500 to-green-500 rounded-full"
                          style={{ width: `${progress}%` }}
                        ></div>
                      </div>
                      
                      <div className="flex justify-between text-xs text-slate-400 mb-3">
                        <div>{t('staking.started')}: {new Date(stake.start_date).toLocaleDateString()}</div>
                        <div>{t('staking.ends')}: {new Date(stake.end_date).toLocaleDateString()}</div>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="text-xs text-slate-400">{t('staking.earnedSoFar')}</div>
                          <div className="text-emerald-400 font-medium" translate="no">{currentEarnings.toFixed(6)} {stake.asset_symbol}</div>
                        </div>
                        {isMatured ? (
                          <button
                            onClick={() => claimUserStake(stake.id)}
                            disabled={claimingStakes[stake.id]}
                            className="bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 disabled:from-slate-700 disabled:to-slate-800 text-white px-4 py-2 rounded-lg font-medium transition-all duration-300 shadow-lg shadow-emerald-500/25 flex items-center gap-2"
                          >
                            {claimingStakes[stake.id] ? (
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                              <>
                                <CheckCircle size={16} />
                                {t('staking.claim')}
                              </>
                            )}
                          </button>
                        ) : (
                          <div className="text-sm">
                            <Clock size={14} className="text-slate-400 inline mr-1" />
                            <span className="text-slate-300">{timeRemaining}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <Layers size={48} className="mx-auto mb-4 opacity-50" />
                <p className="mb-2">{t('staking.noActiveStakes')}</p>
                <p className="text-sm text-slate-600">{t('staking.startStaking')}</p>
              </div>
            )}
          </div>
          
          {/* Completed Stakes */}
          {completedStakes.length > 0 && (
            <div className={`${secondaryCardBackgroundClass} backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-2xl`}>
              <div className="flex items-center gap-3 mb-6">
                <div className={`w-10 h-10 ${bluePurpleBackgroundClass} rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/25`}>
                  <CheckCircle size={20} className="text-white" />
                </div>
                <h2 className="text-xl font-semibold text-white">{t('staking.completedStakes')}</h2>
              </div>
              
              <div className="space-y-4">
                {completedStakes.map((stake) => {
                  const asset = availableStakingAssets.find(a => a.symbol === stake.asset_symbol);
                  
                  return (
                    <div key={stake.id} className={`${itemCardBackgroundClass} rounded-xl p-4 border border-slate-700/50`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {asset ? renderCryptoIcon(asset) : (
                            <div className={`w-10 h-10 rounded-full ${fallbackIconBackgroundClass} flex items-center justify-center text-white font-bold`}>
                              {stake.asset_symbol.substring(0, 2)}
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-white">{asset?.name || stake.asset_symbol}</div>
                            <div className="text-xs text-slate-400" translate="no">{stake.staked_amount.toFixed(stake.asset_symbol === 'USDT' ? 2 : 6)} {stake.asset_symbol}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-emerald-400 font-bold">{stake.apy_rate}% APY</div>
                          <div className="text-xs text-slate-400">
                            {new Date(stake.start_date).toLocaleDateString()} - {new Date(stake.end_date).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="text-xs text-slate-400">{t('staking.totalEarned')}</div>
                          <div className="text-emerald-400 font-medium" translate="no">{stake.earned_amount.toFixed(6)} {stake.asset_symbol}</div>
                        </div>
                        <div className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-lg text-xs font-medium">
                          {t('staking.completed')}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Staking Benefits */}
          <div className={`${secondaryCardBackgroundClass} backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-2xl`}>
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-10 h-10 ${bluePurpleBackgroundClass} rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/25`}>
                <Info size={20} className="text-white" />
              </div>
              <h2 className="text-xl font-semibold text-white">{t('staking.stakingBenefits')}</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className={`${itemCardBackgroundClass} rounded-xl p-4 border border-slate-700/50`}>
                <div className="w-12 h-12 bg-gradient-to-r from-emerald-500 to-green-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/25 mb-4">
                  <DollarSign size={24} className="text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{t('staking.passiveIncome')}</h3>
                <p className="text-slate-400 text-sm">{t('staking.whatIsStakingAnswer')}</p>
              </div>
              
              <div className={`${itemCardBackgroundClass} rounded-xl p-4 border border-slate-700/50`}>
                <div className={`w-12 h-12 ${bluePurpleBackgroundClass} rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/25 mb-4`}>
                  <Percent size={24} className="text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{t('staking.competitiveApy')}</h3>
                <p className="text-slate-400 text-sm">Get some of the highest yields in the market with our optimized staking pools.</p>
              </div>
              
              <div className={`${itemCardBackgroundClass} rounded-xl p-4 border border-slate-700/50`}>
                <div className={`w-12 h-12 ${bluePurpleBackgroundClass} rounded-lg flex items-center justify-center shadow-lg shadow-purple-500/25 mb-4`}>
                  <Lock size={24} className="text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{t('staking.flexibleTerms')}</h3>
                <p className="text-slate-400 text-sm">Choose from various lock periods to match your investment strategy.</p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Right Column - Active Stakes & Calculator */}
        <div className="space-y-8">
          {/* Staking Calculator */}
          <div className={`${secondaryCardBackgroundClass} backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-2xl`}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-gradient-to-r from-amber-500 to-orange-500 rounded-lg flex items-center justify-center shadow-lg shadow-amber-500/25">
                <Calculator size={20} className="text-white" />
              </div>
              <h2 className="text-xl font-semibold text-white">{t('staking.stakingCalculator')}</h2>
            </div>
            
            <div className="space-y-4 px-1">
              <div>
                <label className="block text-sm text-slate-400 mb-2">{t('staking.selectAsset')}</label>
                <StakingDropdown
                  value={calculatorAsset}
                  options={calculatorAssetOptions}
                  onChange={setCalculatorAsset}
                />
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-2">{t('common.amount')}</label>
                <input
                  type="number"
                  placeholder={t('swap.enterAmount')}
                  className={`w-full ${inputBackgroundClass} text-white px-4 py-3 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all`}
                  value={calculatorAmount}
                  onChange={(e) => setCalculatorAmount(e.target.value)}
                />
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-2">{t('staking.lockPeriod')} ({t('staking.days')})</label>
                <StakingDropdown
                  value={calculatorDuration}
                  options={calculatorDurationOptions}
                  onChange={setCalculatorDuration}
                />
              </div>
              
              <div className={`${softPanelBackgroundClass} rounded-xl p-4 border border-slate-700/30 mt-6`}>
                <div className="text-center mb-4">
                  <div className="text-sm text-slate-400 mb-1">{t('staking.estimatedEarnings')}</div>
                  <div className="text-2xl font-bold text-emerald-400" translate="no">
                    {calculatorResults.estimatedEarnings.toFixed(6)} {availableStakingAssets.find(a => a.id === calculatorAsset)?.symbol}
                  </div>
                  <div className="text-sm text-slate-300" translate="no">≈ ${calculatorResults.estimatedEarningsUsd.toFixed(2)}</div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-slate-400">{t('staking.daily')}</div>
                    <div className="text-white font-mono" translate="no">
                      {calculatorResults.daily.toFixed(6)} {availableStakingAssets.find(a => a.id === calculatorAsset)?.symbol}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">{t('staking.weekly')}</div>
                    <div className="text-white font-mono" translate="no">
                      {calculatorResults.weekly.toFixed(6)} {availableStakingAssets.find(a => a.id === calculatorAsset)?.symbol}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">{t('staking.monthly')}</div>
                    <div className="text-white font-mono" translate="no">
                      {calculatorResults.monthly.toFixed(6)} {availableStakingAssets.find(a => a.id === calculatorAsset)?.symbol}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">{t('staking.yearly')}</div>
                    <div className="text-white font-mono" translate="no">
                      {calculatorResults.yearly.toFixed(6)} {availableStakingAssets.find(a => a.id === calculatorAsset)?.symbol}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Staking FAQ */}
          <div className={`${secondaryCardBackgroundClass} backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-2xl`}>
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-10 h-10 ${bluePurpleBackgroundClass} rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/25`}>
                <Info size={20} className="text-white" />
              </div>
              <h2 className="text-xl font-semibold text-white">{t('staking.stakingFaq')}</h2>
            </div>
            
            <div className="space-y-4">
              <div className={`${itemCardBackgroundClass} rounded-xl p-4 border border-slate-700/50`}>
                <h3 className="font-medium text-white mb-2">{t('staking.whatIsStaking')}</h3>
                <p className="text-sm text-slate-400">{t('staking.whatIsStakingAnswer')}</p>
              </div>
              
              <div className={`${itemCardBackgroundClass} rounded-xl p-4 border border-slate-700/50`}>
                <h3 className="font-medium text-white mb-2">{t('staking.howAreRewardsCalculated')}</h3>
                <p className="text-sm text-slate-400">{t('staking.howAreRewardsCalculatedAnswer')}</p>
              </div>
              
              <div className={`${itemCardBackgroundClass} rounded-xl p-4 border border-slate-700/50`}>
                <h3 className="font-medium text-white mb-2">{t('staking.canIUnstakeEarly')}</h3>
                <p className="text-sm text-slate-400">{t('staking.canIUnstakeEarlyAnswer')}</p>
              </div>
              
              <div className={`${itemCardBackgroundClass} rounded-xl p-4 border border-slate-700/50`}>
                <h3 className="font-medium text-white mb-2">{t('staking.whenDoIReceiveRewards')}</h3>
                <p className="text-sm text-slate-400">{t('staking.whenDoIReceiveRewardsAnswer')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Staking Confirmation Modal */}
      {showConfirmationModal && selectedAsset && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className={`${secondaryCardBackgroundClass} rounded-xl max-w-md w-full p-6 border border-slate-700 shadow-2xl`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white">{t('staking.confirmStake')}</h3>
              <button
                onClick={() => setShowConfirmationModal(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-6">
              <div className={`${itemCardBackgroundClass} rounded-xl p-4 border border-slate-700/50`}>
                <div className="flex items-center gap-3 mb-4">
                  {renderCryptoIcon(selectedAsset)}
                  <div>
                    <div className="font-medium text-white">{selectedAsset.name}</div>
                    <div className="text-sm text-slate-400">{selectedAsset.apy}% APY</div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">{t('staking.amountToStake')}</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={stakingAmount}
                        onChange={(e) => setStakingAmount(e.target.value)}
                        placeholder={`${t('common.min')} ${selectedAsset.minStake} ${selectedAsset.symbol}`}
                        className={`w-full ${inputBackgroundClass} text-white px-4 py-3 pr-16 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all`}
                      />
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                        <button
                          onClick={handleMaxClick}
                          className="text-xs text-purple-400 hover:text-purple-300 transition-colors px-2 py-1 rounded bg-purple-400/10"
                        >
                          {t('common.max')}
                        </button>
                        <span className="text-slate-400">{selectedAsset.symbol}</span>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {t('common.available')}: {selectedAsset.symbol === 'USDT' 
                        ? (availableBalance !== undefined ? availableBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : usdtBalance.toFixed(2))
                        : selectedAsset.balance?.toFixed(selectedAsset.symbol === 'USDT' ? 2 : 6)
                      } {selectedAsset.symbol}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">{t('staking.stakingPeriod')}</label>
                    <StakingDropdown
                      value={stakingDuration.toString()}
                      options={stakingDurationOptions}
                      onChange={(value) => setStakingDuration(parseInt(value, 10))}
                    />
                  </div>
                </div>
              </div>
              
              {/* Estimated Returns */}
              <div className={`${softPanelBackgroundClass} rounded-xl p-4 border border-slate-700/30`}>
                <div className="flex items-center gap-2 mb-3">
                  <Calculator size={16} className="text-purple-400" />
                  <span className="text-white font-medium">{t('staking.estimatedReturns')}</span>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">{t('staking.apyRate')}</span>
                    <span className="text-emerald-400">{selectedAsset.apy}%</span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">{t('staking.lockPeriod')}</span>
                    <span className="text-white" translate="no">{stakingDuration} {t('staking.days')}</span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">{t('staking.estimatedEarnings')}</span>
                    <span className="text-emerald-400" translate="no">
                      {calculateEstimatedReturn(
                        parseFloat(stakingAmount) || 0, 
                        stakingDuration, 
                        selectedAsset.apy
                      ).toFixed(6)} {selectedAsset.symbol}
                    </span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">{t('staking.unlockDate')}</span>
                    <span className="text-white">
                      {new Date(Date.now() + stakingDuration * 24 * 60 * 60 * 1000).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Check for existing active stake */}
              {hasActiveStakeForAsset(selectedAsset.symbol) && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400 flex items-start gap-3">
                  <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium mb-1">{t('staking.activeStakeExists')}</p>
                    <p>{t('staking.alreadyHaveActiveStake', { asset: selectedAsset.symbol })}</p>
                  </div>
                </div>
              )}
              
              {/* Warning */}
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-sm text-amber-400 flex items-start gap-3">
                <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium mb-1">{t('staking.importantInformation')}</p>
                  <p>{t('staking.stakingWarning')}</p>
                </div>
              </div>
              
              {/* Action Button - Removed the cancel button and made the confirm button full width */}
              <button
                onClick={confirmStake}
                disabled={isStaking || !stakingAmount || parseFloat(stakingAmount) <= 0 || hasActiveStakeForAsset(selectedAsset.symbol)}
                className={`w-full ${bluePurpleBackgroundClass} ${bluePurpleHoverBackgroundClass} disabled:from-slate-700 disabled:to-slate-800 text-white py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-purple-500/25 flex items-center justify-center gap-2`}
              >
                {isStaking ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Layers size={18} />
                    {t('staking.confirmStake')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StakingPage;
