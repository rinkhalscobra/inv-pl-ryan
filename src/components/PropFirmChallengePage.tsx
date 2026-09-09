import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Target, 
  Trophy, 
  DollarSign, 
  TrendingUp, 
  Shield, 
  Zap, 
  Star,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  BarChart3,
  Activity,
  Clock,
  Award,
  Layers,
  X
} from 'lucide-react';
import FuturesTradingForms from './FuturesTradingForms';
import CFDTradingForms from './CFDTradingForms';
import FuturesMyOrders from './FuturesMyOrders';
import SearchablePairSelector from './SearchablePairSelector';
import TradingChart from './TradingChart';
import { DatabaseFuturesPosition, MarketData, DatabaseRobotState } from '../hooks/useDatabase';
import { supabase } from '../lib/supabaseClient';
import { usePropFirmTrading } from '../hooks/usePropFirmTrading';
import { usePrevious } from '../hooks/usePrevious';
import { useMarketData } from '../contexts/MarketDataContext';

// Calculate total PnL from position history
const calculateTotalHistoricalPnl = (positionHistory: any[]) => {
  return positionHistory.reduce((total, position) => {
    return total + (parseFloat(position.pnl) || 0);
  }, 0);
};

interface Challenge {
  id: string;
  name: string;
  cost: number;
  accountSize: number;
  profitTarget: number;
  maxDrawdown: number;
  timeLimit: number; // in days
  description: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert' | 'Elite' | 'Master';
  color: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

interface TickerData {
  price: number;
  change24h: number;
  volume24h: number;
}

interface PropFirmChallengePageProps {
  currentPrice: number;
  usdtBalance: number;
  selectedPair: string;
  setSelectedPair: (pair: string) => void;
  polygonData?: MarketData[];
  yahooData?: MarketData[];
  robotState: DatabaseRobotState | null;
  updateRobotState: (updates: Partial<DatabaseRobotState>) => void;
  refreshChallengeState: () => Promise<void>;
  onClosePropPosition: (positionId: string) => Promise<boolean>;
  onCancelPropOrder: (orderId: string) => Promise<boolean>;
  onCancelAllPropOrders: () => Promise<boolean>;
}

const PropFirmChallengePage: React.FC<PropFirmChallengePageProps> = ({
  currentPrice,
  usdtBalance,
  selectedPair,
  setSelectedPair,
  polygonData = [],
  yahooData = [],
  robotState,
  updateRobotState,
  refreshChallengeState,
  onClosePropPosition,
  onCancelPropOrder,
  onCancelAllPropOrders
}) => {
  const { t } = useTranslation();
  const { marketData, isConnected: realtimeConnected, getSnapshotPriceBySymbol, getMarketDataBySymbol } = useMarketData();

  // Use the prop firm trading hook - must be called early to initialize variables
  const {
    propPositions,
    propOrders,
    propPositionHistory,
    propChallengeAccount,
    fetchPropPositions,
    fetchPropOrders,
    fetchPropPositionHistory,
    fetchPropChallengeAccount,
    initializeChallenge,
    cancelChallenge,
    placePropOrder,
    closePropPosition,
    cancelPropOrder,
    cancelAllPropOrders,
    closeAllPropPositions,
    calculateLiquidationPrice,
    triggerPropOrderProcessing,
    triggerImmediateOrderProcessing
  } = usePropFirmTrading();

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingChallenge, setPendingChallenge] = useState<Challenge | null>(null);
  const [tradingMode, setTradingMode] = useState<'crypto' | 'cfd'>('crypto');
  const [lastSelectedPair, setLastSelectedPair] = useState<{crypto: string, cfd: string}>({
    crypto: 'BTCUSDT',
    cfd: 'AAPL'
  });
  
  // Use a ref to store previous prices for each symbol
  const previousPricesRef = useRef<Record<string, number>>({});
  const [showChallengeOutcomeModal, setShowChallengeOutcomeModal] = useState(false);
  const [challengeOutcome, setChallengeOutcome] = useState<{
    status: 'won' | 'lost' | 'expired' | 'cancelled';
    message: string;
    profit: number;
  } | null>(null);
  const [isClosingChallenge, setIsClosingChallenge] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [isStartingChallenge, setIsStartingChallenge] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Debug logs
  console.log('PropFirmChallengePage - Render with props:', {
    propPositions,
    marketData
  });

  const pageBackgroundClass = 'app-page-bg';
  const glassPanelClass = 'app-surface-primary';
  const glassPanelStrongClass = 'app-surface-raised';
  const glassModalClass = 'app-auth-card';
  const glassSurfaceClass = 'app-surface-muted';
  const glassSurfaceHoverClass = 'app-surface-hover';
  const glassActionClass = 'app-action-primary';
  const glassActionHoverClass = '';
  const glassTrackClass = 'app-surface-muted';

