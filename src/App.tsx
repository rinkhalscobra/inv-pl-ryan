import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header';
import { MarketDataProvider, useMarketData } from './contexts/MarketDataContext';
import { BybitDataProvider, useBybitData } from './contexts/BybitDataContext';
import CryptoHoldings from './components/CryptoHoldings';
import SpotTradingForms from './components/SpotTradingForms';
import CFDTradingForms from './components/CFDTradingForms';
import FuturesTradingForms from './components/FuturesTradingForms';
import FuturesMyOrders from './components/FuturesMyOrders';
import FuturesMarketHeader from './components/FuturesMarketHeader';
import FuturesMarketRail from './components/FuturesMarketRail';
import CfdMarketHeader from './components/CfdMarketHeader';
import CfdMarketRail from './components/CfdMarketRail';
import TradingChart from './components/TradingChart';
import CfdTwelveDataChart from './components/CfdTwelveDataChart';
import Markets from './components/Markets';
import SpotMyOrders from './components/SpotMyOrders';
import ArbitrageRobotPage from './components/ArbitrageRobotPage';
import CryptoWithdrawalModal from './components/CryptoWithdrawalModal';
import WalletPage from './components/WalletPage';
import ProfilePage from './components/ProfilePage';
import OrderBook from './components/OrderBook';
import PairDetailsPanel from './components/PairDetailsPanel';
import StakingPage from './pages/StakingPage';
import HomePage from './pages/HomePage';
import LandingPage from './pages/LandingPage';
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import TradingFeesPage from './pages/TradingFeesPage';
import FinnhubWebSocketTest from './components/FinnhubWebSocketTest';
import LoadingScreen from './components/LoadingScreen';
import MarketLoadingScreen from './components/MarketLoadingScreen';
import AuthModal from './components/AuthModal';
import { supabase } from './lib/supabaseClient';
import { useAuth } from './hooks/useAuth';
import { useDatabase } from './hooks/useDatabase';
import { getUserCfdTier } from './constants/tradingTiers';
import { useUserAssets } from './hooks/useUserAssets';
import { useFuturesTrading } from './hooks/useFuturesTrading';
import { useWalletBreakdown } from './hooks/useWalletBreakdown';
import { useUserLeverage } from './hooks/useUserLeverage';
import SwapCryptoPage from './components/SwapCryptoPage';
import SpinTheWheel from './components/SpinTheWheel';
import PaymentSandbox from './components/PaymentSandbox';
import AdminCRMPage from './components/AdminCRMPage';
import CRMHierarchyPage from './components/CRMHierarchyPage';
import CRMStaffPage from './components/CRMStaffPage';

export type TradingMode = 'home' | 'swap' | 'futures' | 'cfd' | 'robot' | 'wallet' | 'profile' | 'staking' | 'wheel' | 'payment_sandbox';

export interface FuturesPosition {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  amount: number;
  entryPrice: number;
  currentPrice: number;
  leverage: number;
  marginType: 'isolated' | 'cross';
  liquidationPrice: number;
  unrealizedPnl: number;
  margin: number;
  roi: number;
  created_at: string;
  user_email?: string;
}

export interface Transaction {
  id: string;
  type: 'deposit' | 'withdrawal' | 'trade' | 'robot_profit' | 'binary_trade' | 'stake' | 'staking_profit' | 'staking_return' | 'challenge_fee' | 'challenge_reward';
  amount: number;
  currency?: string;
  description: string;
  status: 'completed' | 'pending' | 'failed';
  timestamp: string;
  created_at?: string;
}

