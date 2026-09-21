import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Package, X, AlertCircle, Clock, CheckCircle, TrendingUp, TrendingDown, Loader2, ChevronLeft, ChevronRight, Edit2 } from 'lucide-react';
import { useFuturesTrading } from '../hooks/useFuturesTrading';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';
import { CFD_INSTRUMENTS } from '../constants/tradingPairs';
import { TradingMode } from '../App';
import { useMarketData } from '../contexts/MarketDataContext';
import { useBybitData } from '../contexts/BybitDataContext';
import { calculateDailySwapCost } from '../constants/swapConfig';
import { calculateSpreadCostFromNotional } from '../constants/spreadConfig';
import TakeProfitStopLossModal from './TakeProfitStopLossModal';
import { useFiatCurrency } from '../hooks/useFiatCurrency';
import {
  calculateDerivativeNotionalUsd,
  calculateDerivativePnlUsd,
  calculateLiveSwapCost
} from '../utils/derivativeCalculations';

interface FuturesMyOrdersProps {
  currentBtcPrice: number;
  futuresPositions: any[];
  onClosePosition: (positionId: string, livePrice?: number) => boolean | Promise<boolean> | void;
  updateBalances?: (updates: { usdt_balance?: number }) => Promise<void>;
  openOrders?: any[];
  onCancelOrder?: (orderId: string) => Promise<boolean>;
  onCancelAllOrders?: () => Promise<boolean>;
  balances?: { usdt_balance?: number };
  selectedPair: string;
  tradingMode: TradingMode;
  currentSelectedPairPrice: number;
  terminal?: boolean;
}

interface FuturesOrder {
  id: string;
  user_id: string;
  symbol: string;
  type: 'limit' | 'market' | 'stop';
  side: 'buy' | 'sell';
  price: number | null;
  amount: number;
  leverage: number;
  status: 'open' | 'filled' | 'cancelled';
  created_at: string;
  filled_at: string | null;
  position_id: string | null;
}

interface DesktopTableScrollerProps {
  children: React.ReactNode;
  variant?: 'default' | 'futures' | 'cfd';
}