  const challenges: Challenge[] = [
    {
      id: 'starter',
      name: 'Starter Challenge',
      cost: 150,
      accountSize: 10000,
      profitTarget: 800, // 8%
      maxDrawdown: 500, // 5%
      timeLimit: 30,
      description: 'Perfect for beginners to test their trading skills',
      difficulty: 'Beginner',
      color: 'from-indigo-500 via-purple-500 to-violet-500',
      icon: Shield
    },
    {
      id: 'bronze',
      name: 'Bronze Challenge',
      cost: 300,
      accountSize: 25000,
      profitTarget: 2000, // 8%
      maxDrawdown: 1250, // 5%
      timeLimit: 30,
      description: 'Step up your game with a larger account',
      difficulty: 'Intermediate',
      color: 'from-indigo-500 via-purple-500 to-fuchsia-500',
      icon: Trophy
    },
    {
      id: 'silver',
      name: 'Silver Challenge',
      cost: 600,
      accountSize: 50000,
      profitTarget: 4000, // 8%
      maxDrawdown: 2500, // 5%
      timeLimit: 30,
      description: 'Serious trading with professional tools',
      difficulty: 'Advanced',
      color: 'from-violet-500 via-purple-500 to-fuchsia-500',
      icon: Star
    },
    {
      id: 'gold',
      name: 'Gold Challenge',
      cost: 1200,
      accountSize: 100000,
      profitTarget: 8000, // 8%
      maxDrawdown: 5000, // 5%
      timeLimit: 30,
      description: 'Elite level trading challenge',
      difficulty: 'Expert',
      color: 'from-purple-500 via-violet-500 to-fuchsia-500',
      icon: Award
    },
    {
      id: 'platinum',
      name: 'Platinum Challenge',
      cost: 2400,
      accountSize: 200000,
      profitTarget: 16000, // 8%
      maxDrawdown: 10000, // 5%
      timeLimit: 30,
      description: 'For experienced professional traders',
      difficulty: 'Elite',
      color: 'from-indigo-500 via-purple-500 to-fuchsia-500',
      icon: Zap
    },
    {
      id: 'diamond',
      name: 'Diamond Challenge',
      cost: 4800,
      accountSize: 400000,
      profitTarget: 32000, // 8%
      maxDrawdown: 20000, // 5%
      timeLimit: 30,
      description: 'The ultimate trading challenge for masters',
      difficulty: 'Master',
      color: 'from-violet-500 via-purple-500 to-fuchsia-500',
      icon: Layers
    }
  ];

  // Get the current active challenge from robotState
  const getActiveChallenge = React.useCallback(() => {
    // First check if there's an active challenge in robotState
    if (robotState?.active_challenge_id) {
      const challenge = challenges.find(c => c.id === robotState.active_challenge_id);
      if (challenge) return challenge;
    }
    
    // Return null if no active challenge is found
    return null;
  }, [robotState]);

  const selectedChallenge = React.useMemo(() => getActiveChallenge(), [getActiveChallenge]);
  const challengeAccountBalance = robotState?.challenge_account_balance || 0;

  // Set default pair when trading mode changes
  useEffect(() => {
    // When trading mode changes, set the appropriate pair for that mode
    if (tradingMode === 'crypto') {
      // If current pair isn't a crypto pair, set to the last selected crypto pair
      if (!selectedPair.endsWith('USDT')) {
        setSelectedPair(lastSelectedPair.crypto);
      }
    } else if (tradingMode === 'cfd') {
      // If current pair isn't a CFD instrument, set to the last selected CFD pair
      if (selectedPair.endsWith('USDT')) {
        setSelectedPair(lastSelectedPair.cfd);
      }
    }
  }, [tradingMode]);

  // Save the last selected pair for each mode
  useEffect(() => {
    if (selectedPair.endsWith('USDT')) {
      setLastSelectedPair(prev => ({...prev, crypto: selectedPair}));
    } else {
      setLastSelectedPair(prev => ({...prev, cfd: selectedPair}));
    }
  }, [selectedPair]);

  // Check for challenge outcome when robotState changes
  useEffect(() => {
    // Guard against undefined robotState
    if (!robotState) return;
    
    const currentChallenge = getActiveChallenge();
    if (robotState?.challenge_status && robotState.challenge_status !== 'active' && currentChallenge) {
      // Calculate profit
      const profit = robotState.challenge_account_balance - robotState.challenge_initial_balance;
      
      // Set challenge outcome
      setChallengeOutcome({
        status: robotState.challenge_status as 'won' | 'lost' | 'expired' | 'cancelled',
        message: robotState.challenge_status === 'won' 
          ? `Congratulations! You've reached the profit target of $${currentChallenge.profitTarget}.` 
          : robotState.challenge_status === 'lost'
          ? `Challenge lost. You've exceeded the maximum drawdown of $${currentChallenge.maxDrawdown}.`
          : robotState.challenge_status === 'expired'
          ? `Challenge expired. The ${currentChallenge.timeLimit} day time limit has been reached.`
          : 'Challenge cancelled.',
        profit
      });
      
      // Show outcome modal
      setShowChallengeOutcomeModal(true);
    }
  }, [robotState?.challenge_status, robotState?.active_challenge_id]);