function AppContent() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { marketData, getSnapshotPriceBySymbol, refreshQuotes } = useMarketData();
  const { getPriceBySymbol: getBybitPrice } = useBybitData();
  const {
    balances,
    updateBalances,
    fetchBalances,
    robotState,
    updateRobotState,
    loading: dbLoading,
    transactions,
    addTransaction,
    fetchTransactions,
    userStakes,
    addUserStake,
    newsItems,
    portfolioSnapshots,
    createPortfolioSnapshot,
    fetchPortfolioSnapshots,
    kycStatus,
    updateKycStatus,
    referralCode,
    referralCount,
    referredUsers,
    fetchUserStakes,
    fetchRobotState,
    calculateCurrentEarnings,
    isAdmin,
    crmRole
  } = useDatabase();
  const { assets, fetchAssets } = useUserAssets();
  const { 
    activePositions, 
    openOrders, 
    fetchActivePositions, 
    fetchOpenOrders, 
    openPosition, 
    closePosition, 
    cancelOrder, 
    cancelAllOpenOrders,
    calculateLiquidationPrice
  } = useFuturesTrading();
  
  const [tradingMode, setTradingMode] = useState<TradingMode>('home');
  const [selectedPair, setSelectedPair] = useState('BTCUSDT');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPreparingMarkets, setIsPreparingMarkets] = useState(false);

  // The selected CFD quote is refreshed while its workspace is open.
  // Supabase Realtime pushes each stored quote to the UI without reloading it.
  useEffect(() => {
    if (!user || tradingMode !== 'cfd') return;
    const refreshSelected = () => {
      if (!document.hidden) void refreshQuotes(selectedPair);
    };
    refreshSelected();
    const selectedTimer = window.setInterval(refreshSelected, 60 * 1000);
    window.addEventListener('focus', refreshSelected);
    window.addEventListener('online', refreshSelected);
    document.addEventListener('visibilitychange', refreshSelected);
    return () => {
      window.clearInterval(selectedTimer);
      window.removeEventListener('focus', refreshSelected);
      window.removeEventListener('online', refreshSelected);
      document.removeEventListener('visibilitychange', refreshSelected);
    };
  }, [refreshQuotes, selectedPair, tradingMode, user]);

  
  // Check if this is a password recovery link
  const isRecoveryLink = useMemo(() => {
    const hash = window.location.hash;
    if (!hash) return false;
    
    const hashParams = new URLSearchParams(hash.substring(1));
    const accessToken = hashParams.get('access_token');
    const type = hashParams.get('type');
    
    return type === 'recovery' && !!accessToken;
  }, []);

  // Add this function inside App component, before the return