const DesktopTableScroller: React.FC<DesktopTableScrollerProps> = ({ children, variant = 'default' }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const isGlassVariant = variant === 'futures' || variant === 'cfd';
  const arrowButtonSurfaceClass = variant === 'futures'
    ? 'app-control'
    : isGlassVariant
    ? 'app-control'
    : 'bg-slate-900/60';

  const updateScrollButtons = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;

    setCanScrollLeft(container.scrollLeft > 4);
    setCanScrollRight(container.scrollLeft + container.clientWidth < container.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    updateScrollButtons();

    const handleScroll = () => updateScrollButtons();
    const handleResize = () => updateScrollButtons();

    container.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [updateScrollButtons, children]);

  const scrollHorizontally = (direction: 'left' | 'right') => {
    const container = scrollRef.current;
    if (!container) return;

    const scrollAmount = Math.max(120, Math.round(container.clientWidth * 0.22));
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  return (
    <div className="hidden xl:flex flex-1 min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-end gap-2 px-4 pt-4">
        <button
          type="button"
          onClick={() => scrollHorizontally('left')}
          disabled={!canScrollLeft}
          aria-label="Scroll table left"
          className={`rounded-lg border border-slate-700/50 p-2 text-slate-300 transition-all hover:border-slate-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-35 ${arrowButtonSurfaceClass}`}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          onClick={() => scrollHorizontally('right')}
          disabled={!canScrollRight}
          aria-label="Scroll table right"
          className={`rounded-lg border border-slate-700/50 p-2 text-slate-300 transition-all hover:border-slate-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-35 ${arrowButtonSurfaceClass}`}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div
        ref={scrollRef}
        className="hide-scrollbar flex-1 min-h-0 overflow-auto px-4 py-4"
        translate="no"
      >
        {children}
      </div>
    </div>
  );
};


const FuturesMyOrders: React.FC<FuturesMyOrdersProps> = ({
  currentBtcPrice,
  futuresPositions,
  onClosePosition,
  updateBalances,
  openOrders = [],
  onCancelOrder,
  onCancelAllOrders,
  balances,
  selectedPair,
  tradingMode,
  currentSelectedPairPrice,
  terminal = false
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { formatFiat, formatFiatNumber, formatTradingPair } = useFiatCurrency();
  const { loadPositionHistory, positionHistory, updateStopLossTakeProfit, loading, error } = useFuturesTrading();
  const { isConnected: cfdConnected, getPriceBySymbol: getCfdPrice, connectionState: cfdConnectionState } = useMarketData();
  const { getPriceBySymbol: getCryptoPrice, isConnected: cryptoConnected, connectionState: cryptoConnectionState, getPriceDirection } = useBybitData();

  const isCfdMode = tradingMode === 'cfd';
  const isFuturesMode = tradingMode === 'futures';
  const isTerminalSurface = isFuturesMode || terminal;
  const realtimeConnected = isCfdMode ? cfdConnected : cryptoConnected;
  const connectionState = isCfdMode ? cfdConnectionState : cryptoConnectionState;

  const getPriceBySymbol = useCallback((symbol: string) => {
    if (isCfdMode) {
      return getCfdPrice(symbol);
    }
    return getCryptoPrice(symbol);
  }, [isCfdMode, getCfdPrice, getCryptoPrice]);

  const [flashingPrices, setFlashingPrices] = useState<Map<string, 'up' | 'down'>>(new Map());
  const previousPricesRef = useRef<Map<string, number>>(new Map());
  const [calculationTime, setCalculationTime] = useState(() => Date.now());
  const triggeredPositionsRef = useRef(new Set<string>());

  useEffect(() => {
    const clock = window.setInterval(() => setCalculationTime(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  const [activeTab, setActiveTab] = useState('positions');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const tabs = [
    { key: 'positions', label: t('futures.positions') },
    { key: 'openOrders', label: t('futures.openOrders') },
    { key: 'positionHistory', label: t('futures.positionHistory') }
  ];
  const isGlassMode = isFuturesMode || isCfdMode;
  const desktopTableVariant = isTerminalSurface ? 'futures' : isCfdMode ? 'cfd' : 'default';
  const rootSurfaceClass = isTerminalSurface
    ? 'bg-[#0b0e11]'
    : isCfdMode
    ? 'app-surface-primary'
    : 'bg-slate-800/30';
  const panelSurfaceClass = isTerminalSurface
    ? 'app-surface-primary'
    : isCfdMode
    ? 'app-surface-primary'
    : 'bg-slate-900/30';
  const cardSurfaceClass = isTerminalSurface
    ? 'app-surface-muted'
    : isCfdMode
    ? 'app-surface-muted'
    : 'bg-slate-950/30';
  const desktopSectionClass = isTerminalSurface
    ? 'flex flex-1 min-h-0 flex-col overflow-hidden bg-[#0b0e11]'
    : isCfdMode
    ? 'flex flex-1 min-h-0 flex-col xl:overflow-hidden xl:rounded-2xl app-surface-primary'
    : 'flex flex-1 min-h-0 flex-col xl:overflow-hidden xl:rounded-2xl xl:border xl:border-slate-700/40 xl:bg-slate-950/20';
  const desktopHeaderCellClass = 'px-4 pb-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500';
  const desktopCellClass = isGlassMode
    ? isTerminalSurface
      ? 'border-y border-white/[0.05] bg-white/[0.018] px-4 py-3 align-middle text-xs text-slate-300 first:border-l last:border-r'
      : 'border-y border-purple-500/15 bg-slate-950/55 px-4 py-4 align-middle text-sm text-slate-300 first:rounded-l-xl first:border-l last:rounded-r-xl last:border-r'
    : 'border-y border-slate-700/40 bg-slate-900/35 px-4 py-4 align-middle text-sm text-slate-300 first:rounded-l-xl first:border-l last:rounded-r-xl last:border-r';
  const tabActiveSurfaceClass = isTerminalSurface
    ? 'app-action-soft text-white shadow-lg shadow-sky-500/10'
    : isCfdMode
    ? 'app-action-soft text-white shadow-lg shadow-sky-500/10'
    : 'border border-purple-400/30 bg-gradient-to-r from-purple-500/20 to-violet-500/20 text-purple-300 shadow-lg shadow-purple-500/20';
  const tabInactiveSurfaceClass = isTerminalSurface
    ? 'text-slate-400 app-surface-hover hover:text-white'
    : isCfdMode
    ? 'text-slate-400 app-surface-hover hover:text-white'
    : 'text-slate-400 hover:bg-slate-700/50 hover:text-white';
  const mobileRowSurfaceClass = isTerminalSurface
    ? 'flex flex-wrap items-center justify-between rounded-xl app-surface-muted app-surface-hover px-3 py-3 shadow-lg transition-all duration-300 md:px-6 md:py-4'
    : isCfdMode
    ? 'flex flex-wrap items-center justify-between rounded-xl app-surface-muted app-surface-hover px-3 py-3 shadow-lg transition-all duration-300 md:px-6 md:py-4'
    : 'flex flex-wrap items-center justify-between bg-slate-900/30 px-3 md:px-6 py-3 md:py-4 rounded-xl hover:bg-slate-900/50 transition-all duration-300 border border-slate-600/30 hover:border-slate-500/50 shadow-lg';
  const paginationButtonSurfaceClass = isTerminalSurface
    ? 'rounded-lg app-control p-2 text-slate-400 transition-all duration-200 hover:text-white disabled:cursor-not-allowed disabled:opacity-50'
    : isCfdMode
    ? 'rounded-lg app-control p-2 text-slate-400 transition-all duration-200 hover:text-white disabled:cursor-not-allowed disabled:opacity-50'
    : 'p-2 rounded-lg bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200';
  const primaryActionButtonSurfaceClass = isTerminalSurface
    ? 'flex-1 app-action-primary py-2 md:py-3 rounded-lg md:rounded-xl text-sm md:text-base font-medium md:font-semibold transition-all duration-300 flex items-center justify-center gap-1 md:gap-2'
    : 'flex-1 app-action-primary py-2 md:py-3 rounded-lg md:rounded-xl text-sm md:text-base font-medium md:font-semibold transition-all duration-300 flex items-center justify-center gap-1 md:gap-2';
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [processingPositions, setProcessingPositions] = useState<Record<string, boolean>>({});

  // TP/SL Edit Modal State
  const [editTPSLModal, setEditTPSLModal] = useState<{
    isOpen: boolean;
    type: 'takeProfit' | 'stopLoss';
    position: any;
  } | null>(null);

  // Pagination state for Position History
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const getLotSize = (symbol: string): number => {
    if (tradingMode === 'cfd') {
      if (symbol.includes('XAU') || symbol.includes('XAG') || symbol.includes('WTI') || symbol.includes('BRENT')) {
        return 100;
      }
      return 100000;
    }
    return 1;
  };

  // Helper function to determine price precision based on symbol
const getPricePrecision = useCallback((symbol: string): number => {
  if (tradingMode === 'cfd') {
    // 🔹 Forex pairs with slash (EUR/USD, AUD/CAD, GBP/JPY, etc.)
    if (symbol.includes('/')) {
      return 5; // Show 5 decimals
    }

    // 🔹 Forex pairs without slash (EURUSD, GBPJPY, etc.)
    if (symbol.length === 6 && !symbol.includes('USDT')) {
      return 5;
    }

    // 🔹 Precious metals & energy
    if (
      symbol.startsWith('XAU') ||
      symbol.startsWith('XAG') ||
      symbol.startsWith('XPT') ||
      symbol.startsWith('XPD') ||
      symbol === 'WTIUSD' ||
      symbol === 'NGUSD'
    ) {
      return 3;
    }

    // 🔹 Industrial metals
    if (symbol.includes('COPPER') || symbol.includes('ALU') || symbol.includes('ZINC')) {
      return 3;
    }

    // 🔹 Stocks
    const stockSymbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NFLX', 'NVDA', 'BA', 'JPM'];
    if (stockSymbols.includes(symbol)) {
      return 2;
    }
  }

  // 🔹 Default (crypto, etc.)
  return 2;
}, [tradingMode]);


  // Helper function to determine instrument type
  const getInstrumentType = useCallback((symbol: string): string => {
    if (tradingMode === 'cfd') {
      // For CFD mode, look up the instrument in CFD_INSTRUMENTS
      const instrument = CFD_INSTRUMENTS.find(item => item.symbol === symbol);
      if (instrument) {
        return instrument.type;
      }
    }
    
    // For non-CFD modes, check if it's crypto
    if (symbol.endsWith('USDT') || symbol.endsWith('BTC') || symbol.endsWith('ETH')) {
      return 'crypto';
    }
    
    // Default fallback
    return 'other';
  }, [tradingMode]);

  const formatDisplaySymbol = (symbol: string) => formatTradingPair(symbol);
  const formatDisplayPrice = (symbol: string, price: number) => {
    const precision = getPricePrecision(symbol);
    return getInstrumentType(symbol) === 'forex'
      ? price.toFixed(precision)
      : `€${formatFiatNumber(price, precision)}`;
  };


  // Filter positions based on trading mode
  const filteredFuturesPositions = useMemo(() => {
    if (tradingMode === 'cfd') {
      // In CFD mode, show all non-crypto positions
      return futuresPositions.filter(position => getInstrumentType(position.symbol) !== 'crypto');
    } else { // tradingMode === 'futures'
      // In Futures mode, show all crypto positions (not just the selected pair)
      return futuresPositions.filter(position => getInstrumentType(position.symbol) === 'crypto');
    }
  }, [futuresPositions, tradingMode, getInstrumentType]);

  // Filter open orders based on selectedPair and tradingMode
  const filteredOpenOrders = useMemo(() => {
    if (tradingMode === 'cfd') {
      // In CFD mode, show all non-crypto orders
      return openOrders.filter(order => getInstrumentType(order.symbol) !== 'crypto');
    } else { // tradingMode === 'futures'
      // In Futures mode, filter by selectedPair and ensure it's a crypto pair
      return openOrders.filter(order => order.symbol === selectedPair && getInstrumentType(order.symbol) === 'crypto');
    }
  }, [openOrders, tradingMode, selectedPair, getInstrumentType]);

  // Calculate real-time PnL and ROI for each position
  const positionsWithLiveData = filteredFuturesPositions.map(position => {
    let livePrice = position.currentPrice || position.current_price || 0;
    const symbol = position.symbol;
    
    // Use market data from context - getPriceBySymbol handles symbol conversion
    const realtimePrice = getPriceBySymbol(symbol);
    if (realtimePrice > 0) {
      livePrice = realtimePrice;
      
    }
    
    const entryPrice = position.entryPrice || position.entry_price || 0;
    const amount = position.amount || 0;
    const leverage = position.leverage || 1;
    const margin = position.margin || 0;
    const side = position.side || 'long';
    const liquidationPrice = position.liquidationPrice || position.liquidation_price || 0;
    const accumulatedSwapCost = position.accumulated_swap_cost || position.accumulatedSwapCost || 0;
    const entrySpreadCost = position.spread_cost || position.spreadCost || 0;

    const positionSize = calculateDerivativeNotionalUsd(symbol, amount, livePrice || entryPrice, getPriceBySymbol);
    const dailySwapCost = calculateDailySwapCost(symbol, positionSize, leverage);
    const liveSwapCost = calculateLiveSwapCost(
      dailySwapCost,
      accumulatedSwapCost,
      position.createdAt || position.created_at,
      position.lastSwapChargeDate || position.last_swap_charge_date,
      position.swapAccruedAt || position.swap_accrued_at,
      calculationTime
    );
    const unrealizedPnl = calculateDerivativePnlUsd(
      symbol,
      side,
      entryPrice,
      livePrice,
      amount,
      getPriceBySymbol
    );
    const estimatedExitSpreadCost = calculateSpreadCostFromNotional(symbol, positionSize);
    const netUnrealizedPnl = Math.max(
      unrealizedPnl - entrySpreadCost - estimatedExitSpreadCost - liveSwapCost,
      -margin,
    );

    // Calculate ROI based on net PnL
    const roi = margin > 0 ? (netUnrealizedPnl / margin) * 100 : 0;
    
    return {
      ...position,
      currentPrice: livePrice,
      entryPrice,
      amount,
      leverage,
      margin,
      side,
      liquidationPrice,
      unrealizedPnl: netUnrealizedPnl,
      grossUnrealizedPnl: unrealizedPnl,
      accumulatedSwapCost: liveSwapCost,
      bookedSwapCost: accumulatedSwapCost,
      entrySpreadCost,
      estimatedExitSpreadCost,
      dailySwapCost,
      roi,
      takeProfit: position.takeProfit || position.tp_price || null,
      stopLoss: position.stopLoss || position.sl_price || null
    };
  });

  const visibleIds = new Set(positionsWithLiveData.map(position => position.id));
  const otherUnrealizedPnl = futuresPositions.reduce((sum, position) => (
    visibleIds.has(position.id) ? sum : sum + Number(position.unrealizedPnl || position.unrealized_pnl || 0)
  ), 0);
  const totalUnrealizedPnl = positionsWithLiveData.reduce((sum, pos) => sum + (pos.unrealizedPnl || 0), otherUnrealizedPnl);
  const totalMargin = futuresPositions.reduce((sum, position) => sum + Number(position.margin || 0), 0);
  const totalReservedOrderMargin = openOrders.reduce((sum, order) => (
    sum + Number(order.reservedMargin || order.reserved_margin || 0)
  ), 0);
  const walletBalance = balances?.usdt_balance || 0;
  const accountEquity = walletBalance + totalUnrealizedPnl;
  const estimatedAvailableMargin = Math.max(0, walletBalance - totalMargin - totalReservedOrderMargin);
  const runningPositions = positionsWithLiveData.length;

  useEffect(() => {
    const newFlashing = new Map<string, 'up' | 'down'>();

    positionsWithLiveData.forEach(position => {
      const prevPrice = previousPricesRef.current.get(position.id);
      const currentPrice = position.currentPrice || 0;
      if (prevPrice !== undefined && currentPrice !== prevPrice && currentPrice > 0) {
        newFlashing.set(position.id, currentPrice > prevPrice ? 'up' : 'down');
      }
      if (currentPrice > 0) {
        previousPricesRef.current.set(position.id, currentPrice);
      }
    });

    if (newFlashing.size > 0) {
      setFlashingPrices(prev => {
        const merged = new Map(prev);
        newFlashing.forEach((direction, id) => merged.set(id, direction));
        return merged;
      });

      const timeout = setTimeout(() => {
        setFlashingPrices(prev => {
          const updated = new Map(prev);
          newFlashing.forEach((_, id) => updated.delete(id));
          return updated;
        });
      }, 500);

      return () => clearTimeout(timeout);
    }
  }, [positionsWithLiveData]);

  const getConnectionIndicator = () => {
    switch (connectionState) {
      case 'connected':
        return <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" title="Connected" />;
      case 'connecting':
        return <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" title="Connecting..." />;
      case 'reconnecting':
        return <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" title="Reconnecting..." />;
      default:
        return <div className="w-2 h-2 bg-red-500 rounded-full" title="Disconnected" />;
    }
  };

  const positionHistoryData = positionHistory.filter((position) => (
    isCfdMode ? getInstrumentType(position.symbol) !== 'crypto' : getInstrumentType(position.symbol) === 'crypto'
  ));
  
  // Calculate pagination for position history
  const totalPages = Math.ceil(positionHistoryData.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentHistoryItems = positionHistoryData.slice(indexOfFirstItem, indexOfLastItem);
  
  // Reset to page 1 when switching tabs or when data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, positionHistoryData.length]);
  
  // Pagination handlers
  const handlePreviousPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  };
  
  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages));
  };

  // Keep the open history tab current when positions close in another session.
  useEffect(() => {
    if (activeTab !== 'positionHistory' || !user) return;
    const channel = supabase
      .channel(`derivative-history-${user.id}-${crypto.randomUUID()}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'futures_position_history', filter: `user_id=eq.${user.id}`,
      }, () => void loadPositionHistory())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void loadPositionHistory();
      });
    return () => { void supabase.removeChannel(channel); };
  }, [activeTab, loadPositionHistory, user]);

  // Update error message when error changes
  useEffect(() => {
    if (error) {
      setErrorMessage(error);
      
      // Clear error after 5 seconds
      const timer = setTimeout(() => {
        setErrorMessage(null);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Clear success message after 5 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Monitor positions for TP/SL triggers
  useEffect(() => {
    // CFD fills and risk exits are processed against server quotes by the engine.
    if (isCfdMode) return;
    positionsWithLiveData.forEach(position => {
      const { id, currentPrice, side, takeProfit, stopLoss } = position;

      if (!currentPrice || currentPrice <= 0) return;

      let shouldClose = false;
      let reason = '';

      if (takeProfit && takeProfit > 0) {
        if (side === 'long' && currentPrice >= takeProfit) {
          shouldClose = true;
          reason = 'Take Profit triggered';
        } else if (side === 'short' && currentPrice <= takeProfit) {
          shouldClose = true;
          reason = 'Take Profit triggered';
        }
      }

      if (!shouldClose && stopLoss && stopLoss > 0) {
        if (side === 'long' && currentPrice <= stopLoss) {
          shouldClose = true;
          reason = 'Stop Loss triggered';
        } else if (side === 'short' && currentPrice >= stopLoss) {
          shouldClose = true;
          reason = 'Stop Loss triggered';
        }
      }

      if (shouldClose && !processingPositions[id] && !triggeredPositionsRef.current.has(id)) {
        triggeredPositionsRef.current.add(id);
        void handleClosePosition(id, position.symbol).then((closed) => {
          if (closed) setSuccessMessage(reason);
          else triggeredPositionsRef.current.delete(id);
        });
      }
    });
  }, [positionsWithLiveData.map(p => `${p.id}-${p.currentPrice}`).join(','), processingPositions, isCfdMode]);

  const handleClosePosition = async (positionId: string, symbol?: string): Promise<boolean> => {
    try {
      setProcessingPositions(prev => ({ ...prev, [positionId]: true }));

      // Get live price for the position's symbol
      const livePrice = symbol ? getPriceBySymbol(symbol) : 0;
      const result = await Promise.resolve(onClosePosition(positionId, livePrice > 0 ? livePrice : undefined));
      if (result === false) throw new Error('Position could not be closed');
      setSuccessMessage('Position closed successfully');
      return true;
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to close position');
      return false;
    } finally {
      setProcessingPositions(prev => ({ ...prev, [positionId]: false }));
    }
  };

  const closeAllPositions = async () => {
    setIsProcessingAll(true);
    try {
      let failures = 0;
      for (const position of filteredFuturesPositions) {
        if (!await handleClosePosition(position.id, position.symbol)) failures += 1;
      }
      if (failures > 0) throw new Error(`${failures} position${failures === 1 ? '' : 's'} could not be closed`);
    } catch (error) {
      console.error('Error closing all positions:', error);
      setErrorMessage('Failed to close all positions');
    } finally {
      setIsProcessingAll(false);
    }
  };

  const handleUpdateTPSL = async (positionId: string, type: 'takeProfit' | 'stopLoss', price: number) => {
    try {
      // If price is 0, remove the TP/SL by setting it to null
      const value = price > 0 ? price : null;
      const updated = await updateStopLossTakeProfit(positionId, type === 'takeProfit'
        ? { takeProfit: value }
        : { stopLoss: value });
      if (!updated) throw new Error('The risk update was rejected');

      const action = value === null ? 'removed' : 'updated';
      setSuccessMessage(`${type === 'takeProfit' ? 'Take Profit' : 'Stop Loss'} ${action} successfully`);

    } catch (err: any) {
      setErrorMessage(err.message || `Failed to update ${type === 'takeProfit' ? 'Take Profit' : 'Stop Loss'}`);
    }
  };

  // Handle cancel order
  const handleCancelOrder = async (orderId: string) => {
    if (!onCancelOrder) return;
    
    try {
      const success = await onCancelOrder(orderId);
      
      if (success) {
        setSuccessMessage('Order cancelled successfully');
      } else {
        throw new Error('Failed to cancel order');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to cancel order');
    }
  };

  // Handle cancel all orders
  const handleCancelAllOrders = async () => {
    if (!onCancelAllOrders) return;
    
    setIsProcessingAll(true);
    try {
      const success = await onCancelAllOrders();
      
      if (success) {
        setSuccessMessage('All orders cancelled successfully');
      } else {
        throw new Error('Failed to cancel orders');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to cancel orders');
    } finally {
      setIsProcessingAll(false);
    }
  };

  // Format duration from seconds to human-readable format
  const formatDuration = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    if (seconds < 3600) {
      return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    }
    if (seconds < 86400) {
      return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    }
    return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
  };

  return (
    <div className={`${rootSurfaceClass} flex h-full min-h-0 flex-col ${isTerminalSurface ? '' : 'rounded-2xl border border-slate-700/50 p-3 shadow-2xl backdrop-blur-sm sm:p-4 lg:p-6 xl:p-8'}`} translate="no">
      {/* Status Messages */}
      {errorMessage && (
        <div className="mb-4 md:mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-3 md:p-4 flex items-center gap-2 md:gap-3">
          <AlertCircle size={20} className="text-red-400 flex-shrink-0" />
          <span className="text-red-400">{errorMessage}</span>
        </div>
      )}
      
      {successMessage && (
        <div className="mb-4 md:mb-6 bg-green-500/10 border border-green-500/30 rounded-xl p-3 md:p-4 flex items-center gap-2 md:gap-3">
          <CheckCircle size={20} className="text-green-400 flex-shrink-0" />
          <span className="text-green-400">{successMessage}</span>
        </div>
      )}

      {isTerminalSurface ? (
        <div className="shrink-0 border-b border-white/[0.07]">
          <div className="flex flex-col gap-3 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
            <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 xl:max-w-[720px]">
              <div>
                <dt className="text-[10px] uppercase tracking-[0.12em] text-slate-600">Equity</dt>
                <dd className="mt-1 font-mono text-sm font-medium tabular-nums text-white">{formatFiat(accountEquity)}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.12em] text-slate-600">Available margin</dt>
                <dd className="mt-1 font-mono text-sm font-medium tabular-nums text-slate-200">{formatFiat(estimatedAvailableMargin)}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.12em] text-slate-600">Unrealized PnL</dt>
                <dd className={`mt-1 font-mono text-sm font-medium tabular-nums ${totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatFiat(totalUnrealizedPnl)}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.12em] text-slate-600">Used margin</dt>
                <dd className="mt-1 font-mono text-sm font-medium tabular-nums text-slate-200">{formatFiat(totalMargin)}</dd>
              </div>
            </dl>

            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={closeAllPositions}
                disabled={isProcessingAll || filteredFuturesPositions.length === 0 || loading}
                className="rounded-md border border-white/[0.09] bg-white/[0.035] px-3 py-2 text-[11px] font-semibold text-slate-300 transition hover:border-white/[0.16] hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-35"
              >
                {isProcessingAll ? t('futures.processing') : t('futures.closeAllPositions')}
              </button>
              <button
                type="button"
                onClick={handleCancelAllOrders}
                disabled={isProcessingAll || filteredOpenOrders.length === 0 || loading || !onCancelAllOrders}
                className="rounded-md border border-rose-400/15 bg-rose-400/[0.06] px-3 py-2 text-[11px] font-semibold text-rose-300 transition hover:border-rose-400/30 hover:bg-rose-400/10 disabled:cursor-not-allowed disabled:border-white/[0.07] disabled:bg-white/[0.02] disabled:text-slate-600"
              >
                {isProcessingAll ? t('futures.processing') : t('futures.cancelAllOrders')}
              </button>
            </div>
          </div>

          <div className="flex min-w-0 gap-6 overflow-x-auto border-t border-white/[0.05] px-4 hide-scrollbar">
            {tabs.map((tab) => {
              const count = tab.key === 'positions' ? runningPositions : tab.key === 'openOrders' ? filteredOpenOrders.length : positionHistoryData.length;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex h-11 shrink-0 items-center gap-2 border-b-2 text-xs font-semibold transition ${activeTab === tab.key ? 'border-violet-400 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                >
                  {tab.label}<span className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
      <div className="mb-4 shrink-0 space-y-4 xl:mb-6">
        {/* Assets Section */}
        <div className={`rounded-xl border border-slate-600/30 p-3 shadow-lg sm:p-4 lg:p-6 ${panelSurfaceClass}`}>
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-cyan-400 md:mb-5 md:text-base">
            {getConnectionIndicator()}
            {t('futures.assets')}
          </div>

          <div className="space-y-3 md:space-y-4">
            <div className={`rounded-xl border border-slate-700/40 p-4 md:p-5 ${cardSurfaceClass}`}>
              <div className="mb-2 text-xs text-slate-400">{t('futures.overallBalance')}</div>
              <div className="break-words font-mono text-lg leading-tight text-white md:text-2xl">
                {formatFiat(totalMargin)}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className={`rounded-xl border border-slate-700/40 p-3 md:p-4 ${cardSurfaceClass}`}>
                <div className="mb-1 text-xs text-slate-400">{t('futures.available')}</div>
                <div className="break-words font-mono text-sm leading-tight text-white md:text-base">
                  {formatFiat(balances?.usdt_balance || 0)}
                </div>
              </div>
              <div className={`rounded-xl border border-slate-700/40 p-3 md:p-4 ${cardSurfaceClass}`}>
                <div className="mb-1 text-xs text-slate-400">{t('futures.unrealized')}</div>
                <div className={`break-words font-mono text-sm leading-tight md:text-base ${totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatFiat(totalUnrealizedPnl)}
                </div>
              </div>
              <div className={`rounded-xl border border-slate-700/40 p-3 md:p-4 ${cardSurfaceClass}`}>
                <div className="mb-1 text-xs text-slate-400">{t('futures.positions')}</div>
                <div className="font-mono text-sm text-white md:text-base">{runningPositions}</div>
              </div>
              <div className={`rounded-xl border border-slate-700/40 p-3 md:p-4 ${cardSurfaceClass}`}>
                <div className="mb-1 text-xs text-slate-400">{t('futures.orders')}</div>
                <div className="font-mono text-sm text-white md:text-base">{openOrders.length}</div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row md:mt-5">
            <button 
              onClick={closeAllPositions}
              disabled={isProcessingAll || filteredFuturesPositions.length === 0 || loading}
              className={primaryActionButtonSurfaceClass}
            >
              {isProcessingAll ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t('futures.processing')}
                </>
              ) : (
                t('futures.closeAllPositions')
              )}
            </button>
            <button 
              onClick={handleCancelAllOrders}
              disabled={isProcessingAll || filteredOpenOrders.length === 0 || loading || !onCancelAllOrders}
              className="flex-1 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 disabled:from-slate-700 disabled:to-slate-800 text-white py-2 md:py-3 rounded-lg md:rounded-xl text-sm md:text-base font-medium md:font-semibold transition-all duration-300 shadow-lg shadow-red-500/25 flex items-center justify-center gap-1 md:gap-2"
            >
              {isProcessingAll ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t('futures.processing')}
                </>
              ) : (
                t('futures.cancelAllOrders')
              )}
            </button>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar md:gap-4">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-300 md:px-4 md:py-2 md:text-sm ${
                  activeTab === tab.key
                    ? tabActiveSurfaceClass
                    : tabInactiveSurfaceClass
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      )}

      {activeTab === 'positions' && (
        <div className={desktopSectionClass} translate="no">
          {positionsWithLiveData.length > 0 ? (
            <>
              <DesktopTableScroller variant={desktopTableVariant}>
                <table className="w-full min-w-[1220px] border-separate border-spacing-y-3">
                  <thead>
                    <tr>
                      <th className={desktopHeaderCellClass}>{t('futures.symbol')}</th>
                      <th className={`${desktopHeaderCellClass} text-right`}>{t('futures.size')}</th>
                      <th className={desktopHeaderCellClass}>{t('futures.side')}</th>
                      <th className={`${desktopHeaderCellClass} text-right`}>{t('futures.entryPrice')}</th>
                      <th className={`${desktopHeaderCellClass} text-right`}>{t('futures.currentPrice')}</th>
                      <th className={`${desktopHeaderCellClass} text-right`}>{t('futures.liquidationPrice')}</th>
                      <th className={`${desktopHeaderCellClass} text-right`}>{t('futures.margin')}</th>
                      <th className={`${desktopHeaderCellClass} text-right`}>Swap Cost</th>
                      <th className={desktopHeaderCellClass}>TP / SL</th>
                      <th className={`${desktopHeaderCellClass} text-right`}>{t('futures.pnl')} / {t('futures.roi')}</th>
                      <th className={`${desktopHeaderCellClass} text-right`}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {positionsWithLiveData.map((position) => {
                      const liveSymbolPrice = getPriceBySymbol(position.symbol);
                      const hasLiveSymbolPrice = realtimeConnected && liveSymbolPrice > 0;

                      return (
                        <tr key={position.id}>
                          <td className={`${desktopCellClass} font-medium text-white`}>{formatDisplaySymbol(position.symbol)}</td>
                          <td className={`${desktopCellClass} text-right font-mono ${position.side === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>
                            {(position.amount || 0).toFixed(4)}
                          </td>
                          <td className={desktopCellClass}>
                            <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-bold ${
                              position.side === 'long' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400'
                            }`}>
                              {(position.side || 'long').toUpperCase()}
                            </span>
                          </td>
                          <td className={`${desktopCellClass} text-right font-mono`}>
                            {formatDisplayPrice(position.symbol, position.entryPrice || 0)}
                          </td>
                          <td className={`${desktopCellClass} text-right`}>
                            <div className="flex items-center justify-end gap-2">
                              {hasLiveSymbolPrice && (
                                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400"></div>
                              )}
                              <span className={`font-mono ${
                                flashingPrices.get(position.id) === 'up'
                                  ? 'animate-flash-green'
                                  : flashingPrices.get(position.id) === 'down'
                                  ? 'animate-flash-red'
                                  : !isCfdMode && getPriceDirection(position.symbol) === 'up'
                                  ? 'text-emerald-400'
                                  : !isCfdMode && getPriceDirection(position.symbol) === 'down'
                                  ? 'text-red-400'
                                  : hasLiveSymbolPrice
                                  ? 'text-emerald-300'
                                  : 'text-slate-300'
                              }`}>
                                {formatDisplayPrice(position.symbol, position.currentPrice || 0)}
                              </span>
                            </div>
                          </td>
                          <td className={`${desktopCellClass} text-right font-mono text-red-400`}>
                            {formatDisplayPrice(position.symbol, position.liquidationPrice || 0)}
                          </td>
                          <td className={`${desktopCellClass} text-right font-mono`}>
                            {formatFiat(position.margin || 0)}
                          </td>
                          <td className={`${desktopCellClass} text-right`}>
                            <span className="font-mono text-orange-400">
                              {formatFiat(position.accumulatedSwapCost || 0)}
                            </span>
                          </td>
                          <td className={desktopCellClass}>
                            <div className="flex flex-col gap-1">
                              {position.takeProfit ? (
                                <button
                                  onClick={() => setEditTPSLModal({ isOpen: true, type: 'takeProfit', position })}
                                  className="flex items-center gap-1 text-left text-emerald-400 transition-colors hover:text-emerald-300"
                                >
                                  <span className="font-mono text-xs">
                                    TP: {formatDisplayPrice(position.symbol, position.takeProfit)}
                                  </span>
                                  <Edit2 size={12} />
                                </button>
                              ) : (
                                <button
                                  onClick={() => setEditTPSLModal({ isOpen: true, type: 'takeProfit', position })}
                                  className="text-left text-xs text-slate-500 transition-colors hover:text-emerald-400"
                                >
                                  + TP
                                </button>
                              )}
                              {position.stopLoss ? (
                                <button
                                  onClick={() => setEditTPSLModal({ isOpen: true, type: 'stopLoss', position })}
                                  className="flex items-center gap-1 text-left text-red-400 transition-colors hover:text-red-300"
                                >
                                  <span className="font-mono text-xs">
                                    SL: {formatDisplayPrice(position.symbol, position.stopLoss)}
                                  </span>
                                  <Edit2 size={12} />
                                </button>
                              ) : (
                                <button
                                  onClick={() => setEditTPSLModal({ isOpen: true, type: 'stopLoss', position })}
                                  className="text-left text-xs text-slate-500 transition-colors hover:text-red-400"
                                >
                                  + SL
                                </button>
                              )}
                            </div>
                          </td>
                          <td className={`${desktopCellClass} text-right`}>
                            <div className={`font-mono ${(position.unrealizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {formatFiat(position.unrealizedPnl || 0)}
                            </div>
                            <div className={`text-xs ${(position.roi || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {(position.roi || 0).toFixed(2)}%
                            </div>
                          </td>
                          <td className={`${desktopCellClass} text-right`}>
                            <button
                              onClick={() => handleClosePosition(position.id, position.symbol)}
                              disabled={loading || processingPositions[position.id]}
                              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-400/10 hover:text-red-400 disabled:opacity-50"
                            >
                              {processingPositions[position.id] ? (
                                <div className="h-4 w-4 rounded-full border-2 border-slate-400/30 border-t-slate-400 animate-spin" />
                              ) : (
                                <X size={16} />
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </DesktopTableScroller>

              <div className="flex-1 min-h-0 space-y-3 overflow-auto xl:hidden" translate="no">
                {positionsWithLiveData.map((position) => (
                  <div key={position.id} className={mobileRowSurfaceClass}>
                    <div className="mb-2 w-1/2 sm:w-1/2 xl:mb-0 xl:w-auto">
                       <span className="text-white font-medium text-sm md:text-base">{formatDisplaySymbol(position.symbol)}</span>
                    </div>
                    <div className="mb-2 w-1/2 text-right sm:w-1/2 xl:mb-0 xl:w-auto xl:text-left">
                      <span className={`font-mono text-sm md:text-base ${position.side === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {(position.amount || 0).toFixed(4)}
                      </span>
                    </div>
                    <div className="mb-2 w-1/2 sm:w-1/2 xl:mb-0 xl:w-auto">
                      <span className={`text-xs md:text-sm font-bold px-2 md:px-3 py-1 rounded-lg ${
                        position.side === 'long' ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10'
                      }`}>
                        {(position.side || 'long').toUpperCase()}
                      </span>
                    </div>
                    <div className="mb-2 w-1/2 text-right sm:w-1/2 xl:mb-0 xl:w-auto xl:text-left">
                      <div className="text-xs text-slate-400 xl:hidden">{t('futures.entryPrice')}</div>
                       <span className="text-slate-300 font-mono text-sm md:text-base">{formatDisplayPrice(position.symbol, position.entryPrice || 0)}</span>
                    </div>
                    <div className="mb-2 w-1/2 sm:w-1/2 xl:mb-0 xl:w-auto">
                      <div className="text-xs text-slate-400 xl:hidden">{t('futures.currentPrice')}</div>
                      <div className="flex items-center gap-1">
                        {realtimeConnected && getPriceBySymbol && getPriceBySymbol(position.symbol) > 0 && (
                          <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></div>
                        )}
                        <span className={`font-mono text-sm md:text-base transition-colors ${
                          flashingPrices.get(position.id) === 'up'
                            ? 'animate-flash-green'
                            : flashingPrices.get(position.id) === 'down'
                            ? 'animate-flash-red'
                            : !isCfdMode && getPriceDirection(position.symbol) === 'up'
                            ? 'text-emerald-400'
                            : !isCfdMode && getPriceDirection(position.symbol) === 'down'
                            ? 'text-red-400'
                            : realtimeConnected && getPriceBySymbol && getPriceBySymbol(position.symbol) > 0
                            ? 'text-emerald-300'
                            : 'text-slate-300'
                        }`}>
                          {formatDisplayPrice(position.symbol, position.currentPrice || 0)}
                        </span>
                      </div>
                    </div>
                    <div className="mb-2 w-1/2 sm:w-1/2 xl:hidden">
                      <div className="text-xs text-slate-400">{t('futures.pnl')}</div>
                      <div className={`font-mono text-sm md:text-base ${(position.unrealizedPnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatFiat(position.unrealizedPnl || 0)}
                      </div>
                    </div>
                    <div className="mb-2 w-1/2 text-right sm:w-1/2 xl:mb-0 xl:w-auto">
                      <button
                        onClick={() => handleClosePosition(position.id, position.symbol)}
                        disabled={loading || processingPositions[position.id]}
                        className="text-slate-400 hover:text-red-400 transition-colors p-2 hover:bg-red-400/10 rounded-lg disabled:opacity-50"
                      >
                        {processingPositions[position.id] ? (
                          <div className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" />
                        ) : (
                          <X size={16} />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 flex-1">
              <Package size={64} className="mb-6 opacity-30" />
              <p className="text-lg">{t('futures.noPositionsFound')}</p>
              <p className="text-sm text-slate-600 mt-2">{t('futures.positionsWillAppear')}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'openOrders' && (
        <div className={desktopSectionClass} translate="no">
          {loadingOrders ? (
            <div className="flex justify-center py-8 flex-1">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : filteredOpenOrders.length > 0 ? (
            <>
              <DesktopTableScroller variant={desktopTableVariant}>
                <table className="w-full min-w-[980px] border-separate border-spacing-y-3">
                  <thead>
                    <tr>
                      <th className={desktopHeaderCellClass}>{t('common.date')}</th>
                      <th className={desktopHeaderCellClass}>{t('futures.symbol')}</th>
                      <th className={desktopHeaderCellClass}>{t('common.type')}</th>
                      <th className={desktopHeaderCellClass}>{t('futures.side')}</th>
                      <th className={`${desktopHeaderCellClass} text-right`}>{t('futures.price')}</th>
                      <th className={`${desktopHeaderCellClass} text-right`}>{t('futures.amount')}</th>
                      <th className={`${desktopHeaderCellClass} text-right`}>{t('futures.leverage')}</th>
                      <th className={desktopHeaderCellClass}>{t('common.status')}</th>
                      <th className={`${desktopHeaderCellClass} text-right`}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOpenOrders.map((order) => (
                      <tr key={order.id}>
                        <td className={`${desktopCellClass} font-mono text-xs`}>
                          {new Date(order.createdAt || order.created_at).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                         <td className={`${desktopCellClass} font-medium text-white`}>{formatDisplaySymbol(order.symbol)}</td>
                        <td className={`${desktopCellClass} capitalize`}>{order.type}</td>
                        <td className={desktopCellClass}>
                          <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-bold ${
                            order.side === 'buy' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400'
                          }`}>
                            {order.side.toUpperCase()}
                          </span>
                        </td>
                        <td className={`${desktopCellClass} text-right font-mono`}>
                          {order.price ? formatDisplayPrice(order.symbol, order.price) : 'Market'}
                        </td>
                        <td className={`${desktopCellClass} text-right font-mono`}>
                          {(order.amount || 0).toFixed(4)}
                        </td>
                        <td className={`${desktopCellClass} text-right font-mono`}>
                          {order.leverage}x
                        </td>
                        <td className={desktopCellClass}>
                          <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-bold ${isCfdMode ? 'bg-purple-400/10 text-purple-300' : 'bg-blue-400/10 text-blue-400'}`}>
                            OPEN
                          </span>
                        </td>
                        <td className={`${desktopCellClass} text-right`}>
                          <button 
                            onClick={() => handleCancelOrder(order.id)}
                            disabled={loading}
                            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-400/10 hover:text-red-400 disabled:opacity-50"
                          >
                            <X size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DesktopTableScroller>

              <div className="flex-1 min-h-0 space-y-3 overflow-auto xl:hidden" translate="no">
                {filteredOpenOrders.map((order) => (
                  <div key={order.id} className={mobileRowSurfaceClass}>
                    <div className="mb-2 flex w-full items-center justify-between xl:mb-0 xl:w-auto">
                      <span className="text-slate-300 text-xs md:text-sm font-mono">
                        {new Date(order.createdAt || order.created_at).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                      <span className="text-blue-400 text-xs xl:hidden">Open</span>
                    </div>
                    
                    <div className="mb-2 w-1/2 sm:w-1/2 xl:mb-0 xl:w-auto">
                       <span className="text-white font-medium text-sm md:text-base">{formatDisplaySymbol(order.symbol)}</span>
                    </div>
                    
                    <div className="mb-2 w-1/2 text-right sm:w-1/2 xl:mb-0 xl:w-auto xl:text-left">
                      <span className={`text-xs md:text-sm font-bold px-2 py-1 rounded-lg ${
                        order.side === 'buy' ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10'
                      }`}>
                        {order.side.toUpperCase()}
                      </span>
                    </div>
                    
                    <div className="mb-2 w-1/3 xl:mb-0 xl:w-auto">
                      <div className="text-xs text-slate-400 xl:hidden">{t('common.type')}</div>
                      <span className="text-slate-300 text-xs md:text-sm capitalize">{order.type}</span>
                    </div>
                    
                    <div className="mb-2 w-1/3 xl:mb-0 xl:w-auto">
                      <div className="text-xs text-slate-400 xl:hidden">{t('futures.price')}</div>
                       <span className="text-slate-300 font-mono text-xs md:text-sm">{order.price ? formatDisplayPrice(order.symbol, order.price) : 'Market'}</span>
                    </div>
                    
                    <div className="mb-2 w-1/3 xl:mb-0 xl:w-auto">
                      <div className="text-xs text-slate-400 xl:hidden">{t('futures.amount')}</div>
                      <span className="text-slate-300 font-mono text-xs md:text-sm">{(order.amount || 0).toFixed(4)}</span>
                    </div>
                    
                    <div className="mb-2 w-1/3 xl:mb-0 xl:w-auto">
                      <div className="text-xs text-slate-400 xl:hidden">{t('futures.leverage')}</div>
                      <span className="text-slate-300 font-mono text-xs md:text-sm">{order.leverage}x</span>
                    </div>
                    
                    <div className="mb-2 w-1/3 text-right xl:mb-0 xl:w-auto">
                      <button 
                        onClick={() => handleCancelOrder(order.id)}
                        disabled={loading}
                        className="text-slate-400 hover:text-red-400 transition-colors p-2 hover:bg-red-400/10 rounded-lg disabled:opacity-50"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 flex-1">
              <Clock size={64} className="mb-6 opacity-30" />
              <p className="text-lg">{t('futures.noOpenOrders')}</p>
              <p className="text-sm text-slate-600 mt-2">{t('futures.ordersWillAppear')}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'positionHistory' && (
        <div className={desktopSectionClass} translate="no">
          {loading ? (
            <div className="flex justify-center py-8 flex-1">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : currentHistoryItems.length > 0 ? (
            <>
              <DesktopTableScroller variant={desktopTableVariant}>
                <table className="w-full min-w-[980px] border-separate border-spacing-y-3">
                  <thead>
                    <tr>
                      <th className={desktopHeaderCellClass}>{t('common.date')}</th>
                      <th className={desktopHeaderCellClass}>{t('futures.symbol')}</th>
                      <th className={desktopHeaderCellClass}>{t('futures.side')}</th>
                      <th className={`${desktopHeaderCellClass} text-right`}>{t('futures.entryPrice')}</th>
                      <th className={`${desktopHeaderCellClass} text-right`}>{t('futures.exitPrice')}</th>
                      <th className={`${desktopHeaderCellClass} text-right`}>{t('futures.amount')}</th>
                      <th className={desktopHeaderCellClass}>{t('futures.duration')}</th>
                      <th className={`${desktopHeaderCellClass} text-right`}>Swap Cost</th>
                      <th className={`${desktopHeaderCellClass} text-right`}>{t('futures.pnl')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentHistoryItems.map((position) => (
                      <tr key={position.id}>
                        <td className={`${desktopCellClass} font-mono text-xs`}>
                          {position.closeTime
                            ? new Date(position.closeTime).toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'N/A'}
                        </td>
                         <td className={`${desktopCellClass} font-medium text-white`}>{formatDisplaySymbol(position.symbol)}</td>
                        <td className={desktopCellClass}>
                          <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-bold ${
                            position.side === 'long'
                              ? 'bg-emerald-400/10 text-emerald-400'
                              : 'bg-red-400/10 text-red-400'
                          }`}>
                            {position.side.toUpperCase()}
                          </span>
                        </td>
                        <td className={`${desktopCellClass} text-right font-mono`}>
                          {formatDisplayPrice(position.symbol, position.entryPrice)}
                        </td>
                        <td className={`${desktopCellClass} text-right font-mono`}>
                          {formatDisplayPrice(position.symbol, position.exitPrice)}
                        </td>
                        <td className={`${desktopCellClass} text-right font-mono`}>
                          {position.amount.toFixed(4)}
                        </td>
                        <td className={desktopCellClass}>
                          {position.durationSeconds ? formatDuration(position.durationSeconds) : 'N/A'}
                        </td>
                        <td className={`${desktopCellClass} text-right`}>
                          <div className="font-mono text-xs text-orange-400">
                            {formatFiat(position.accumulatedSwapCost || 0)}
                          </div>
                          {position.totalSwapDays && position.totalSwapDays > 0 && (
                            <div className="text-xs text-slate-500">
                              {position.totalSwapDays} {position.totalSwapDays === 1 ? 'day' : 'days'}
                            </div>
                          )}
                        </td>
                        <td className={`${desktopCellClass} text-right`}>
                          <div className="flex items-center justify-end gap-1">
                            {position.pnl >= 0 ? (
                              <TrendingUp size={14} className="text-emerald-400" />
                            ) : (
                              <TrendingDown size={14} className="text-red-400" />
                            )}
                            <span className={`font-mono ${
                              position.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}>
                              {formatFiat(position.pnl)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DesktopTableScroller>

              <div className="flex-1 min-h-0 space-y-3 overflow-auto xl:hidden" translate="no">
                {currentHistoryItems.map((position) => (
                  <div key={position.id} className={mobileRowSurfaceClass}>
                    <div className="mb-2 flex w-full items-center justify-between xl:mb-0 xl:w-auto">
                      <span className="text-slate-300 text-xs md:text-sm font-mono">
                        {position.closeTime
                          ? new Date(position.closeTime).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'N/A'}
                      </span>
                      <span
                        className={`text-xs xl:hidden font-bold px-2 py-1 rounded-lg ${
                          position.pnl >= 0
                            ? 'text-emerald-400 bg-emerald-400/10'
                            : 'text-red-400 bg-red-400/10'
                        }`}
                      >
                        {position.pnl >= 0 ? 'PROFIT' : 'LOSS'}
                      </span>
                    </div>

                    <div className="mb-2 w-1/2 sm:w-1/2 xl:mb-0 xl:w-auto">
                      <span className="text-white font-medium text-sm md:text-base">
                         {formatDisplaySymbol(position.symbol)}
                      </span>
                    </div>

                    <div className="mb-2 w-1/2 text-right sm:w-1/2 xl:mb-0 xl:w-auto xl:text-left">
                      <span
                        className={`text-xs md:text-sm font-bold px-2 py-1 rounded-lg ${
                          position.side === 'long'
                            ? 'text-emerald-400 bg-emerald-400/10'
                            : 'text-red-400 bg-red-400/10'
                        }`}
                      >
                        {position.side.toUpperCase()}
                      </span>
                    </div>

                    <div className="mb-2 w-1/3 xl:mb-0 xl:w-auto">
                      <span className="text-slate-300 font-mono text-xs md:text-sm">
                        {formatDisplayPrice(position.symbol, position.entryPrice)}
                      </span>
                    </div>
                    <div className="mb-2 w-1/3 xl:mb-0 xl:w-auto">
                      <span className="text-slate-300 font-mono text-xs md:text-sm">
                        {formatDisplayPrice(position.symbol, position.exitPrice)}
                      </span>
                    </div>

                    <div className="mb-2 w-1/3 xl:mb-0 xl:w-auto">
                      <span className="text-slate-300 font-mono text-xs md:text-sm">
                        {position.amount.toFixed(4)}
                      </span>
                    </div>

                    <div className="mb-2 w-1/2 sm:w-1/2 xl:mb-0 xl:w-auto">
                      <span className="text-slate-300 text-xs md:text-sm">
                        {position.durationSeconds
                          ? formatDuration(position.durationSeconds)
                          : 'N/A'}
                      </span>
                    </div>

                    <div className="mb-2 w-1/2 text-right sm:w-1/2 xl:mb-0 xl:w-auto">
                      <div className="flex items-center gap-1 justify-end md:justify-start">
                        {position.pnl >= 0 ? (
                          <TrendingUp size={14} className="text-emerald-400" />
                        ) : (
                          <TrendingDown size={14} className="text-red-400" />
                        )}
                        <span
                          className={`font-mono text-xs md:text-sm ${
                            position.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {formatFiat(position.pnl)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="mt-4 flex flex-col gap-3 border-t border-slate-700/50 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-slate-400">
                    {t('common.showing')} {indexOfFirstItem + 1}-{Math.min(indexOfLastItem, positionHistoryData.length)} {t('common.of')} {positionHistoryData.length}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePreviousPage}
                      disabled={currentPage === 1}
                      className={paginationButtonSurfaceClass}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-sm text-slate-300 px-3">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      onClick={handleNextPage}
                      disabled={currentPage === totalPages}
                      className={paginationButtonSurfaceClass}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 flex-1">
              <Package size={64} className="mb-6 opacity-30" />
              <p className="text-lg">{t('futures.noPositionHistory')}</p>
              <p className="text-sm text-slate-600 mt-2">{t('futures.historyWillAppear')}</p>
            </div>
          )}
        </div>
      )}

      {/* TP/SL Edit Modal */}
      {editTPSLModal && (
        <TakeProfitStopLossModal
          allowLimitExecution={false}
          isOpen={editTPSLModal.isOpen}
          onClose={() => setEditTPSLModal(null)}
          type={editTPSLModal.type}
          side={editTPSLModal.position.side}
          entryPrice={editTPSLModal.position.entryPrice}
          amount={editTPSLModal.position.amount / getLotSize(editTPSLModal.position.symbol)}
          leverage={editTPSLModal.position.leverage}
          lotSize={getLotSize(editTPSLModal.position.symbol)}
          priceIsUsd={getInstrumentType(editTPSLModal.position.symbol) !== 'forex'}
          variant="horizontal"
          onConfirm={(price) => {
            handleUpdateTPSL(editTPSLModal.position.id, editTPSLModal.type, price);
            setEditTPSLModal(null);
          }}
        />
      )}
    </div>
  );
};

export default FuturesMyOrders;