  // Handle closing the challenge outcome modal and resetting the challenge
  const handleCloseOutcomeModal = async () => {
    setIsClosingChallenge(true);
    setIsCleaningUp(true);
    try {
      // Use the same exitChallenge function for consistency
      await exitChallenge();

        setSuccessMessage('Challenge exited successfully');
      // Close the modal
      setShowChallengeOutcomeModal(false);
      setChallengeOutcome(null);
    } catch (error) {
      setErrorMessage('Failed to exit challenge. Please try again.');
    } finally {
      // These states are already reset in exitChallenge()
    }
  };

  // Calculate real-time PnL and ROI for each position
  const propPositionsWithLiveData = useMemo(() => {
    return propPositions.map(position => {
      // Initialize livePrice to 0 (will be populated from the best available source)
      let livePrice = 0;
      const symbol = position.symbol;
      
      // Debug log for each position
      console.log(`Position ${position.id} (${symbol}) - Current data:`, {
        originalPrice: position.current_price || 0,
        marketDataPrice: marketData.find(data => data.symbol === symbol)?.price
      });
      
      // Use market data price if available
      if (marketData.find(data => data.symbol === symbol)?.price) {
        livePrice = marketData.find(data => data.symbol === symbol)!.price;
        console.log(`Using market data price for ${symbol}: ${livePrice}`);
      }
      // Fall back to position's current price
      else if (position.current_price) {
        livePrice = position.current_price;
        console.log(`Using position's current price for ${symbol}: ${livePrice}`);
      }
      // Last resort: Use entry price if nothing else is available
      else if (position.entry_price) {
        livePrice = position.entry_price;
        console.log(`Using entry price as fallback for ${symbol}: ${livePrice}`);
      }
      
      // Calculate unrealized PnL based on live price
      let unrealizedPnl = 0;
      if (position.side === 'long') {
        unrealizedPnl = (livePrice - position.entryPrice) * position.amount;
      } else {
        unrealizedPnl = (position.entryPrice - livePrice) * position.amount;
      }
      
      // Calculate ROI
      const roi = position.margin > 0 ? (unrealizedPnl / position.margin) * 100 : 0;
      
      // Determine flash class based on price change
      let flashClass = '';
      const prevPrice = previousPricesRef.current[symbol];
      if (prevPrice && livePrice !== prevPrice) {
        flashClass = livePrice > prevPrice ? 'animate-flash-green' : 'animate-flash-red';
        console.log(`Price change for ${symbol}: ${prevPrice} -> ${livePrice}, flash: ${flashClass}`);
      }
      
      return {
        ...position,
        currentPrice: livePrice,
        unrealizedPnl,
        roi,
        flashClass
      };
    });
  }, [propPositions, marketData]);

  // After calculating positions with live data, update previous prices ref
  useEffect(() => {
    if (propPositionsWithLiveData.length > 0) {
      const newPrices: Record<string, number> = {};
      propPositionsWithLiveData.forEach(position => {
        if (position.symbol && position.currentPrice > 0) {
          newPrices[position.symbol] = position.currentPrice;
        }
      });
      previousPricesRef.current = {...previousPricesRef.current, ...newPrices};
    }
  }, [propPositionsWithLiveData]);

  // Fetch prop positions when challenge is active
  useEffect(() => {
    const fetchPropData = async () => {
      if (selectedChallenge) {
        try {
          // Fetch prop positions and orders for this challenge
          const challengeId = selectedChallenge.id;
          console.log(`Fetching prop data for challenge ID: ${challengeId}`);
          await fetchPropChallengeAccount(challengeId);
          await fetchPropPositions(challengeId);
          await fetchPropOrders(challengeId);
          await fetchPropPositionHistory(challengeId);
        } catch (err) {
          console.error('Error fetching prop data:', err);
        }
      }
    };
    
    fetchPropData();
    
    // Set up interval to refresh data
    const interval = setInterval(fetchPropData, 5000);
    return () => clearInterval(interval);
  }, [selectedChallenge, fetchPropPositions, fetchPropOrders, fetchPropChallengeAccount]);