const handleUpdatePassword = async (newPassword: string) => {
  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Failed to update password:", err);
    return false;
  }
};


  // Handle auth callback from CRM impersonation
  useEffect(() => {
    const handleAuthCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const accessToken = urlParams.get('access_token');
      const refreshToken = urlParams.get('refresh_token');

      if (accessToken) {
        try {
          console.log('Auth callback detected, handling CRM impersonation...');

          // Sign out current session first
          await supabase.auth.signOut();

          // Set the new session with the provided tokens
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || accessToken // Use access token as fallback if no refresh token
          });

          if (error) {
            console.error('Error setting session from auth callback:', error);
            throw error;
          }

          console.log('Successfully set session from auth callback:', data);

          // Clear the URL parameters to clean up the address bar
          const newUrl = window.location.pathname;
          window.history.replaceState({}, document.title, newUrl);

        } catch (error) {
          console.error('Error handling auth callback:', error);
        }
      }
    };

    handleAuthCallback();
  }, []);

  // Detect when user logs in and show market loading screen
  useEffect(() => {
    if (user && !authLoading && !isRecoveryLink) {
      const hasShownLoading = sessionStorage.getItem('marketLoadingShown');

      if (!hasShownLoading) {
        setIsPreparingMarkets(true);
        sessionStorage.setItem('marketLoadingShown', 'true');
      }
    }
  }, [user, authLoading, isRecoveryLink]);


  // Collect all active symbols for WebSocket subscription
  const activeSymbols = useMemo(() => {
    // Always ensure we have at least default symbols to prevent empty array
    const neededSymbols = new Set<string>(['BTCUSDT', 'ETHUSDT']); // Default symbols
    
    // Always include the selected pair (most important)
    if (selectedPair) {
      neededSymbols.add(selectedPair);
    }
    
    // Include symbols with active positions
    activePositions.forEach(p => {
      if (p.symbol) neededSymbols.add(p.symbol);
    });
    
    // Convert to array with selectedPair first
    const symbolsArray = Array.from(neededSymbols);
    const finalSymbols = selectedPair ? 
      [selectedPair, ...symbolsArray.filter(s => s !== selectedPair)] : 
      symbolsArray;
    
    // Limit to 10 symbols max for better coverage
    const limitedSymbols = finalSymbols.slice(0, 10);
    
    return limitedSymbols;
  }, [selectedPair, activePositions]);
  
  // Get current price from ticker or market data
  const currentSelectedPairPrice = useMemo(() => {
    if (tradingMode === 'cfd') {
      const storedQuote = (marketData || []).find(data => data.symbol === selectedPair)?.price;
      return storedQuote && storedQuote > 0 ? storedQuote : 0;
    }
    const streamPrice = getBybitPrice(selectedPair);
    if (streamPrice > 0) return streamPrice;
    const snapshotPrice = getSnapshotPriceBySymbol(selectedPair);
    if (snapshotPrice > 0) return snapshotPrice;
    const marketPrice = (marketData || []).find(data => data.symbol === selectedPair)?.price;
    return marketPrice && marketPrice > 0 ? marketPrice : 0;
  }, [getBybitPrice, getSnapshotPriceBySymbol, selectedPair, marketData, tradingMode]);

  // Get live price for a symbol with fallback (using same strategy as WalletPage)
  const getCurrentPrice = useCallback((symbol: string): number => {
    // Strategy 1: Try Bybit WebSocket data first (most real-time)
    const bybitPrice = getBybitPrice(symbol);
    if (bybitPrice > 0) {
      return bybitPrice;
    }

    // Strategy 2: Try snapshot data (stable fallback)
    const snapshotPrice = getSnapshotPriceBySymbol(symbol);
    if (snapshotPrice > 0) {
      return snapshotPrice;
    }

    // Strategy 3: Fallback to database market data
    const dbData = (marketData || []).find(data => data.symbol === symbol);
    return dbData?.price || 0;
  }, [getBybitPrice, getSnapshotPriceBySymbol, marketData]);

  // Get current BTC price from combined data using the same strategy
  const currentBtcPrice = getCurrentPrice('BTCUSDT');

  // Wallet values update from live prices without re-querying Supabase on every tick.
  const walletBreakdown = useWalletBreakdown(
    balances.usdt_balance,
    balances.btc_balance,
    currentBtcPrice,
    getCurrentPrice
  );
  const {
    unrealizedPnl,
    availableBalance,
    refreshBreakdown,
    futuresUsedMargin,
    futuresOrdersReserved
  } = walletBreakdown;

  const actualAvailableBalance = useMemo(() => Math.max(0, availableBalance), [availableBalance]);
  const usdtAvailableMargin = useMemo(() => (
    Math.max(0, balances.usdt_balance - futuresUsedMargin - futuresOrdersReserved)
  ), [balances.usdt_balance, futuresOrdersReserved, futuresUsedMargin]);

  // Get current price for selected pair
  // Calculate total portfolio value
 const totalPortfolioValue = useMemo(() => {
  let total = balances.usdt_balance; // Start with USDT balance

  // Use the same BTC price as displayed in wallet (real-time price)
  const btcUsdtPrice = getCurrentPrice('BTCUSDT');

  total += balances.btc_balance * btcUsdtPrice; // Add BTC value

  // Add value of other user assets
  const allAssets = assets || [];
  if (allAssets.length > 0) {
    allAssets.forEach(asset => {
    // Skip USDT and BTC as they are handled above
    if (asset.asset_symbol !== 'USDT' && asset.asset_symbol !== 'BTC') {
      // Construct the USDT pair symbol (e.g., 'ETHUSDT')
      const assetUsdtSymbol = `${asset.asset_symbol}USDT`;

      // Use getCurrentPrice for consistency with real-time data
      const assetPrice = getCurrentPrice(assetUsdtSymbol);

      total += asset.balance * assetPrice;
    }
    });
  }

  total += robotState?.allocated_balance || 0;

  return total;
}, [balances, assets, getCurrentPrice, robotState?.allocated_balance]);

  // Calculate user's CFD tier based on portfolio value
  const userCfdTier = useMemo(() => {
    return getUserCfdTier(totalPortfolioValue);
  }, [totalPortfolioValue]);

  const userLeverageSettings = useUserLeverage(user?.id, totalPortfolioValue);

  const currentMaxForexLeverage = useMemo(() => userLeverageSettings.maxForex, [userLeverageSettings]);
  const currentMinForexLeverage = useMemo(() => userLeverageSettings.minForex, [userLeverageSettings]);
  const currentMaxCommoditiesLeverage = useMemo(() => userLeverageSettings.maxCommodities, [userLeverageSettings]);
  const currentMinCommoditiesLeverage = useMemo(() => userLeverageSettings.minCommodities, [userLeverageSettings]);
  const currentMaxStocksLeverage = useMemo(() => userLeverageSettings.maxStocks, [userLeverageSettings]);
  const currentMinStocksLeverage = useMemo(() => userLeverageSettings.minStocks, [userLeverageSettings]);
  const currentMaxFuturesLeverage = useMemo(() => userLeverageSettings.maxFutures, [userLeverageSettings]);
  const currentMinFuturesLeverage = useMemo(() => userLeverageSettings.minFutures, [userLeverageSettings]);

  // Initialize app data - only when user is authenticated
  useEffect(() => {
    // Skip initialization if this is a recovery link
    if (isRecoveryLink) {
      setIsLoading(false);
      return;
    }
    
    const initializeData = async () => {
      // Only fetch user-specific data if user is authenticated
      if (user) {
        await fetchTransactions();
        await fetchAssets();
        await fetchPortfolioSnapshots();
        await fetchUserStakes();
        await fetchActivePositions();
        await fetchOpenOrders();
      } else {
        // For unauthenticated users, no data fetching needed
      }
      setIsLoading(false);
    };
    
    if (!authLoading && !dbLoading) {
      initializeData();
    }
  }, [
    user, 
    authLoading, 
    dbLoading, 
    fetchTransactions, 
    fetchAssets, 
    fetchPortfolioSnapshots, 
    fetchUserStakes,
    fetchActivePositions,
    fetchOpenOrders,
    isRecoveryLink
  ]);

  useEffect(() => {
    if (!user) return;
    let refreshTimer: number | null = null;
    const refreshAccount = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void Promise.all([fetchActivePositions(), fetchOpenOrders()]);
      }, 100);
    };
    const channel = supabase.channel(`futures-account-${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'futures_positions', filter: `user_id=eq.${user.id}`,
      }, refreshAccount)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'futures_orders', filter: `user_id=eq.${user.id}`,
      }, refreshAccount)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') refreshAccount();
      });
    const catchUp = () => {
      if (!document.hidden) refreshAccount();
    };
    window.addEventListener('focus', catchUp);
    window.addEventListener('online', catchUp);
    document.addEventListener('visibilitychange', catchUp);
    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      window.removeEventListener('focus', catchUp);
      window.removeEventListener('online', catchUp);
      document.removeEventListener('visibilitychange', catchUp);
      void supabase.removeChannel(channel);
    };
  }, [fetchActivePositions, fetchOpenOrders, user]);

  // Handle futures trade
  const handleFuturesTrade = useCallback(async (
    symbol: string,
    side: 'long' | 'short', 
    amount: number, 
    leverage: number, 
    marginType: 'isolated' | 'cross',
    stopLoss?: { trigger_price: number; execution_type: 'market' | 'limit'; execution_price?: number },
    takeProfit?: { trigger_price: number; execution_type: 'market' | 'limit'; execution_price?: number },
    orderType?: 'market' | 'limit',
    price?: number
  ) => {
    try {
      // Use the price parameter directly from the frontend
      const currentPrice = Number(price);
      if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
        throw new Error(`No verified market price is available for ${symbol || selectedPair}`);
      }
      await fetchBalances();
      
      // Use the openPosition function from useFuturesTrading hook
      const positionId = await openPosition({
        symbol: symbol || selectedPair,
        side,
        amount,
        leverage,
        marginType,
        orderType: orderType || 'market',
        price: currentPrice,
        stopLoss: stopLoss?.trigger_price,
        takeProfit: takeProfit?.trigger_price,
        contractSize: 1
      });
      
      if (positionId) {
        await Promise.all([fetchBalances(), fetchActivePositions(), fetchOpenOrders()]);
        refreshBreakdown();

        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error in handleFuturesTrade:', error);
      throw error;
    }
  }, [selectedPair, openPosition, refreshBreakdown, fetchBalances, fetchActivePositions, fetchOpenOrders]);

  // Handle closing a futures position
  const handleClosePosition = useCallback(async (positionId: string, livePrice?: number) => {
    try {
      // Call the closePosition function from useFuturesTrading hook with live price
      const success = await closePosition(positionId, livePrice);

      if (success) {
        await fetchBalances();
        refreshBreakdown();

        // The closePosition function will handle updating the database and refreshing the positions
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error in handleClosePosition:', error);
      return false;
    }
  }, [closePosition, refreshBreakdown, fetchBalances]);

  // Handle spot order
  const handleSpotOrder = useCallback(async (order: {
    side: 'buy' | 'sell';
    order_type: 'market' | 'limit';
    amount: number;
    price?: number;
    stop_loss?: { trigger_price: number; execution_type: 'market' | 'limit'; execution_price?: number };
    take_profit?: { trigger_price: number; execution_type: 'market' | 'limit'; execution_price?: number };
  }) => {
    const { side, order_type, amount } = order;
    const price = order.price || currentSelectedPairPrice;
    
    // Calculate total cost/proceeds
    const total = amount * price;
    
    if (side === 'buy') {
      // Check if user has enough USDT
      if (total > balances.usdt_balance) {
        alert('Insufficient USDT balance');
        return;
      }
      
      // Update balances
      await updateBalances({ 
        usdt_balance: balances.usdt_balance - total,
        btc_balance: balances.btc_balance + amount
      });
      
      // Add transaction
      await addTransaction({
        type: 'trade',
        amount: -total,
        description: `Bought ${amount.toFixed(6)} BTC at ${price.toFixed(2)} USDT`,
        status: 'completed'
      });
    } else {
      // Check if user has enough BTC
      if (amount > balances.btc_balance) {
        alert('Insufficient BTC balance');
        return;
      }
      
      // Update balances
      await updateBalances({ 
        usdt_balance: balances.usdt_balance + total,
        btc_balance: balances.btc_balance - amount
      });
      
      // Add transaction
      await addTransaction({
        type: 'trade',
        amount: total,
        description: `Sold ${amount.toFixed(6)} BTC at ${price.toFixed(2)} USDT`,
        status: 'completed'
      });
    }
  }, [currentSelectedPairPrice, balances, updateBalances, addTransaction]);

  // Execute swaps atomically in Supabase so both wallet sides settle together.
  const handleSwap = useCallback(async (
    fromSymbol: string,
    toSymbol: string,
    fromAmount: number,
    toAmountReceived?: number
  ) => {
    if (dbLoading) {
      throw new Error('Please wait, loading account data...');
    }
    if (!fromSymbol || !toSymbol || !Number.isFinite(fromAmount) || fromAmount <= 0) {
      throw new Error('Invalid swap parameters');
    }

    const { data, error } = await supabase.rpc('execute_asset_swap', {
      p_from_symbol: fromSymbol,
      p_to_symbol: toSymbol,
      p_from_amount: fromAmount,
      p_expected_to_amount: toAmountReceived ?? null
    });

    if (error) throw error;
    if (!data || !(data as { success?: boolean }).success) {
      throw new Error('The swap could not be completed');
    }

    await Promise.all([
      fetchBalances(),
      fetchAssets(),
      fetchTransactions()
    ]);
    await refreshBreakdown();
    return true;
  }, [dbLoading, fetchBalances, fetchAssets, fetchTransactions, refreshBreakdown]);

  // Calculate time remaining for a stake
  // Set default pair when changing trading mode
  const handleTradingModeChange = (mode: TradingMode) => {
    setTradingMode(mode);
    
    // Set default pair based on trading mode
    if (mode === 'futures') {
      setSelectedPair('BTCUSDT');
    } else if (mode === 'cfd') {
      setSelectedPair('EUR/USD');
    }
  };

  return (
    <Router>
      <div className="min-h-screen app-page-bg text-white">
          <Routes>
            {/* Public landing page and root-level password recovery links */}
            <Route path="/" element={
              isRecoveryLink ? <ResetPasswordPage /> : <LandingPage />
            } />

            {/* Authenticated trading workspace */}
            <Route path="/dashboard" element={
              isRecoveryLink ? (
                <ResetPasswordPage />
              ) : user ? (
                <>
                  <Header
                    tradingMode={tradingMode}
                    setTradingMode={handleTradingModeChange}
                    selectedPair={selectedPair}
                    setSelectedPair={setSelectedPair}
                    currentPrice={currentSelectedPairPrice}
                    marketData={(marketData || []).find(data => data.symbol === selectedPair)}
                    usdtBalance={balances.usdt_balance}
                    btcBalance={balances.btc_balance}
                    totalPortfolioValue={totalPortfolioValue}
                    user={user}
                    signOut={signOut}
                    marketDataList={marketData}
                    isAdmin={isAdmin}
                    crmRole={crmRole}
                  />
                  
                  <main>
                    {tradingMode === 'home' && (
                      <HomePage
                        currentBtcPrice={currentSelectedPairPrice}
                        usdtBalance={balances.usdt_balance}
                        btcBalance={balances.btc_balance}
                        marketData={marketData}
                        futuresPositions={activePositions}
                        transactions={transactions}
                        setTradingMode={setTradingMode}
                        newsItems={newsItems}
                        totalPortfolioValue={totalPortfolioValue}
                      />
                    )}
                    
                    {tradingMode === 'swap' && (
                      <SwapCryptoPage
                        usdtBalance={balances.usdt_balance}
                        btcBalance={balances.btc_balance}
                        currentBtcPrice={currentSelectedPairPrice}
                        onSwap={handleSwap}
                        userAssets={assets}
                      />
                    )}
                    
                    {tradingMode === 'futures' && (
                      <div className="futures-workspace flex min-h-[calc(100vh-72px)] flex-col bg-[#070a12] text-slate-100">
                        <FuturesMarketHeader selectedPair={selectedPair} currentPrice={currentSelectedPairPrice} onSelectPair={setSelectedPair} />

                        <div className="futures-terminal-grid min-h-0 flex-1 bg-[#252a33]">
                          <section className="futures-chart-panel min-w-0 overflow-hidden bg-[#0b0e11]">
                            <div className="h-[360px] sm:h-[440px] xl:h-full">
                              <TradingChart key={selectedPair} selectedPair={selectedPair} backgroundVariant="futures" />
                            </div>
                          </section>

                          <div className="futures-depth-panel min-h-0 overflow-hidden bg-[#0b0e11]">
                            <FuturesMarketRail
                              orderBook={(
                                <OrderBook
                                  selectedPair={selectedPair}
                                  tradingMode="futures"
                                  compact
                                />
                              )}
                              markets={(
                                <Markets
                                  selectedPair={selectedPair}
                                  setSelectedPair={setSelectedPair}
                                  currentPrice={currentSelectedPairPrice}
                                  tradingMode="futures"
                                  compact
                                />
                              )}
                            />
                          </div>

                          <section className="futures-order-panel min-h-[620px] overflow-hidden bg-[#0b0e11] xl:min-h-0">
                            <FuturesTradingForms
                              usdtBalance={balances.usdt_balance}
                              availableBalance={usdtAvailableMargin}
                              maxAllowedLeverage={currentMaxFuturesLeverage}
                              minAllowedLeverage={currentMinFuturesLeverage}
                              calculateLiquidationPrice={calculateLiquidationPrice}
                              onFuturesTrade={handleFuturesTrade}
                              selectedPair={selectedPair}
                              surfaceVariant="futures"
                            />
                          </section>

                          <section className="futures-positions-panel min-h-[320px] overflow-hidden bg-[#0b0e11] xl:min-h-0">
                            <FuturesMyOrders
                              currentBtcPrice={currentSelectedPairPrice}
                              futuresPositions={activePositions}
                              onClosePosition={handleClosePosition}
                              openOrders={openOrders}
                              onCancelOrder={cancelOrder}
                              onCancelAllOrders={() => cancelAllOpenOrders(selectedPair)}
                              updateBalances={updateBalances}
                              balances={balances}
                              selectedPair={selectedPair}
                              tradingMode={tradingMode}
                              currentSelectedPairPrice={currentSelectedPairPrice}
                            />
                          </section>
                        </div>
                      </div>
                    )}
                    
                    {tradingMode === 'cfd' && (
                      <div className="cfd-workspace flex min-h-[calc(100vh-72px)] flex-col bg-[#070a12] text-slate-100">
                        <CfdMarketHeader selectedPair={selectedPair} currentPrice={currentSelectedPairPrice} onSelectPair={setSelectedPair} />
                        <div className="cfd-terminal-grid min-h-0 flex-1 bg-[#252a33]">
                          <section className="cfd-chart-panel min-w-0 overflow-hidden bg-[#0b0e11]">
                            <div className="h-[360px] sm:h-[440px] xl:h-full">
                              <CfdTwelveDataChart key={selectedPair} selectedPair={selectedPair} />
                            </div>
                          </section>
                          <div className="cfd-depth-panel min-h-0 overflow-hidden bg-[#0b0e11]">
                            <CfdMarketRail
                              details={<PairDetailsPanel currentPrice={currentSelectedPairPrice} selectedPair={selectedPair} tradingMode="cfd" onPairSelect={setSelectedPair} compact />}
                              markets={<Markets selectedPair={selectedPair} setSelectedPair={setSelectedPair} currentPrice={currentSelectedPairPrice} tradingMode="cfd" compact />}
                            />
                          </div>
                          <section className="cfd-order-panel min-h-[620px] overflow-hidden bg-[#0b0e11] xl:min-h-0">
                            <CFDTradingForms
                              currentPrice={currentSelectedPairPrice}
                              usdtBalance={balances.usdt_balance}
                              calculateLiquidationPrice={calculateLiquidationPrice}
                              selectedPair={selectedPair}
                              onCFDTrade={handleFuturesTrade}
                              maxForexLeverage={currentMaxForexLeverage}
                              minForexLeverage={currentMinForexLeverage}
                              maxCommoditiesLeverage={currentMaxCommoditiesLeverage}
                              minCommoditiesLeverage={currentMinCommoditiesLeverage}
                              maxStocksLeverage={currentMaxStocksLeverage}
                              minStocksLeverage={currentMinStocksLeverage}
                              availableBalance={usdtAvailableMargin}
                              userCfdTier={userCfdTier.name}
                              surfaceVariant="terminal"
                            />
                          </section>
                          <section className="cfd-positions-panel min-h-[320px] overflow-hidden bg-[#0b0e11] xl:min-h-0">
                            <FuturesMyOrders
                              currentBtcPrice={currentSelectedPairPrice}
                              futuresPositions={activePositions}
                              onClosePosition={handleClosePosition}
                              openOrders={openOrders}
                              onCancelOrder={cancelOrder}
                              onCancelAllOrders={() => cancelAllOpenOrders(selectedPair)}
                              updateBalances={updateBalances}
                              balances={balances}
                              selectedPair={selectedPair}
                              tradingMode={tradingMode}
                              currentSelectedPairPrice={currentSelectedPairPrice}
                              terminal
                            />
                          </section>
                        </div>
                      </div>
                    )}
                    
                    {tradingMode === 'robot' && (
                      <ArbitrageRobotPage
                        robotState={robotState}
                        updateRobotState={updateRobotState}
                        selectedPair={selectedPair}
                        setSelectedPair={setSelectedPair}
                        usdtBalance={balances.usdt_balance}
                        marketData={marketData}
                        usedMargin={(futuresUsedMargin || 0) + (futuresOrdersReserved || 0)}
                        availableBalance={usdtAvailableMargin}
                        refreshBreakdown={refreshBreakdown}
                        fetchBalances={fetchBalances}
                        fetchRobotState={fetchRobotState}
                      />
                    )}
                    
                    {tradingMode === 'wallet' && (
                      <WalletPage 
                        usdtBalance={balances.usdt_balance}
                        btcBalance={balances.btc_balance}
                        kycStatus={kycStatus}
                        transactions={transactions}
                        userStakes={userStakes}
                        calculateCurrentEarnings={calculateCurrentEarnings}
                        userAssets={assets}
                        marketData={marketData}
                        walletBreakdown={walletBreakdown}
                        setTradingMode={mode => setTradingMode(mode as TradingMode)}
                      />
                    )}
                    
                    {tradingMode === 'profile' && (
                      <ProfilePage
                        user={user}
                        onSignOut={signOut}
                        usdtBalance={balances.usdt_balance}
                        btcBalance={balances.btc_balance}
                        currentPrice={currentBtcPrice}
                        kycStatus={kycStatus}
                        updateKycStatus={updateKycStatus}
                        totalPortfolioValue={totalPortfolioValue}
                        totalPositionsPnl={unrealizedPnl}
                        onUpdatePassword={handleUpdatePassword}
                      />
                    )}
                    
                    {tradingMode === 'staking' && (
                      <StakingPage
                        usdtBalance={balances.usdt_balance}
                        btcBalance={balances.btc_balance}
                        currentBtcPrice={currentSelectedPairPrice}
                        availableBalance={actualAvailableBalance}
                        refreshBalances={fetchBalances}
                        refreshBreakdown={refreshBreakdown}
                      />
                    )}

                    {tradingMode === 'wheel' && (
                      <SpinTheWheel />
                    )}

                    {tradingMode === 'payment_sandbox' && (
                      <PaymentSandbox />
                    )}

                  </main>
                </>
              ) : (
                <Navigate to="/auth" replace />
              )
            } />

            <Route path="/admin" element={
              authLoading || (user && dbLoading) ? (
                <div className="flex min-h-screen items-center justify-center app-page-bg text-slate-400">Verifying administrator access...</div>
              ) : user ? (
                isAdmin ? <AdminCRMPage isAdmin /> : <Navigate to="/dashboard" replace />
              ) : (
                <Navigate to="/auth" replace />
              )
            } />

            <Route path="/admin/hierarchy" element={
              authLoading || (user && dbLoading) ? (
                <div className="flex min-h-screen items-center justify-center app-page-bg text-slate-400">Verifying administrator access...</div>
              ) : user ? (
                isAdmin ? <CRMHierarchyPage /> : <Navigate to="/dashboard" replace />
              ) : <Navigate to="/auth" replace />
            } />

            <Route path="/crm" element={
              authLoading || (user && dbLoading) ? (
                <div className="flex min-h-screen items-center justify-center app-page-bg text-slate-400">Verifying CRM access...</div>
              ) : user ? (
                isAdmin ? <Navigate to="/admin" replace /> :
                  crmRole === 'agent' || crmRole === 'retention' ? <CRMStaffPage role={crmRole} /> : <Navigate to="/dashboard" replace />
              ) : <Navigate to="/auth" replace />
            } />
            
            {/* Auth routes */}
            <Route path="/auth" element={
              user ? <Navigate to="/dashboard" replace /> : <SignInPage />
            } />
            <Route path="/auth/register" element={
              user ? <Navigate to="/dashboard" replace /> : <SignUpPage />
            } />
            <Route path="/signin" element={
              user ? <Navigate to="/dashboard" replace /> : <SignInPage />
            } />
            <Route path="/signup" element={
              user ? <Navigate to="/dashboard" replace /> : <SignUpPage />
            } />
            <Route path="/sign-up" element={
              user ? <Navigate to="/dashboard" replace /> : <SignUpPage />
            } />
            <Route path="/forgot-password" element={
              user ? <Navigate to="/dashboard" replace /> : <ForgotPasswordPage />
            } />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/trading-fees" element={<TradingFeesPage />} />

            {/* Test routes - only accessible when authenticated */}
            <Route path="/test/finnhub" element={
              user ? <FinnhubWebSocketTest /> : <Navigate to="/signin" replace />
            } />
          </Routes>
          
          {/* Auth Modal */}
          {showAuthModal && (
            <AuthModal onClose={() => setShowAuthModal(false)} />
          )}

          {/* Market Loading Screen */}
          {isPreparingMarkets && (
            <MarketLoadingScreen onComplete={() => setIsPreparingMarkets(false)} />
          )}

          {/* Loading Screen */}
          {(authLoading || isLoading) && !isRecoveryLink && !isPreparingMarkets && (
            <LoadingScreen />
          )}
        </div>
    </Router>
  );
}

function App() {
  return (
    <MarketDataProvider>
      <BybitDataProvider>
        <AppContent />
      </BybitDataProvider>
    </MarketDataProvider>
  );
}

export default App;
