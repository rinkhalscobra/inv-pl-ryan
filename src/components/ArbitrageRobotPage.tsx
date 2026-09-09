import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Bot, 
  Play, 
  Pause, 
  Settings, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Activity, 
  AlertTriangle, 
  CheckCircle,
  Target, 
  Zap,
  BarChart3,
  RefreshCw,
  X
} from 'lucide-react';
import { DatabaseRobotState } from '../hooks/useDatabase';
import { supabase } from '../lib/supabaseClient';
import { useMarketData } from '../contexts/MarketDataContext';

interface ArbitrageRobotPageProps {
  usdtBalance: number;
  selectedPair: string;
  setSelectedPair: (pair: string) => void;
  robotState: DatabaseRobotState | null;
  updateRobotState: (updates: Partial<DatabaseRobotState>) => Promise<void>;
  usedMargin?: number;
  availableBalance?: number;
  refreshBreakdown?: () => void;
  fetchBalances?: () => Promise<void>;
  fetchRobotState?: () => Promise<void>;
}

interface ArbitrageOpportunity {
  id: string;
  buyExchange: string;
  sellExchange: string;
  pair: string;
  buyPrice: number;
  sellPrice: number;
  profitPercentage: number;
  timestamp: Date;
}

const ArbitrageRobotPage: React.FC<ArbitrageRobotPageProps> = ({
  usdtBalance,
  selectedPair,
  setSelectedPair,
  robotState,
  updateRobotState,
  usedMargin = 0,
  availableBalance,
  refreshBreakdown,
  fetchBalances,
  fetchRobotState
}) => {
  const { t } = useTranslation();
  const { marketData, getSnapshotPriceBySymbol } = useMarketData();

  // Robot configuration state
  const [isActivating, setIsActivating] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [isAllocating, setIsAllocating] = useState(false);
  const [allocationAmount, setAllocationAmount] = useState('');
  const [showAllocationForm, setShowAllocationForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showTradingLogs, setShowTradingLogs] = useState(false);
  const [isRemovingFunds, setIsRemovingFunds] = useState(false);
  const [showInvestmentTiers, setShowInvestmentTiers] = useState(false);
  const [localAllocatedBalance, setLocalAllocatedBalance] = useState(robotState?.allocated_balance || 0);

  const actualAvailableBalance = React.useMemo(() => {
    return availableBalance !== undefined
      ? availableBalance
      : usdtBalance - localAllocatedBalance - usedMargin;
  }, [availableBalance, usdtBalance, localAllocatedBalance, usedMargin]);
  
  // Simulated trading logs
  const [tradingLogs, setTradingLogs] = useState<any[]>([]);

  // Simulated arbitrage opportunities
  const [possibleTrades, setPossibleTrades] = useState<ArbitrageOpportunity[]>([]);

  useEffect(() => {
    setLocalAllocatedBalance(robotState?.allocated_balance || 0);
  }, [robotState?.allocated_balance]);

  // Keep automatic profit credits made by the backend visible while this page is open.
  useEffect(() => {
    if (!robotState?.is_active || !fetchRobotState) return;

    const refreshRobot = () => {
      void fetchRobotState();
      refreshBreakdown?.();
    };

    const interval = window.setInterval(refreshRobot, 30000);
    return () => window.clearInterval(interval);
  }, [robotState?.is_active, fetchRobotState, refreshBreakdown]);

  useEffect(() => {
    const currentAmount = parseFloat(allocationAmount);
    if (!isNaN(currentAmount) && currentAmount > actualAvailableBalance) {
      setAllocationAmount('');
    }
  }, [actualAvailableBalance, allocationAmount]);

  const getReferencePrice = useCallback((pair: string) => {
    const normalizedSymbol = pair.replace('/', '');
    const snapshotPrice = getSnapshotPriceBySymbol(normalizedSymbol);
    if (snapshotPrice > 0) return snapshotPrice;

    // Stable fallbacks keep the explicitly simulated feed valid while live
    // market data is reconnecting (and avoid displaying NaN percentages).
    const fallbackPrices: Record<string, number> = {
      BTCUSDT: 50000,
      ETHUSDT: 3000,
      SOLUSDT: 150,
      XRPUSDT: 0.6,
      BNBUSDT: 600,
      ADAUSDT: 0.5,
      AVAXUSDT: 35
    };

    return fallbackPrices[normalizedSymbol] || 1;
  }, [getSnapshotPriceBySymbol]);

  // Get current price for selected pair using snapshot
  const getCurrentPrice = useCallback(() => {
    return getReferencePrice(selectedPair);
  }, [getReferencePrice, selectedPair]);
  
  // Generate simulated arbitrage opportunities
  useEffect(() => {
    const generateArbitrageOpportunity = () => {
      const exchanges = ['Binance', 'Bybit', 'Kraken', 'Coinbase', 'Kucoin', 'OKX', 'Huobi'];
      const pairs = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'BNB/USDT', 'ADA/USDT', 'AVAX/USDT'];
      
      const buyExchange = exchanges[Math.floor(Math.random() * exchanges.length)];
      let sellExchange = buyExchange;
      while (sellExchange === buyExchange) {
        sellExchange = exchanges[Math.floor(Math.random() * exchanges.length)];
      }
      
      const pair = pairs[Math.floor(Math.random() * pairs.length)];
      const basePrice = getReferencePrice(pair);
      
      const buyPrice = basePrice * (1 - Math.random() * 0.005);
      const sellPrice = basePrice * (1 + Math.random() * 0.005);
      const profitPercentage = ((sellPrice - buyPrice) / buyPrice) * 100;
      
      return {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        buyExchange,
        sellExchange,
        pair,
        buyPrice,
        sellPrice,
        profitPercentage,
        timestamp: new Date()
      };
    };
    
    // Generate initial opportunities
    if (possibleTrades.length === 0) {
      const initialOpportunities = Array.from({ length: 5 }, (_, i) => {
        const opportunity = generateArbitrageOpportunity();
        opportunity.timestamp = new Date(Date.now() - i * 30000); // 30 seconds apart
        return opportunity;
      });
      setPossibleTrades(initialOpportunities);
    }
    
    // Add new opportunities periodically if robot is active
    const interval = setInterval(() => {
      if (robotState?.is_active) {
        setPossibleTrades(prev => {
          const newOpportunity = generateArbitrageOpportunity();
          return [newOpportunity, ...prev].slice(0, 10); // Keep only the 10 most recent
        });
      }
    }, 45000); // Every 45 seconds
    
    return () => clearInterval(interval);
  }, [robotState?.is_active, getReferencePrice, possibleTrades.length]);
  
  // Generate simulated trading logs
  useEffect(() => {
    if (robotState?.is_active) {
      const generateLog = () => {
        const actions = ['BUY', 'SELL'];
        const exchanges = ['Binance', 'Bybit', 'Kraken', 'Coinbase'];
        const pairs = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT'];
        
        const action = actions[Math.floor(Math.random() * actions.length)];
        const exchange = exchanges[Math.floor(Math.random() * exchanges.length)];
        const pair = pairs[Math.floor(Math.random() * pairs.length)];
        const amount = (Math.random() * 0.1).toFixed(6);
        const currentPrice = getReferencePrice(pair);
        const price = (action === 'BUY' ? currentPrice * 0.9999 : currentPrice * 1.0001).toFixed(2);
        const profit = (Math.random() * 0.01).toFixed(6);
        
        return {
          id: Date.now().toString(),
          action,
          pair,
          exchange,
          amount,
          price,
          profit,
          timestamp: new Date().toISOString()
        };
      };
      
      // Generate a new log every 2 minutes if robot is active
      const interval = setInterval(() => {
        const newLog = generateLog();
        setTradingLogs(prev => [newLog, ...prev].slice(0, 100));
      }, 120000);
      
      // Generate initial logs
      if (tradingLogs.length === 0) {
        const initialLogs = Array.from({ length: 10 }, (_, i) => {
          const log = generateLog();
          log.timestamp = new Date(Date.now() - i * 60000).toISOString();
          return log;
        });
        setTradingLogs(initialLogs);
      }
      
      return () => clearInterval(interval);
    }
  }, [robotState?.is_active, getReferencePrice, tradingLogs.length]);

  // Handle robot activation
  const handleActivateRobot = async () => {
    if (!localAllocatedBalance || localAllocatedBalance <= 0) {
      setError(t('robot.pleaseAllocateBalance'));
      return;
    }
    
    setIsActivating(true);
    setError(null);
    setSuccess(null);
    
    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Update robot state
      await updateRobotState({
        is_active: true,
        todays_profit: 0 // Reset daily profit on activation
      });
      
      setSuccess(t('robot.robotActivatedSuccessfully'));
    } catch (error: any) {
      setError(error.message || t('robot.failedToActivateRobot'));
    } finally {
      setIsActivating(false);
    }
  };

  // Handle robot deactivation
  const handleDeactivateRobot = async () => {
    setIsDeactivating(true);
    setError(null);
    setSuccess(null);
    
    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Update robot state
      await updateRobotState({
        is_active: false
      });
      
      setSuccess(t('robot.robotDeactivatedSuccessfully'));
    } catch (error: any) {
      setError(error.message || t('robot.failedToDeactivateRobot'));
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleAllocateBalance = async () => {
    const amount = parseFloat(allocationAmount);

    if (isNaN(amount) || amount <= 0) {
      setError(t('errors.invalidAmount'));
      return;
    }

    if (amount > actualAvailableBalance) {
      setError(t('errors.insufficientBalance'));
      return;
    }

    setIsAllocating(true);
    setError(null);
    setSuccess(null);

    const prevAllocated = localAllocatedBalance;
    setLocalAllocatedBalance(prevAllocated + amount);

    try {
      const { error: rpcError } = await supabase.rpc('allocate_robot_funds', {
        p_amount: amount
      });

      if (rpcError) throw rpcError;

      await Promise.all([
        fetchBalances?.(),
        fetchRobotState?.()
      ]);

      refreshBreakdown?.();
      setSuccess(t('robot.successfullyAllocated', { amount: amount.toFixed(2) }));
      setAllocationAmount('');
      setShowAllocationForm(false);
    } catch (error: any) {
      setLocalAllocatedBalance(prevAllocated);
      setError(error.message || t('robot.failedToAllocateBalance'));
    } finally {
      setIsAllocating(false);
    }
  };

  const handleRemoveAllocatedFunds = async () => {
    setIsRemovingFunds(true);
    setError(null);
    setSuccess(null);

    const allocatedAmount = localAllocatedBalance;

    if (allocatedAmount <= 0) {
      setError(t('robot.noAllocatedFundsToRemove'));
      setIsRemovingFunds(false);
      return;
    }

    setLocalAllocatedBalance(0);

    try {
      const { error: rpcError } = await supabase.rpc('deallocate_robot_funds');

      if (rpcError) throw rpcError;

      await Promise.all([
        fetchBalances?.(),
        fetchRobotState?.()
      ]);

      refreshBreakdown?.();
      setSuccess(t('robot.successfullyRemoved', { amount: allocatedAmount.toFixed(2) }));
    } catch (error: any) {
      setLocalAllocatedBalance(allocatedAmount);
      setError(error.message || t('robot.failedToRemoveFunds'));
    } finally {
      setIsRemovingFunds(false);
    }
  };

  // Calculate daily profit percentage based on allocated balance (in BTC equivalent)
  const getDailyProfitPercentage = () => {
    const crmPercentage = Number(robotState?.custom_daily_profit_percentage);
    if (
      robotState?.custom_daily_profit_percentage !== null &&
      robotState?.custom_daily_profit_percentage !== undefined &&
      Number.isFinite(crmPercentage) &&
      crmPercentage >= 0
    ) {
      return crmPercentage;
    }

    const allocatedBalance = localAllocatedBalance;
    const btcPrice = getCurrentPrice() || 50000; // Get current BTC price or fallback
    const allocatedBalanceInBTC = allocatedBalance / btcPrice;

    if (allocatedBalanceInBTC >= 50) return 2.1; // WHALE tier (50 BTC)
    if (allocatedBalanceInBTC >= 10) return 1.2; // SHARK tier (10 BTC)
    if (allocatedBalanceInBTC >= 5) return 0.8; // DOLPHIN tier (5 BTC)
    if (allocatedBalanceInBTC >= 1) return 0.6; // OCTOPUS tier (1 BTC)
    if (allocatedBalanceInBTC >= 0.1) return 0.35; // CRAB tier (0.1 BTC)
    return 0.2; // SHRIMP tier (0.01 BTC)
  };

  // Calculate estimated daily profit
  const estimatedDailyProfit = localAllocatedBalance * (getDailyProfitPercentage() / 100);
  
  // Calculate estimated monthly profit
  const estimatedMonthlyProfit = estimatedDailyProfit * 30;
  
  // Calculate estimated yearly profit
  const estimatedYearlyProfit = estimatedDailyProfit * 365;

  const displayedTodaysProfit = React.useMemo(() => {
    if (!robotState?.last_profit_timestamp) return 0;

    const creditedAt = new Date(robotState.last_profit_timestamp);
    const now = new Date();
    const wasCreditedToday =
      creditedAt.getUTCFullYear() === now.getUTCFullYear() &&
      creditedAt.getUTCMonth() === now.getUTCMonth() &&
      creditedAt.getUTCDate() === now.getUTCDate();

    return wasCreditedToday ? robotState.todays_profit || 0 : 0;
  }, [robotState?.last_profit_timestamp, robotState?.todays_profit]);
  
  // Get investment tier based on allocated balance (in BTC equivalent)
  const getInvestmentTier = () => {
    const allocatedBalance = localAllocatedBalance;
    const btcPrice = getCurrentPrice() || 50000; // Get current BTC price or fallback
    const allocatedBalanceInBTC = allocatedBalance / btcPrice;

    if (allocatedBalanceInBTC >= 50) return 'WHALE';
    if (allocatedBalanceInBTC >= 10) return 'SHARK';
    if (allocatedBalanceInBTC >= 5) return 'DOLPHIN';
    if (allocatedBalanceInBTC >= 1) return 'OCTOPUS';
    if (allocatedBalanceInBTC >= 0.1) return 'CRAB';
    if (allocatedBalanceInBTC > 0) return 'SHRIMP';
    return 'NONE';
  };

  // Get tier color
  const getTierColor = () => {
    const tier = getInvestmentTier();
    
    switch (tier) {
      case 'WHALE': return 'text-green-400';
      case 'SHARK': return 'text-red-400';
      case 'DOLPHIN': return 'text-blue-400';
      case 'OCTOPUS': return 'text-purple-400';
      case 'CRAB': return 'text-orange-400';
      case 'SHRIMP': return 'text-gray-400';
      default: return 'text-slate-400';
    }
  };

  const pageBackgroundClass = 'app-page-bg';
  const glassPanelStrongClass = 'app-surface-primary';
  const glassSurfaceClass = 'app-surface-muted';
  const glassInnerClass = 'app-surface-muted';
  const glassSoftClass = 'app-surface-muted';
  const glassTierCardClass = 'app-surface-raised';
  const robotFieldClass = 'w-full rounded-xl app-input px-4 py-3 transition-all [color-scheme:dark]';
  const robotCompactFieldClass = 'app-input text-white placeholder:text-slate-400 [color-scheme:dark]';
  const glassHoverClass = 'app-surface-hover';
  const glassActionClass = 'app-action-primary';
  const glassActionHoverClass = '';
  const glassSecondaryActionClass = 'app-action-soft';
  const glassSecondaryActionHoverClass = '';

  return (
    <div className={`min-h-screen ${pageBackgroundClass} text-white relative overflow-hidden`}>
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/12 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/12 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/8 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <div className="relative z-10 p-4 md:p-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent flex items-center gap-3">
              <Bot size={32} className="text-blue-400" />
              {t('robot.title')}
            </h1>
            <p className="text-slate-400">{t('robot.subtitle')}</p>
          </div>

          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            <div className={`${glassSoftClass} backdrop-blur-sm px-6 py-3 rounded-xl border border-slate-700/50 shadow-lg w-full md:w-auto`}>
              <div className="text-slate-400 text-sm">{t('header.availableBalance')}</div>
              <div className="text-white font-mono text-xl">${actualAvailableBalance.toFixed(2)}</div>
            </div>
            
            <div className="flex gap-3 w-full md:w-auto">
              {robotState?.is_active ? (
                <button
                  onClick={handleDeactivateRobot}
                  disabled={isDeactivating}
                  className={`flex-1 md:flex-auto ${glassActionClass} ${glassActionHoverClass} disabled:from-slate-700 disabled:via-slate-700 disabled:to-slate-800 text-white px-6 py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2`}
                >
                  {isDeactivating ? (
                    <RefreshCw size={18} className="animate-spin" />
                  ) : (
                    <Pause size={18} />
                  )}
                  {t('robot.stopRobot')}
                </button>
              ) : (
                <button
                  onClick={handleActivateRobot}
                  disabled={isActivating || !localAllocatedBalance || localAllocatedBalance <= 0}
                  className={`flex-1 md:flex-auto ${glassActionClass} ${glassActionHoverClass} disabled:from-slate-700 disabled:via-slate-700 disabled:to-slate-800 text-white px-6 py-3 rounded-xl font-medium transition-all duration-300 shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2`}
                >
                  {isActivating ? (
                    <RefreshCw size={18} className="animate-spin" />
                  ) : (
                    <Play size={18} />
                  )}
                  {t('robot.startRobot')}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Status Messages */}
        {error && (
          <div className={`mb-6 ${glassSurfaceClass} border border-red-500/30 rounded-xl p-4 flex items-center gap-3`}>
            <AlertTriangle size={20} className="text-red-400 flex-shrink-0" />
            <span className="text-red-400">{error}</span>
          </div>
        )}
        
        {success && (
          <div className={`mb-6 ${glassSurfaceClass} border border-green-500/30 rounded-xl p-4 flex items-center gap-3`}>
            <CheckCircle size={20} className="text-green-400 flex-shrink-0" />
            <span className="text-green-400">{success}</span>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Robot Status */}
          <div className="lg:col-span-2 space-y-6">
            {/* Robot Status Card */}
            <div className={`${glassPanelStrongClass} backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-2xl`}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white">{t('robot.robotStatus')}</h2>
                <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                  robotState?.is_active 
                    ? 'bg-blue-500/20 text-green-400' 
                    : 'bg-purple-500/20 text-red-400'
                }`}>
                  {robotState?.is_active ? t('robot.active') : t('robot.inactive')}
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className={`${glassInnerClass} rounded-xl p-4 border border-slate-700/30`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/25">
                      <DollarSign size={20} className="text-white" />
                    </div>
                    <div>
                      <div className="text-slate-400 text-sm">{t('robot.allocatedBalance')}</div>
                      <div className="text-white font-bold text-xl">${localAllocatedBalance.toFixed(2)}</div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-3 mt-4">
                    <button
                      onClick={() => setShowAllocationForm(!showAllocationForm)}
                      className={`flex-1 ${glassActionClass} ${glassActionHoverClass} text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2`}
                    >
                      {showAllocationForm ? t('common.cancel') : t('robot.allocateFunds')}
                    </button>
                    <button
                      onClick={() => setShowInvestmentTiers(true)}
                      className={`flex-1 ${glassSecondaryActionClass} ${glassSecondaryActionHoverClass} text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 shadow-lg shadow-purple-500/25 flex items-center gap-2`}
                    >
                      <BarChart3 size={16} />
                      {t('robot.viewInvestmentTiers')}
                    </button>
                  </div>
                  
                  {/* Remove Allocated Funds Button - Only show when robot is off and has allocated balance */}
                  {!robotState?.is_active && localAllocatedBalance > 0 && (
                    <div className="mt-3">
                      <button
                        onClick={handleRemoveAllocatedFunds}
                        disabled={isRemovingFunds}
                        className={`w-full ${glassSecondaryActionClass} ${glassSecondaryActionHoverClass} disabled:from-slate-700 disabled:via-slate-700 disabled:to-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 shadow-lg shadow-red-500/25 flex items-center justify-center gap-2`}
                      >
                        {isRemovingFunds ? (
                          <>
                            <RefreshCw size={16} className="animate-spin" />
                            {t('robot.processing')}...
                          </>
                        ) : (
                          <>
                            <TrendingDown size={16} />
                            {t('robot.removeAllocatedFunds')}
                          </>
                        )}
                      </button>
                    </div>
                  )}
                  
                  {showAllocationForm && (
                    <div className={`mt-4 ${glassSurfaceClass} rounded-lg p-4 border border-slate-700/50`}>
                      <div className="mb-3">
                        <label className="block text-sm text-slate-400 mb-1">{t('robot.amountToAllocate')}</label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={allocationAmount}
                            onChange={(e) => setAllocationAmount(e.target.value)}
                            placeholder={t('swap.enterAmount')}
                            className={`flex-1 ${robotCompactFieldClass} px-3 py-2 rounded-lg border ${
                              parseFloat(allocationAmount) > actualAvailableBalance
                                ? 'border-red-500/50 focus:ring-red-500/50'
                                : 'border-slate-600/50 focus:ring-blue-500/50'
                            } focus:outline-none focus:ring-1`}
                          />
                          <button
                            onClick={() => setAllocationAmount(Math.floor(actualAvailableBalance * 100) / 100 + '')}
                            className={`${glassSurfaceClass} ${glassHoverClass} text-slate-300 px-3 py-2 rounded-lg text-xs font-medium`}
                          >
                            {t('common.max')}
                          </button>
                        </div>
                        {parseFloat(allocationAmount) > actualAvailableBalance && (
                          <p className="text-red-400 text-xs mt-1">
                            {t('errors.insufficientBalance')} (Max: ${actualAvailableBalance.toFixed(2)})
                          </p>
                        )}
                      </div>
                      <button
                        onClick={handleAllocateBalance}
                        disabled={isAllocating || parseFloat(allocationAmount) > actualAvailableBalance || !allocationAmount}
                        className={`w-full ${glassActionClass} ${glassActionHoverClass} disabled:from-slate-700 disabled:via-slate-700 disabled:to-slate-800 text-white py-2 rounded-lg text-sm font-medium transition-all duration-300 shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2`}
                      >
                        {isAllocating ? (
                          <RefreshCw size={16} className="animate-spin" />
                        ) : (
                          t('robot.confirmAllocation')
                        )}
                      </button>
                    </div>
                  )}
                </div>
                
                <div className={`${glassInnerClass} rounded-xl p-4 border border-slate-700/30`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/25">
                      <TrendingUp size={20} className="text-white" />
                    </div>
                    <div>
                      <div className="text-slate-400 text-sm">{t('robot.todaysProfit')}</div>
                      <div className="text-emerald-400 font-bold text-xl">+${displayedTodaysProfit.toFixed(2)}</div>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">{t('robot.investmentTier')}</span>
                      <span className={`font-medium ${getTierColor()}`}>{getInvestmentTier()}</span>
                    </div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">{t('robot.dailyProfitRate')}</span>
                      <span className="text-emerald-400">{getDailyProfitPercentage()}%</span>
                    </div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">{t('robot.totalTrades')}</span>
                      <span className="text-white">{robotState?.total_trades || 0}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">{t('robot.successRate')}</span>
                      <span className="text-white">
                        {robotState?.total_trades && robotState.total_trades > 0 
                          ? ((robotState?.successful_trades || 0) / robotState.total_trades * 100).toFixed(1) 
                          : 0}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Profit Projections */}
              <div className={`mt-6 ${glassInnerClass} rounded-xl p-4 border border-slate-700/30`}>
                <h3 className="text-lg font-semibold text-white mb-4">{t('robot.profitProjections')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className={`${glassSurfaceClass} rounded-lg p-3 border border-slate-700/50`}>
                    <div className="text-slate-400 text-sm mb-1">{t('robot.daily')}</div>
                    <div className="text-emerald-400 font-bold text-lg">+${estimatedDailyProfit.toFixed(2)}</div>
                    <div className="text-xs text-slate-500">{t('robot.ofAllocatedBalance', { percentage: getDailyProfitPercentage() })}</div>
                  </div>
                  <div className={`${glassSurfaceClass} rounded-lg p-3 border border-slate-700/50`}>
                    <div className="text-slate-400 text-sm mb-1">{t('robot.monthly')}</div>
                    <div className="text-emerald-400 font-bold text-lg">+${estimatedMonthlyProfit.toFixed(2)}</div>
                    <div className="text-xs text-slate-500">{t('robot.ofAllocatedBalance', { percentage: (getDailyProfitPercentage() * 30).toFixed(1) })}</div>
                  </div>
                  <div className={`${glassSurfaceClass} rounded-lg p-3 border border-slate-700/50`}>
                    <div className="text-slate-400 text-sm mb-1">{t('robot.yearly')}</div>
                    <div className="text-emerald-400 font-bold text-lg">+${estimatedYearlyProfit.toFixed(2)}</div>
                    <div className="text-xs text-slate-500">{t('robot.ofAllocatedBalance', { percentage: (getDailyProfitPercentage() * 365).toFixed(1) })}</div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Possible Arbitrage Opportunities */}
            <div className={`${glassPanelStrongClass} backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-2xl`}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <Target size={20} className="text-blue-400" />
                  {t('robot.possibleOpportunities')}
                </h2>
                <div className={`text-xs text-slate-400 ${glassSurfaceClass} px-3 py-1 rounded-full`}>
                  {t('robot.opportunitiesCount', { count: possibleTrades.length })}
                </div>
              </div>
              
              {possibleTrades.length > 0 ? (
                <div className="space-y-3 mb-6">
                  {possibleTrades.map((trade) => (
                    <div key={trade.id} className={`${glassSurfaceClass} rounded-xl p-4 border border-slate-700/40 hover:border-blue-500/30 ${glassHoverClass} transition-all duration-300 shadow-md`}>
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium text-lg">{trade.pair}</span>
                          <span className="text-xs px-3 py-1 rounded-full bg-blue-500/20 text-emerald-400 font-bold">
                            +{trade.profitPercentage.toFixed(2)}%
                          </span>
                        </div>
                        <span className={`text-xs text-slate-400 ${glassSoftClass} px-2 py-1 rounded-lg`}>
                          {new Date(trade.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm mt-2">
                        <div className={`flex items-center gap-2 ${glassSoftClass} px-3 py-2 rounded-lg`}>
                          <TrendingUp size={14} className="text-green-400" />
                          <span className="text-slate-300">
                            {t('robot.buy')}: <span className="text-white font-medium">{trade.buyExchange}</span>
                          </span>
                        </div>
                        <div className={`flex items-center gap-2 ${glassSoftClass} px-3 py-2 rounded-lg`}>
                          <TrendingDown size={14} className="text-red-400" />
                          <span className="text-slate-300">
                            {t('robot.sell')}: <span className="text-white font-medium">{trade.sellExchange}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-500 mb-6">
                  <p className="mb-2">{t('robot.noOpportunitiesFound')}</p>
                  <p className="text-sm text-slate-600">{t('robot.activateToScan')}</p>
                </div>
              )}
            </div>
            
            {/* Trading Logs */}
            <div className={`${glassPanelStrongClass} backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-2xl`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <BarChart3 size={20} className="text-blue-400" />
                  {t('robot.tradingLogs')}
                </h2>
                <button 
                  onClick={() => setShowTradingLogs(!showTradingLogs)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  {showTradingLogs ? <TrendingDown size={20} /> : <TrendingUp size={20} />}
                </button>
              </div>
              
              {showTradingLogs ? (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {tradingLogs.length > 0 ? (
                    tradingLogs.map((log) => (
                      <div key={log.id} className={`${glassSurfaceClass} rounded-xl p-4 border border-slate-700/40`}>
                        <div className="flex justify-between items-center mb-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              log.action === 'BUY' ? 'bg-blue-500/20 text-emerald-400' : 'bg-purple-500/20 text-red-400'
                            }`}>
                              {log.action}
                            </span>
                            <span className="text-white font-medium">{log.pair}</span>
                          </div>
                          <span className="text-xs text-slate-400">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-400">{log.exchange} • {log.amount} @ ${log.price}</span>
                          <span className="text-emerald-400">+${log.profit}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-slate-500">
                      <Activity size={48} className="mx-auto mb-4 opacity-50" />
                      <p className="mb-2">{t('robot.noActivity')}</p>
                      <p className="text-sm text-slate-600">{t('robot.activateRobot')}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-400">
                  {t('robot.clickToViewLogs')}
                </div>
              )}
            </div>
          </div>
          
          {/* Right Column - How It Works & Settings */}
          <div className="space-y-8">
            {/* How It Works */}
            <div className={`${glassPanelStrongClass} backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-2xl`}>
              <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <Zap size={20} className="text-blue-400" />
                {t('robot.howItWorks')}
              </h2>
              
              <div className="space-y-4">
                <div className={`${glassInnerClass} rounded-xl p-4 border border-slate-700/30`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/25 text-white font-bold">
                      1
                    </div>
                    <h3 className="text-lg font-medium text-white">{t('robot.marketAnalysis')}</h3>
                  </div>
                  <p className="text-slate-400 text-sm">
                    {t('robot.marketAnalysisDescription')}
                  </p>
                </div>
                
                <div className={`${glassInnerClass} rounded-xl p-4 border border-slate-700/30`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-500 rounded-lg flex items-center justify-center shadow-lg shadow-purple-500/25 text-white font-bold">
                      2
                    </div>
                    <h3 className="text-lg font-medium text-white">{t('robot.opportunityDetection')}</h3>
                  </div>
                  <p className="text-slate-400 text-sm">
                    {t('robot.opportunityDetectionDescription')}
                  </p>
                </div>
                
                <div className={`${glassInnerClass} rounded-xl p-4 border border-slate-700/30`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/25 text-white font-bold">
                      3
                    </div>
                    <h3 className="text-lg font-medium text-white">{t('robot.automatedExecution')}</h3>
                  </div>
                  <p className="text-slate-400 text-sm">
                    {t('robot.automatedExecutionDescription')}
                  </p>
                </div>
                
                <div className={`${glassInnerClass} rounded-xl p-4 border border-slate-700/30`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-gradient-to-r from-indigo-500 via-purple-500 to-blue-500 rounded-lg flex items-center justify-center shadow-lg shadow-amber-500/25 text-white font-bold">
                      4
                    </div>
                    <h3 className="text-lg font-medium text-white">{t('robot.profitAccumulation')}</h3>
                  </div>
                  <p className="text-slate-400 text-sm">
                    {t('robot.profitAccumulationDescription')}
                  </p>
                </div>
                
                <div className="mt-6 text-center">
                </div>
              </div>
            </div>
            
            {/* Robot Settings */}
            <div className={`${glassPanelStrongClass} backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-2xl`}>
              <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <Settings size={20} className="text-blue-400" />
                {t('robot.robotSettings')}
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">{t('robot.tradingPair')}</label>
                  <select
                    value={selectedPair}
                    onChange={(e) => setSelectedPair(e.target.value)}
                    className={`${robotFieldClass} custom-select`}
                  >
                    {marketData.map((pair) => (
                      <option key={pair.symbol} value={pair.symbol} style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
                        {pair.symbol}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm text-slate-400 mb-2">{t('robot.tradingStrategy')}</label>
                  <select
                    value={robotState?.strategy || 'triangular'}
                    onChange={(e) => updateRobotState({ strategy: e.target.value })}
                    className={`${robotFieldClass} custom-select`}
                  >
                    <option value="triangular" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>{t('robot.strategies.triangular')}</option>
                    <option value="spatial" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>{t('robot.strategies.spatial')}</option>
                    <option value="statistical" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>{t('robot.strategies.statistical')}</option>
                    <option value="latency" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>{t('robot.strategies.latency')}</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm text-slate-400 mb-2">
                    {t('robot.minProfitThreshold')}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.1"
                    max="5"
                    value={robotState?.min_profit_threshold || 0.5}
                    onChange={(e) => updateRobotState({ min_profit_threshold: parseFloat(e.target.value) })}
                    className={robotFieldClass}
                  />
                  <p className="text-xs text-slate-500 mt-1 ml-1">
                    {t('robot.minProfitThresholdDescription')}
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm text-slate-400 mb-2">
                    {t('robot.maxTradeAmount')}
                  </label>
                  <input
                    type="number"
                    step="10"
                    min="10"
                    max={localAllocatedBalance || 1000}
                    value={robotState?.max_trade_amount || 1000}
                    onChange={(e) => updateRobotState({ max_trade_amount: parseFloat(e.target.value) })}
                    className={robotFieldClass}
                  />
                  <p className="text-xs text-slate-500 mt-1 ml-1">
                    {t('robot.maxTradeAmountDescription', { min: 10, max: localAllocatedBalance || 1000 })}
                  </p>
                </div>
              </div>
              
              <button
                onClick={() => updateRobotState({ 
                  strategy: robotState?.strategy || 'triangular',
                  min_profit_threshold: robotState?.min_profit_threshold || 0.5,
                  max_trade_amount: robotState?.max_trade_amount || 1000
                })}
                className={`w-full mt-6 ${glassActionClass} ${glassActionHoverClass} text-white py-3 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-2`}
              >
                <Settings size={18} />
                {t('robot.saveSettings')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Investment Tiers Modal */}
      {showInvestmentTiers && (
        <div className="fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),rgba(15,23,42,0.88),rgba(88,28,135,0.72))] flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className={`${glassPanelStrongClass} rounded-xl max-w-4xl w-full p-6 border border-slate-700 shadow-2xl max-h-[90vh] overflow-y-auto hide-scrollbar`}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-lg flex items-center justify-center shadow-lg shadow-purple-500/25">
                  <BarChart3 size={20} className="text-white" />
                </div>
                <h3 className="text-2xl font-semibold text-white">{t('robot.investmentTiers')}</h3>
              </div>
              <button
                onClick={() => setShowInvestmentTiers(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-4">
                Invest More. Earn More.
              </h2>
              <p className="text-slate-300 max-w-2xl mx-auto">
                You want to make higher profit? No problem! Depending on your investment you are able to trade with a certain leverage. The higher your leverage, the higher your daily profit.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {/* SHRIMP Tier */}
              <div className={`${glassTierCardClass} rounded-xl p-6 border border-slate-700/50 text-center`}>
                <div className="flex items-center justify-center mx-auto mb-4">
                  <span className="text-4xl">🦐</span>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">SHRIMP</h3>
                <div className="text-2xl font-bold text-emerald-400 mb-4">0.2 - 0.5%</div>
                <div className="text-slate-400 text-sm mb-2">Minimum Investment</div>
                <div className="text-white font-bold">0.01 BTC</div>
              </div>

              {/* CRAB Tier */}
              <div className={`${glassTierCardClass} rounded-xl p-6 border border-slate-700/50 text-center`}>
                <div className="flex items-center justify-center mx-auto mb-4">
                  <span className="text-4xl">🦀</span>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">CRAB</h3>
                <div className="text-2xl font-bold text-emerald-400 mb-4">0.35 - 0.7%</div>
                <div className="text-slate-400 text-sm mb-2">Minimum Investment</div>
                <div className="text-white font-bold">0.1 BTC</div>
              </div>

              {/* OCTOPUS Tier */}
              <div className={`${glassTierCardClass} rounded-xl p-6 border border-slate-700/50 text-center`}>
                <div className="flex items-center justify-center mx-auto mb-4">
                  <span className="text-4xl">🐙</span>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">OCTOPUS</h3>
                <div className="text-2xl font-bold text-emerald-400 mb-4">0.6 - 1%</div>
                <div className="text-slate-400 text-sm mb-2">Minimum Investment</div>
                <div className="text-white font-bold">1 BTC</div>
              </div>

              {/* DOLPHIN Tier */}
              <div className={`${glassTierCardClass} rounded-xl p-6 border border-slate-700/50 text-center`}>
                <div className="flex items-center justify-center mx-auto mb-4">
                  <span className="text-4xl">🐬</span>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">DOLPHIN</h3>
                <div className="text-2xl font-bold text-emerald-400 mb-4">0.8 - 1.3%</div>
                <div className="text-slate-400 text-sm mb-2">Minimum Investment</div>
                <div className="text-white font-bold">5 BTC</div>
              </div>

              {/* SHARK Tier */}
              <div className={`${glassTierCardClass} rounded-xl p-6 border border-slate-700/50 text-center`}>
                <div className="flex items-center justify-center mx-auto mb-4">
                  <span className="text-4xl">🦈</span>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">SHARK</h3>
                <div className="text-2xl font-bold text-emerald-400 mb-4">1.2 - 2.6%</div>
                <div className="text-slate-400 text-sm mb-2">Minimum Investment</div>
                <div className="text-white font-bold">10 BTC</div>
              </div>

              {/* WHALE Tier */}
              <div className={`${glassTierCardClass} rounded-xl p-6 border border-slate-700/50 text-center`}>
                <div className="flex items-center justify-center mx-auto mb-4">
                  <span className="text-4xl">🐋</span>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">WHALE</h3>
                <div className="text-2xl font-bold text-emerald-400 mb-4">2.1 - 4.2%</div>
                <div className="text-slate-400 text-sm mb-2">Minimum Investment</div>
                <div className="text-white font-bold">50 BTC</div>
              </div>
            </div>

            <div className={`${glassInnerClass} rounded-xl p-6 border border-slate-700/50 text-center`}>
              <div className="mb-4">
                <p className="text-slate-400 text-sm mb-2">
                  <strong>Daily Profit Calculation:</strong> Profits are calculated based on your allocated balance and tier.
                </p>
                <p className="text-slate-400 text-sm">
                  The robot executes approximately 720 trades per day (1 trade every 2 minutes) to achieve your tier's daily profit target.
                </p>
              </div>
              
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => setShowInvestmentTiers(false)}
                  className={`${glassSurfaceClass} ${glassHoverClass} text-white px-6 py-3 rounded-xl font-medium transition-colors`}
                >
                  Return
                </button>
                <button
                  onClick={() => {
                    setShowInvestmentTiers(false);
                    setShowAllocationForm(true);
                  }}
                  className={`${glassActionClass} ${glassActionHoverClass} text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-emerald-500/25`}
                >
                  Invest Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArbitrageRobotPage;