  // Clear error and success messages after 5 seconds
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => {
        setErrorMessage(null);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Calculate total unrealized PnL from all positions
  const totalUnrealizedPnl = propPositionsWithLiveData.reduce((sum, position) => sum + (position.unrealizedPnl || 0), 0);
  
  // Calculate total margin used from all positions
  const totalMarginUsed = propPositions.reduce((sum, position) => sum + (parseFloat(position.margin) || 0), 0);

  const totalReservedMargin = propOrders.reduce((sum, order) => sum + (parseFloat(order.reserved_margin?.toString() || '0') || 0), 0);

  const availableMargin = Math.max(0, challengeAccountBalance - totalMarginUsed - totalReservedMargin);
  
  // Calculate total PnL from closed positions - ensure we're using the numeric pnl value
  const totalClosedPnl = propPositionHistory.reduce((sum, position) => {
    const pnlValue = typeof position.pnl === 'number' ? position.pnl : parseFloat(position.pnl);
    return sum + (isNaN(pnlValue) ? 0 : pnlValue);
  }, 0);
  
  // Total PnL is the sum of unrealized PnL from open positions and realized PnL from closed positions
  const totalPnl = totalUnrealizedPnl + totalClosedPnl;
  
  console.log('Total PnL calculation:', {
    totalUnrealizedPnl,
    totalClosedPnl,
    totalPnl
  });

  const handleSelectChallenge = (challenge: Challenge) => {
    setPendingChallenge(challenge);
    setShowConfirmModal(true);
  };

  const confirmChallenge = async () => {
    if (!pendingChallenge || isStartingChallenge) return;

    if (pendingChallenge.cost > usdtBalance) {
      setErrorMessage(`Insufficient balance to start this challenge. Required: ${pendingChallenge.cost} USDT, Available: ${usdtBalance.toFixed(2)} USDT`);
      return;
    }

    setIsStartingChallenge(true);
    setErrorMessage(null);

    try {
      await initializeChallenge(pendingChallenge.id);
      await refreshChallengeState();
      setSuccessMessage(`${pendingChallenge.name} started successfully.`);
      setShowConfirmModal(false);
      setPendingChallenge(null);
    } catch (error: any) {
      console.error('Failed to start challenge:', error);
      setErrorMessage(error?.message || 'Failed to start challenge. Please try again.');
    } finally {
      setIsStartingChallenge(false);
    }
  };

  const exitChallenge = async () => {
    if (selectedChallenge) {
      setIsCleaningUp(true);
      setIsClosingChallenge(true);
      
      // Call the proper cancelChallenge function from usePropFirmTrading hook
      // This will handle all the database cleanup via the Edge Function
      const challengeId = selectedChallenge.id;
      console.log(`Calling cancelChallenge from usePropFirmTrading hook for challenge ${challengeId}...`);
      
      try {
        const success = await cancelChallenge(challengeId);
        
        if (success) {
          console.log('Challenge cancelled successfully via Edge Function');
          
          // Update challenge state in robotState to cancelled
          await updateRobotState({
            active_challenge_id: null,
            challenge_account_balance: 0,
            challenge_profit_target: 0,
            challenge_max_drawdown: 0,
            challenge_time_limit: null,
            challenge_initial_balance: 0,
            challenge_start_date: null,
            challenge_status: 'cancelled'
          });
          
          console.log('Challenge exited successfully');
        } else {
          throw new Error('Failed to cancel challenge via Edge Function');
        }
      } catch (error) {
        console.error('Error calling cancelChallenge:', error);
        alert('Failed to exit challenge. Please try again.');
      } finally {
        
        // Reset states
        setIsClosingChallenge(false);
        setIsCleaningUp(false);
      }
    }
  };

  const handleChallengeTrade = async (symbol: string, side: string, amount: number, leverage: number, marginType: string, stopLoss?: any, takeProfit?: any, orderType: string = 'market', price?: number) => {
    if (!selectedChallenge) {
      setErrorMessage('No active challenge found');
      return;
    }

    const requiredMargin = (amount * currentPrice) / leverage;

    if (requiredMargin > availableMargin) {
      setErrorMessage(`Insufficient available margin. Required: ${requiredMargin.toFixed(2)} USDT, Available: ${availableMargin.toFixed(2)} USDT`);
      return;
    }

    try {
      console.log('Placing prop order with challenge ID:', selectedChallenge.id, 'for user ID:', robotState?.user_id);
      const success = await placePropOrder({
        challengeId: selectedChallenge.id,
        symbol: symbol,
        side: side === 'long' ? 'buy' : 'sell',
        amount,
        leverage,
        marginType,
        orderType: orderType,
        price: orderType === 'limit' ? price : undefined,
        stopLoss: stopLoss?.trigger_price,
        takeProfit: takeProfit?.trigger_price
      });
      
      if (success) {
        console.log('Prop order placed successfully');
        setSuccessMessage(`${side === 'long' ? 'Long' : 'Short'} position opened successfully for ${amount} ${symbol}`);
      } else {
        console.error('Failed to place prop order');
        setErrorMessage('Failed to place order. Please try again.');
      }
      
      // Trigger immediate processing
      await triggerPropOrderProcessing();
    } catch (err) {
      console.error('Error creating prop order:', err);
      setErrorMessage('Failed to place order. Please try again.');
    }
  };

  // Calculate progress metrics
  const progress = useMemo(() => {
    const currentBalance = propChallengeAccount?.currentBalance || challengeAccountBalance;
    const initialBalance = propChallengeAccount?.startingBalance || selectedChallenge?.accountSize || 0;
    const profit = currentBalance - initialBalance;
    const profitPercentage = initialBalance > 0 ? (profit / initialBalance) * 100 : 0;
    
    // Calculate drawdown (negative profit from peak)
    const drawdown = Math.max(0, -profit);
    const drawdownPercentage = initialBalance > 0 ? (drawdown / initialBalance) * 100 : 0;
    
    return {
      currentBalance,
      initialBalance,
      profit,
      profitPercentage,
      drawdown,
      drawdownPercentage
    };
  }, [propChallengeAccount, challengeAccountBalance, selectedChallenge]);

  if (!selectedChallenge) {
    return (
      <div className={`min-h-screen ${pageBackgroundClass} text-white relative overflow-hidden`}>
        {/* Animated Background */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/12 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-fuchsia-500/12 rounded-full blur-3xl animate-pulse delay-1000"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl animate-pulse delay-500"></div>
        </div>

        <div className="relative z-10 p-8">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="w-20 h-20 bg-gradient-to-r from-indigo-500 to-fuchsia-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-purple-500/25">
              <Target size={32} className="text-white" />
            </div>
            <h1 className="text-5xl font-bold bg-gradient-to-r from-indigo-300 via-purple-300 to-fuchsia-300 bg-clip-text text-transparent mb-4">
              {t('propFirm.title')}
            </h1>
            <p className="text-slate-400 text-xl max-w-3xl mx-auto">
              {t('propFirm.subtitle')}
            </p>
          </div>

          {/* Available Balance */}
          <div className="text-center mb-12">
            <div className={`${glassPanelStrongClass} backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 shadow-2xl max-w-md mx-auto`}>
              <div className="text-slate-400 text-sm mb-2">{t('wallet.availableBalance')}</div>
              <div className="text-3xl font-bold text-emerald-400">${usdtBalance.toLocaleString()}</div>
            </div>
          </div>

          {/* Challenges Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
            {challenges.map((challenge) => {
              const Icon = challenge.icon;
              const canAfford = challenge.cost <= usdtBalance;
              
              return (
                <div
                  key={challenge.id}
                  className={`${glassPanelClass} backdrop-blur-sm rounded-2xl p-8 border border-slate-700/50 shadow-2xl transition-all duration-300 hover:transform hover:scale-105 ${
                    canAfford ? 'hover:border-slate-600/50 cursor-pointer' : 'opacity-60'
                  }`}
                  onClick={() => canAfford && handleSelectChallenge(challenge)}
                >
                  {/* Challenge Header */}
                  <div className="text-center mb-6">
                    <div className={`w-16 h-16 bg-gradient-to-r ${challenge.color} rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg`}>
                      <Icon size={28} className="text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">{challenge.name}</h3>
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                      challenge.difficulty === 'Beginner' ? 'bg-indigo-500/20 text-green-400' :
                      challenge.difficulty === 'Intermediate' ? 'bg-indigo-500/20 text-yellow-400' :
                      challenge.difficulty === 'Advanced' ? 'bg-violet-500/20 text-orange-400' :
                      challenge.difficulty === 'Expert' ? 'bg-purple-500/20 text-red-400' :
                      challenge.difficulty === 'Elite' ? 'bg-violet-500/20 text-purple-400' :
                      'bg-indigo-500/20 text-cyan-400'
                    }`}>
                      {challenge.difficulty}
                    </span>
                  </div>

                  {/* Challenge Details */}
                  <div className="space-y-4 mb-6">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">{t('propFirm.entryFee')}</span>
                      <span className="text-white font-bold">${challenge.cost.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">{t('propFirm.accountSize')}</span>
                      <span className="text-emerald-400 font-bold">${challenge.accountSize.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">{t('propFirm.profitTarget')}</span>
                      <span className="text-blue-400 font-bold">${challenge.profitTarget.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">{t('propFirm.maxDrawdown')}</span>
                      <span className="text-red-400 font-bold">${challenge.maxDrawdown.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">{t('propFirm.timeLimit')}</span>
                      <span className="text-white font-bold">{challenge.timeLimit} {t('propFirm.days')}</span>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-slate-400 text-sm mb-6 text-center">{challenge.description}</p>

                  {/* Action Button */}
                  <button
                    disabled={!canAfford}
                    className={`w-full py-3 rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 ${
                      canAfford
                        ? `bg-gradient-to-r ${challenge.color} hover:shadow-lg transform hover:scale-105 text-white`
                        : `${glassSurfaceClass} text-slate-500 cursor-not-allowed`
                    }`}
                  >
                    {canAfford ? (
                      <>
                        {t('propFirm.startChallenge')}
                        <ArrowRight size={16} />
                      </>
                    ) : (
                      t('propFirm.insufficientBalance')
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Info Section */}
          <div className="max-w-4xl mx-auto mt-16">
            <div className={`${glassPanelStrongClass} backdrop-blur-sm rounded-2xl p-8 border border-slate-700/50 shadow-2xl`}>
              <h3 className="text-2xl font-bold text-white mb-6 text-center">{t('propFirm.howItWorks')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="text-center">
                  <div className="w-12 h-12 bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <DollarSign size={24} className="text-white" />
                  </div>
                  <h4 className="text-lg font-semibold text-white mb-2">1. {t('propFirm.payEntryFee')}</h4>
                  <p className="text-slate-400 text-sm">{t('propFirm.chooseChallenge')}</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-500 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <BarChart3 size={24} className="text-white" />
                  </div>
                  <h4 className="text-lg font-semibold text-white mb-2">2. {t('propFirm.tradeAndProfit')}</h4>
                  <p className="text-slate-400 text-sm">{t('propFirm.useVirtualCapital')}</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <Trophy size={24} className="text-white" />
                  </div>
                  <h4 className="text-lg font-semibold text-white mb-2">3. {t('propFirm.getFunded')}</h4>
                  <p className="text-slate-400 text-sm">{t('propFirm.passAndReceiveFunding')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Confirmation Modal */}
        {showConfirmModal && pendingChallenge && (
          <div className="fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(168,85,247,0.24),rgba(15,23,42,0.88),rgba(126,34,206,0.78))] flex items-center justify-center z-50 p-4">
            <div className={`${glassModalClass} rounded-xl max-w-md w-full p-6 border border-slate-700`}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-white">{t('propFirm.confirmChallenge')}</h3>
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="text-center mb-6">
                <div className={`w-16 h-16 bg-gradient-to-r ${pendingChallenge.color} rounded-xl flex items-center justify-center mx-auto mb-4`}>
                  <pendingChallenge.icon size={28} className="text-white" />
                </div>
                <h4 className="text-lg font-semibold text-white mb-2">{pendingChallenge.name}</h4>
                <p className="text-slate-400 text-sm">{pendingChallenge.description}</p>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between">
                  <span className="text-slate-400">{t('propFirm.entryFee')}:</span>
                  <span className="text-white font-bold">${pendingChallenge.cost.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">{t('propFirm.accountSize')}:</span>
                  <span className="text-emerald-400 font-bold">${pendingChallenge.accountSize.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">{t('propFirm.yourBalance')}:</span>
                  <span className="text-white font-bold">${usdtBalance.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">{t('propFirm.afterPayment')}:</span>
                  <span className="text-white font-bold">${(usdtBalance - pendingChallenge.cost).toLocaleString()}</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  disabled={isStartingChallenge}
                  className={`flex-1 ${glassSurfaceClass} ${glassSurfaceHoverClass} text-white py-3 rounded-lg font-medium transition-colors`}
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={confirmChallenge}
                  disabled={isStartingChallenge}
                  className={`flex-1 bg-gradient-to-r ${pendingChallenge.color} text-white py-3 rounded-lg font-medium transition-all duration-300 shadow-lg disabled:cursor-not-allowed disabled:opacity-60 flex items-center justify-center gap-2`}
                >
                  {isStartingChallenge && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                  {isStartingChallenge ? t('propFirm.processing') : t('propFirm.startChallenge')}
                </button>
              </div>
              {errorMessage && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                  <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Challenge Trading Interface
  return (
    <div className={`min-h-screen ${pageBackgroundClass} text-white relative overflow-hidden pb-8`}>
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/12 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-fuchsia-500/12 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <div className="relative z-10 p-8">
        {/* Challenge Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 bg-gradient-to-r ${selectedChallenge.color} rounded-xl flex items-center justify-center shadow-lg`}>
              <selectedChallenge.icon size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">{selectedChallenge.name}</h1>
              <p className="text-slate-400">{t('propFirm.challengeInProgress')}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Trading Mode Toggle */}
            <div className={`flex ${glassSurfaceClass} rounded-xl p-1 border border-slate-600/30`}>
              <button
                onClick={() => setTradingMode('crypto')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                  tradingMode === 'crypto' 
                    ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 text-white shadow-lg shadow-purple-500/25'
                    : `text-slate-400 hover:text-white ${glassSurfaceHoverClass}`
                }`}
              >
                {t('propFirm.crypto')}
              </button>
              <button 
                onClick={() => setTradingMode('cfd')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                  tradingMode === 'cfd' 
                    ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 text-white shadow-lg shadow-purple-500/25'
                    : `text-slate-400 hover:text-white ${glassSurfaceHoverClass}`
                }`}
              >
                {t('propFirm.cfd')}
              </button>
            </div>

            {/* Pair Selector */}
            <div className="relative">
              <SearchablePairSelector
                selectedPair={selectedPair || (tradingMode === 'crypto' ? 'BTCUSDT' : 'AAPL')}
                onPairSelect={(pair: string) => {
                  setSelectedPair(pair);
                  // Also update the last selected pair for this mode
                  if (pair.endsWith('USDT')) {
                    setLastSelectedPair(prev => ({...prev, crypto: pair}));
                  } else {
                    setLastSelectedPair(prev => ({...prev, cfd: pair}));
                  }
                }}
                tradingMode={tradingMode === 'cfd' ? 'cfd' : 'futures'}
              />
              {/* Debug info - remove in production */}
              <div className="hidden absolute -bottom-6 left-0 text-xs text-slate-500">
                Mode: {tradingMode}, Pair: {selectedPair}
              </div>
            </div>

            <button
              onClick={exitChallenge}
              disabled={isClosingChallenge}
              className={`w-full ${glassActionClass} ${glassActionHoverClass} disabled:from-slate-700 disabled:via-slate-700 disabled:to-slate-800 text-white py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2`}
            >
              {isClosingChallenge ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{t('propFirm.processing')}</span>
                </>
              ) : (
                t('propFirm.exitChallenge')
              )}
            </button>
          </div>
        </div>

        {/* Status Messages */}
        {errorMessage && (
          <div className={`mb-6 ${glassSurfaceClass} border border-red-500/30 rounded-xl p-4 flex items-center gap-3`}>
            <AlertTriangle size={20} className="text-red-400 flex-shrink-0" />
            <span className="text-red-400">{errorMessage}</span>
          </div>
        )}
        
        {successMessage && (
          <div className={`mb-6 ${glassSurfaceClass} border border-green-500/30 rounded-xl p-4 flex items-center gap-3`}>
            <CheckCircle size={20} className="text-green-400 flex-shrink-0" />
            <span className="text-green-400">{successMessage}</span>
          </div>
        )}

        {/* Challenge Progress */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className={`${glassPanelClass} backdrop-blur-sm rounded-xl p-6 border border-slate-700/50 shadow-lg`}>
            <div className="flex items-center gap-3 mb-2">
              <DollarSign size={20} className="text-emerald-400" />
              <span className="text-slate-400 text-sm">{t('propFirm.totalAccountValue')}</span>
            </div>
            <div className="text-2xl font-bold text-white">${progress.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className="text-slate-400 text-sm">
              {t('propFirm.initialBalance')}: ${propChallengeAccount ? propChallengeAccount.startingBalance.toLocaleString() : (selectedChallenge?.accountSize || 0).toLocaleString()}
            </div>
          </div>

          <div className={`${glassPanelClass} backdrop-blur-sm rounded-xl p-6 border border-slate-700/50 shadow-lg`}>
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp size={20} className={progress.profit >= 0 ? 'text-emerald-400' : 'text-red-400'} />
              <span className="text-slate-400 text-sm">{t('common.pnl')} ({t('propFirm.openAndClosed')})</span>
            </div>
            <div className={`text-2xl font-bold ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}
            </div>
            <div className="text-slate-400 text-sm">
              {progress.profitPercentage >= 0 ? '+' : ''}{progress.profitPercentage.toFixed(2)}%
            </div>
          </div>

          <div className={`${glassPanelClass} backdrop-blur-sm rounded-xl p-6 border border-slate-700/50 shadow-lg`}>
            <div className="flex items-center gap-3 mb-2">
              <Target size={20} className="text-blue-400" />
              <span className="text-slate-400 text-sm">{t('propFirm.profitTarget')}</span>
            </div>
            <div className="text-2xl font-bold text-white">${(selectedChallenge?.profitTarget || 0).toLocaleString()}</div>
            <div className="text-slate-400 text-sm">
              {((progress.profit / (selectedChallenge?.profitTarget || 1)) * 100).toFixed(1)}% {t('propFirm.complete')}
            </div>
          </div>

         <div className={`${glassPanelClass} backdrop-blur-sm rounded-xl p-6 border border-slate-700/50 shadow-lg`}>
           <div className="flex items-center gap-3 mb-2">
             <AlertTriangle size={20} className="text-red-400" />
             <span className="text-slate-400 text-sm">{t('propFirm.drawdownStatus')}</span>
           </div>
           <div className="text-2xl font-bold text-white">
             ${progress.drawdown.toFixed(2)} / ${(selectedChallenge?.maxDrawdown || 0).toLocaleString()}
           </div>
           <div className="text-slate-400 text-sm">
             {progress.drawdownPercentage.toFixed(1)}% {t('propFirm.ofMax')} {((selectedChallenge?.maxDrawdown || 0) / (selectedChallenge?.accountSize || 1) * 100).toFixed(1)}%
           </div>
         </div>
        </div>

        {/* Progress Bars */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className={`${glassPanelClass} backdrop-blur-sm rounded-xl p-6 border border-slate-700/50 shadow-lg`}>
            <div className="flex justify-between items-center mb-3">
              <span className="text-slate-400 text-sm">{t('propFirm.profitProgress')}</span>
              <span className="text-blue-400 font-medium">
                {propChallengeAccount && selectedChallenge 
                  ? Math.min(Math.max(((progress.profit / (selectedChallenge?.profitTarget || 1)) * 100), -999), 999).toFixed(1)
                  : "0.0"}%
              </span>
            </div>
            <div className={`w-full ${glassTrackClass} rounded-full h-3`}>
              <div 
                className="bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 h-3 rounded-full transition-all duration-300"
                style={{ width: `${propChallengeAccount && selectedChallenge 
                  ? Math.min(Math.max((progress.profit / (selectedChallenge?.profitTarget || 1)) * 100, 0), 100)
                  : 0}%` }}
              ></div>
            </div>
          </div>

          <div className={`${glassPanelClass} backdrop-blur-sm rounded-xl p-6 border border-slate-700/50 shadow-lg`}>
            <div className="flex justify-between items-center mb-3">
              <span className="text-slate-400 text-sm">{t('propFirm.drawdownRisk')}</span>
              <span className="text-red-400 font-medium">
                {propChallengeAccount && selectedChallenge 
                  ? Math.min(((progress.drawdown / (selectedChallenge?.maxDrawdown || 1)) * 100), 999).toFixed(1)
                  : "0.0"}%
              </span>
            </div>
            <div className={`w-full ${glassTrackClass} rounded-full h-3`}>
              <div 
                className="bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 h-3 rounded-full transition-all duration-300"
                style={{ width: `${propChallengeAccount && selectedChallenge 
                  ? Math.min((progress.drawdown / (selectedChallenge?.maxDrawdown || 1)) * 100, 100)
                  : 0}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* TradingView Chart */}
        <div className="mb-8">
          <TradingChart
            selectedPair={selectedPair || (tradingMode === 'crypto' ? 'BTCUSDT' : 'AAPL')}
            backgroundVariant={tradingMode === 'cfd' ? 'cfd' : 'futures'}
          />
        </div>

        {/* Trading Interface */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Trading Forms */}
          <div>
            {tradingMode === 'cfd' ? (
              <CFDTradingForms
                availableBalance={availableMargin}
                currentPrice={currentPrice}
                usdtBalance={challengeAccountBalance}
                surfaceVariant="cfd"
                calculateLiquidationPrice={calculateLiquidationPrice}
                selectedPair={selectedPair || 'AAPL'}
                onCFDTrade={handleChallengeTrade}
              />
            ) : (
              <FuturesTradingForms
                availableBalance={availableMargin}
                currentBtcPrice={currentPrice}
                usdtBalance={challengeAccountBalance}
                surfaceVariant="futures"
                calculateLiquidationPrice={calculateLiquidationPrice}
                onFuturesTrade={(symbol, side, amount, leverage, marginType, stopLoss, takeProfit, orderType) => {
                  console.log('Challenge trade initiated:', { side, amount, leverage, marginType, orderType });
                  return handleChallengeTrade(symbol, side, amount, leverage, marginType, stopLoss, takeProfit, orderType);
                }}
                selectedPair={selectedPair || 'BTCUSDT'}
              />
            )}
          </div>

          {/* Positions */}
          <div>
            <FuturesMyOrders
              currentBtcPrice={getSnapshotPriceBySymbol('BTCUSDT') || currentPrice}
              futuresPositions={propPositionsWithLiveData}
              marketData={marketData}
              onClosePosition={async (positionId: string, livePrice?: number) => {
                if (!selectedChallenge) return;
                await closePropPosition(positionId, selectedChallenge.id, livePrice);
              }}
              onClosePropPosition={async (positionId: string, livePrice?: number) => {
                if (!selectedChallenge) return false;
                return closePropPosition(positionId, selectedChallenge.id, livePrice);
              }}
              openOrders={propOrders}
              onCancelOrder={async (orderId: string) => {
                if (!selectedChallenge) return false;
                return cancelPropOrder(orderId, selectedChallenge.id);
              }}
              onCancelAllOrders={async () => {
                if (!selectedChallenge) return false;
                return cancelAllPropOrders(selectedChallenge.id);
              }}
              propHistory={propChallengeAccount ? propPositionHistory.filter(history => 
                history.challengeId === propChallengeAccount.challengeId
              ) : []}
              challengeId={propChallengeAccount?.challengeId}
              selectedPair={selectedPair}
              tradingMode="futures"
              currentSelectedPairPrice={currentPrice}
              realtimeConnected={realtimeConnected}
            />
          </div>
        </div>
      </div>

      {/* Challenge Outcome Modal */}
      {showChallengeOutcomeModal && challengeOutcome && (
        <div className="fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(168,85,247,0.24),rgba(15,23,42,0.88),rgba(126,34,206,0.78))] flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className={`${glassModalClass} rounded-xl max-w-md w-full p-6 border border-slate-700 shadow-2xl`}>
            <div className="text-center mb-6">
              {challengeOutcome.status === 'won' ? (
                <div className="w-20 h-20 bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trophy size={40} className="text-white" />
                </div>
              ) : challengeOutcome.status === 'lost' || challengeOutcome.status === 'expired' ? (
                <div className="w-20 h-20 bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle size={40} className="text-white" />
                </div>
              ) : (
                <div className="w-20 h-20 bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <X size={40} className="text-white" />
                </div>
              )}
              
              <h3 className="text-2xl font-bold text-white mb-2">
                {t('propFirm.challengeOutcome')} {challengeOutcome.status === 'won' ? t('propFirm.challengeCompleted') : 
                           challengeOutcome.status === 'lost' ? t('propFirm.challengeFailed') : 
                           challengeOutcome.status === 'expired' ? t('propFirm.challengeExpired') : t('propFirm.challengeCancelled')}
              </h3>
              
              <p className="text-slate-300 mb-6">
                {challengeOutcome.message}
              </p>
            </div>
            
            <div className={`${glassSurfaceClass} rounded-xl p-4 border border-slate-700/50 mb-6`}>
              <div className="flex justify-between mb-2">
                <span className="text-slate-400">{t('propFirm.finalPnl')}:</span>
                <span className={challengeOutcome.profit >= 0 ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                  {challengeOutcome.profit >= 0 ? '+' : ''}{challengeOutcome.profit.toFixed(2)} USD
                </span>
              </div>
              
              {challengeOutcome.status === 'won' && (
                <div className="flex justify-between">
                  <span className="text-slate-400">{t('propFirm.rewardAdded')}:</span>
                  <span className="text-emerald-400 font-bold">
                    +{(selectedChallenge?.profitTarget || 0).toFixed(2)} USD
                  </span>
                </div>
              )}
            </div>
            
            <button
              onClick={handleCloseOutcomeModal}
              disabled={isClosingChallenge}
              className={`w-full ${glassActionClass} ${glassActionHoverClass} disabled:from-slate-700 disabled:via-slate-700 disabled:to-slate-800 text-white py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2`}
            >
              {isClosingChallenge ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{t('propFirm.processing')}</span>
                </>
              ) : (
                t('propFirm.closeChallenge')
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PropFirmChallengePage;
