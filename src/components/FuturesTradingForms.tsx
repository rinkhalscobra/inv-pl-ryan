import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { AlertTriangle, CheckCircle, Plus, CreditCard as Edit2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useBybitData } from '../contexts/BybitDataContext';
import { usePrevious } from '../hooks/usePrevious';
import { calculateSpreadCost, formatSpreadDisplay } from '../constants/spreadConfig';
import TakeProfitStopLossModal from './TakeProfitStopLossModal';
import { useFiatCurrency } from '../hooks/useFiatCurrency';

interface FuturesTradingFormsProps {
  usdtBalance: number;
  availableBalance?: number;
  maxAllowedLeverage?: number;
  minAllowedLeverage?: number;
  surfaceVariant?: 'default' | 'futures';
  selectedPair: string;
  calculateLiquidationPrice: (
    side: 'long' | 'short',
    entryPrice: number,
    leverage: number,
    marginType: 'isolated' | 'cross',
    amount?: number,
    totalBalance?: number
  ) => number;
  onFuturesTrade: (
    symbol: string,
    side: 'long' | 'short', 
    amount: number, 
    leverage: number, 
    marginType: 'isolated' | 'cross',
    stopLoss?: { trigger_price: number; execution_type: 'market' | 'limit'; execution_price?: number },
    takeProfit?: { trigger_price: number; execution_type: 'market' | 'limit'; execution_price?: number },
    orderType?: 'market' | 'limit',
    price?: number
  ) => void;
}

const FuturesTradingForms: React.FC<FuturesTradingFormsProps> = ({
  usdtBalance,
  availableBalance,
  maxAllowedLeverage = 100,
  minAllowedLeverage = 1,
  surfaceVariant = 'default',
  selectedPair,
  calculateLiquidationPrice,
  onFuturesTrade
}) => {
  const { t } = useTranslation();
  const { convertUsdToEur, formatFiat, formatFiatPrice } = useFiatCurrency();
  const { getPriceBySymbol, isConnected: isRealtimeConnected, connectionState, getPriceDirection } = useBybitData();
  const [marginType, setMarginType] = useState<'isolated' | 'cross'>('isolated');
  const isLeverageLocked = minAllowedLeverage === maxAllowedLeverage;
  const [leverage, setLeverage] = useState(
    isLeverageLocked ? minAllowedLeverage : Math.max(minAllowedLeverage, Math.min(10, maxAllowedLeverage))
  );
  const [orderType, setOrderType] = useState<'limit' | 'market'>('market');
  const [longAmount, setLongAmount] = useState('');
  const [shortAmount, setShortAmount] = useState('');
  const [longPercentage, setLongPercentage] = useState(0);
  const [shortPercentage, setShortPercentage] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);

  const livePairPrice = useMemo(() => {
    return getPriceBySymbol(selectedPair);
  }, [getPriceBySymbol, selectedPair]);

  const previousPrice = usePrevious(livePairPrice);
  const isFuturesSurface = surfaceVariant === 'futures';
  const panelSurfaceClass = isFuturesSurface
    ? 'app-surface-primary'
    : 'bg-slate-800/30';
  const controlSurfaceClass = isFuturesSurface
    ? 'app-control'
    : 'bg-slate-900/50';
  const controlHoverSurfaceClass = isFuturesSurface
    ? 'app-surface-hover'
    : 'hover:bg-slate-700/50';
  const optionSurfaceClass = isFuturesSurface
    ? 'app-control'
    : 'bg-slate-800/50';
  const optionHoverSurfaceClass = isFuturesSurface
    ? 'app-surface-hover'
    : 'hover:bg-slate-700/50';
  const softOptionSurfaceClass = isFuturesSurface
    ? 'app-surface-muted'
    : 'bg-slate-700/50';
  const softOptionHoverSurfaceClass = isFuturesSurface
    ? 'app-surface-hover'
    : 'hover:bg-slate-600/50';

  useEffect(() => {
    if (previousPrice !== undefined && livePairPrice !== previousPrice && livePairPrice > 0) {
      const direction = livePairPrice > previousPrice ? 'up' : 'down';
      setPriceFlash(direction);

      const timeout = setTimeout(() => {
        setPriceFlash(null);
      }, 500);

      return () => clearTimeout(timeout);
    }
  }, [livePairPrice, previousPrice]);

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

  const priceDirection = getPriceDirection(selectedPair);
  const priceFlashClass = priceFlash === 'up'
    ? 'animate-flash-green'
    : priceFlash === 'down'
    ? 'animate-flash-red'
    : '';
  const priceColorClass = priceDirection === 'up'
    ? 'text-emerald-400'
    : priceDirection === 'down'
    ? 'text-red-400'
    : 'text-white';

  // Calculate amount from percentage for long positions
  const calculateLongAmountFromPercentage = useCallback((percentage: number) => {
    if (percentage <= 0) return '';
    
    if (livePairPrice <= 0) return '';
    
    const targetMargin = usdtBalance * (percentage / 100);
    const amount = (targetMargin * leverage) / livePairPrice;
    
    return amount.toFixed(6);
  }, [usdtBalance, leverage, livePairPrice]);

  // Calculate amount from percentage for short positions
  const calculateShortAmountFromPercentage = useCallback((percentage: number) => {
    if (percentage <= 0) return '';
    
    if (livePairPrice <= 0) return '';
    
    const targetMargin = usdtBalance * (percentage / 100);
    const amount = (targetMargin * leverage) / livePairPrice;
    
    return amount.toFixed(6);
  }, [usdtBalance, leverage, livePairPrice]);

  // Stop Loss / Take Profit states
  const [longStopLoss, setLongStopLoss] = useState<{ trigger_price: number; execution_type: 'market' | 'limit'; execution_price?: number } | null>(null);
  const [longTakeProfit, setLongTakeProfit] = useState<{ trigger_price: number; execution_type: 'market' | 'limit'; execution_price?: number } | null>(null);
  const [shortStopLoss, setShortStopLoss] = useState<{ trigger_price: number; execution_type: 'market' | 'limit'; execution_price?: number } | null>(null);
  const [shortTakeProfit, setShortTakeProfit] = useState<{ trigger_price: number; execution_type: 'market' | 'limit'; execution_price?: number } | null>(null);

  // Modal states
  const [showLongSLModal, setShowLongSLModal] = useState(false);
  const [showLongTPModal, setShowLongTPModal] = useState(false);
  const [showShortSLModal, setShowShortSLModal] = useState(false);
  const [showShortTPModal, setShowShortTPModal] = useState(false);

  // Generate leverage options based on max allowed leverage
  const generateLeverageOptions = () => {
    if (isLeverageLocked) return [minAllowedLeverage];
    const baseOptions = [1, 2, 3, 5, 10, 20, 25, 30, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000];
    const filtered = baseOptions.filter(option => option >= minAllowedLeverage && option <= maxAllowedLeverage);
    if (filtered.length === 0) return [minAllowedLeverage];
    return filtered;
  };

  const leverageOptions = generateLeverageOptions();
  const percentageOptions = [25, 50, 75, 100];

  useEffect(() => {
    if (isLeverageLocked) {
      setLeverage(minAllowedLeverage);
    } else if (leverage < minAllowedLeverage) {
      setLeverage(minAllowedLeverage);
    } else if (leverage > maxAllowedLeverage) {
      setLeverage(maxAllowedLeverage);
    }
  }, [minAllowedLeverage, maxAllowedLeverage, isLeverageLocked]);

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

  // Real-time recalculation when leverage, price, or balance changes
  useEffect(() => {
    if (longPercentage > 0) {
      const newAmount = calculateLongAmountFromPercentage(longPercentage);
      setLongAmount(newAmount);
    }
  }, [leverage, longPercentage, calculateLongAmountFromPercentage]);

  useEffect(() => {
    if (shortPercentage > 0) {
      const newAmount = calculateShortAmountFromPercentage(shortPercentage);
      setShortAmount(newAmount);
    }
  }, [leverage, shortPercentage, calculateShortAmountFromPercentage]);

  // Calculate estimated PnL for stop loss and take profit
  const calculateEstimatedPnl = (
    side: 'long' | 'short',
    entryPrice: number,
    triggerPrice: number,
    amount: number,
    leverage: number
  ): number => {
    if (side === 'long') {
      return (triggerPrice - entryPrice) * amount * leverage;
    } else {
      return (entryPrice - triggerPrice) * amount * leverage;
    }
  };

  const handleLong = () => {
    const amount = parseFloat(longAmount);
    
    if (!amount || amount <= 0) {
      setErrorMessage('Please enter a valid amount');
      return;
    }

    const notionalValue = amount * livePairPrice;
    const requiredMargin = notionalValue / leverage;
    
    if (requiredMargin > (availableBalance !== undefined ? availableBalance : usdtBalance)) {
      setErrorMessage('Insufficient available balance');
      return;
    }

    // Always pass the live price to ensure the parent component has it
    onFuturesTrade(selectedPair, 'long', amount, leverage, marginType, longStopLoss || undefined, longTakeProfit || undefined, orderType, livePairPrice);
    setSuccessMessage(`Long position opened successfully for ${amount} ${selectedPair.replace('USDT', '')}`);
    setLongAmount('');
    setLongPercentage(0);
    setLongStopLoss(null);
    setLongTakeProfit(null);
  };

  const handleShort = () => {
    const amount = parseFloat(shortAmount);
    
    if (!amount || amount <= 0) {
      setErrorMessage('Please enter a valid amount');
      return;
    }

    const notionalValue = amount * livePairPrice;
    const requiredMargin = notionalValue / leverage;
    
    if (requiredMargin > (availableBalance !== undefined ? availableBalance : usdtBalance)) {
      setErrorMessage('Insufficient available balance');
      return;
    }

    // Always pass the live price to ensure the parent component has it
    onFuturesTrade(selectedPair, 'short', amount, leverage, marginType, shortStopLoss || undefined, shortTakeProfit || undefined, orderType, livePairPrice);
    setSuccessMessage(`Short position opened successfully for ${amount} ${selectedPair.replace('USDT', '')}`);
    setShortAmount('');
    setShortPercentage(0);
    setShortStopLoss(null);
    setShortTakeProfit(null);
  };

  const handleLongPercentage = (percentage: number) => {
    setLongPercentage(percentage);
    const newAmount = calculateLongAmountFromPercentage(percentage);
    setLongAmount(newAmount);
  };

  const handleShortPercentage = (percentage: number) => {
    setShortPercentage(percentage);
    const newAmount = calculateShortAmountFromPercentage(percentage);
    setShortAmount(newAmount);
  };

  const calculateLongCost = () => {
    const amount = parseFloat(longAmount) || 0;
    const notionalValue = amount * livePairPrice;
    const requiredMargin = notionalValue / leverage;
    const spreadCost = amount > 0 ? calculateSpreadCost(selectedPair, livePairPrice, amount, 1) : 0;
    return requiredMargin + spreadCost;
  };

  const calculateShortCost = () => {
    const amount = parseFloat(shortAmount) || 0;
    const notionalValue = amount * livePairPrice;
    const requiredMargin = notionalValue / leverage;
    const spreadCost = amount > 0 ? calculateSpreadCost(selectedPair, livePairPrice, amount, 1) : 0;
    return requiredMargin + spreadCost;
  };


  const longSpreadInfo = longAmount ? formatSpreadDisplay(selectedPair, livePairPrice, parseFloat(longAmount), 1) : null;
  const shortSpreadInfo = shortAmount ? formatSpreadDisplay(selectedPair, livePairPrice, parseFloat(shortAmount), 1) : null;

  return (
    <div className={`${panelSurfaceClass} rounded-2xl border border-slate-700/50 p-3 shadow-2xl backdrop-blur-sm sm:p-4 lg:p-6 xl:p-8`}>
      {/* Status Messages */}
      {errorMessage && (
        <div className="mb-4 md:mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-3 md:p-4 flex items-center gap-2 md:gap-3">
          <AlertTriangle size={20} className="text-red-400 flex-shrink-0" />
          <span className="text-red-400">{errorMessage}</span>
        </div>
      )}
      
      {successMessage && (
        <div className="mb-4 md:mb-6 bg-green-500/10 border border-green-500/30 rounded-xl p-3 md:p-4 flex items-center gap-2 md:gap-3">
          <CheckCircle size={20} className="text-green-400 flex-shrink-0" />
          <span className="text-green-400">{successMessage}</span>
        </div>
      )}

      {/* Margin Type and Leverage Controls */}
      <div className="mb-4 flex flex-col gap-4 md:mb-8 lg:flex-row lg:items-start lg:justify-between xl:items-center">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center md:gap-4 lg:gap-6">
          <div className={`flex w-full flex-wrap rounded-xl border border-slate-600/30 p-1 ${controlSurfaceClass} sm:inline-flex sm:w-auto sm:flex-nowrap sm:items-center sm:self-start`}>
            <button
              onClick={() => setMarginType('isolated')}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-300 sm:min-w-[108px] sm:flex-none sm:px-4 sm:text-center sm:text-sm ${
                marginType === 'isolated'
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-purple-500/20'
                  : `text-slate-400 hover:text-white ${controlHoverSurfaceClass}`
              }`}
            >
              {t('trading.isolated')}
            </button>
            <button
              onClick={() => setMarginType('cross')}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-300 sm:min-w-[108px] sm:flex-none sm:px-4 sm:text-center sm:text-sm ${
                marginType === 'cross'
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-purple-500/20'
                  : `text-slate-400 hover:text-white ${controlHoverSurfaceClass}`
              }`}
            >
              {t('trading.cross')}
            </button>
          </div>
          
          <div className="bg-gradient-to-r from-indigo-400 via-purple-400 to-fuchsia-400 bg-clip-text text-xl font-bold text-transparent sm:text-2xl">
            {leverage}x
          </div>
        </div>

        {/* Leverage Selector */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center md:gap-4">
          <span className="text-slate-400 text-xs md:text-sm">{t('common.leverage')}</span>
          {isLeverageLocked ? (
            <div className="flex items-center gap-2">
              <div className="px-3 py-2 text-xs rounded-lg font-medium bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-purple-500/20">
                {minAllowedLeverage}x
              </div>
              <span className="text-slate-500 text-xs">(Fixed)</span>
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar xl:grid xl:w-full xl:max-w-[520px] xl:grid-cols-6 xl:overflow-visible xl:pb-0">
              {leverageOptions.map((lev) => (
                <button
                  key={lev}
                  onClick={() => setLeverage(Math.min(lev, maxAllowedLeverage))}
                  className={`shrink-0 min-w-[56px] px-3 py-2 text-xs rounded-lg font-medium transition-all duration-300 xl:min-w-0 xl:w-full ${
                    leverage === lev
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-purple-500/20 transform scale-105'
                      : `${optionSurfaceClass} border border-slate-600/30 text-slate-400 hover:text-white ${optionHoverSurfaceClass}`
                  }`}
                >
                  {lev}x
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Order Type Tabs */}
      <div className="mb-4 flex flex-wrap gap-2 md:mb-8 md:gap-3">
        <button
          onClick={() => setOrderType('market')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-all duration-300 ${
            orderType === 'market' 
              ? 'border border-purple-500/35 bg-gradient-to-r from-indigo-500/24 via-purple-500/24 to-fuchsia-500/18 text-white shadow-lg shadow-purple-500/15' 
              : `text-slate-400 hover:text-white ${controlHoverSurfaceClass}`
          }`}
        >
          {t('trading.market')}
        </button>
        <button
          onClick={() => setOrderType('limit')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-all duration-300 ${
            orderType === 'limit' 
              ? 'border border-purple-500/35 bg-gradient-to-r from-indigo-500/24 via-purple-500/24 to-fuchsia-500/18 text-white shadow-lg shadow-purple-500/15' 
              : `text-slate-400 hover:text-white ${controlHoverSurfaceClass}`
          }`}
        >
          {t('trading.limit')}
        </button>
      </div>

      <div className="flex flex-col gap-6 xl:flex-row xl:gap-8">
        {/* Long Form */}
        <div className="flex-1">
          <div className="mb-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-400">
              <span>{t('trading.availableMargin')}</span>
              <span className="flex items-center gap-2 text-emerald-400 font-mono">
                {formatFiat(availableBalance !== undefined ? availableBalance : usdtBalance)}
                <div className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse"></div>
              </span>
            </div>
          </div>

          <div className="space-y-6">
            {/* Price Input */}
            <div className="mb-3">
              <label className="flex items-center gap-2 text-sm text-slate-400 mb-1 md:mb-3">
                {getConnectionIndicator()}
                {t('common.price')} (EUR)
              </label>
              <input
                type="text"
                value={convertUsdToEur(livePairPrice).toFixed(4)}
                className={`w-full bg-transparent px-4 py-3 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all hover:border-slate-500/50 font-mono ${priceColorClass} ${priceFlashClass}`}
                readOnly
              />
            </div>

            {/* Amount Input */}
            <div className="mb-3">
              <label className="block text-sm text-slate-400 mb-1 md:mb-3">
                {t('trading.amount')} ({selectedPair.replace('USDT', '')})
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Minimum 0.0001"
                  value={longAmount}
                  onChange={(e) => {
                    setLongAmount(e.target.value);
                    setLongPercentage(0);
                  }}
                  className="w-full bg-transparent text-white px-4 py-3 pr-16 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all hover:border-slate-500/50 font-mono"
                  translate="no"
                />
                <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 text-sm font-medium" translate="no">
                  {selectedPair.replace('USDT', '')}
                </span>
              </div>
            </div>

            {/* Percentage Buttons */}
            <div className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4 md:gap-2">
              {percentageOptions.map((percentage) => (
                <button
                  key={percentage}
                  onClick={() => handleLongPercentage(percentage)}
                  className={`py-2 text-xs rounded-lg font-medium transition-all duration-300 ${
                    longPercentage === percentage 
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-purple-500/20 transform scale-105' 
                      : `${softOptionSurfaceClass} border border-slate-600/30 text-slate-400 hover:text-white ${softOptionHoverSurfaceClass}`
                  }`}
                >
                  {percentage}%
                </button>
              ))}
            </div>

            {/* Stop Loss & Take Profit */}
            {longAmount && parseFloat(longAmount) > 0 && (
            <div className="border-t border-slate-700/50 pt-3 md:pt-6 mb-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => setShowLongSLModal(true)}
                  className={`flex-1 py-3 rounded-lg border transition-all text-sm font-medium ${
                    longStopLoss
                      ? 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30'
                      : `${optionSurfaceClass} border-slate-600 text-slate-400 ${optionHoverSurfaceClass}`
                  }`}
                >
                  {longStopLoss ? <Edit2 size={14} className="inline mr-2" /> : <Plus size={14} className="inline mr-2" />}
                  {t('trading.stopLoss')}
                  {longStopLoss && (
                    <>
                      <span className="ml-2 font-mono">{formatFiatPrice(longStopLoss.trigger_price)}</span>
                      <X
                        size={14}
                        className="inline ml-2"
                        onClick={(e) => { e.stopPropagation(); setLongStopLoss(null); }}
                      />
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowLongTPModal(true)}
                  className={`flex-1 py-3 rounded-lg border transition-all text-sm font-medium ${
                    longTakeProfit
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/30'
                      : `${optionSurfaceClass} border-slate-600 text-slate-400 ${optionHoverSurfaceClass}`
                  }`}
                >
                  {longTakeProfit ? <Edit2 size={14} className="inline mr-2" /> : <Plus size={14} className="inline mr-2" />}
                  {t('trading.takeProfit')}
                  {longTakeProfit && (
                    <>
                      <span className="ml-2 font-mono">{formatFiatPrice(longTakeProfit.trigger_price)}</span>
                      <X
                        size={14}
                        className="inline ml-2"
                        onClick={(e) => { e.stopPropagation(); setLongTakeProfit(null); }}
                      />
                    </>
                  )}
                </button>
              </div>
            </div>
            )}

            <div className="mb-3">
              <div className="space-y-2">
                <div className="flex flex-wrap justify-between gap-2 text-sm text-slate-400">
                  <span>{t('trading.requiredMargin')}</span>
                  <span className="text-slate-300 font-mono" translate="no">{formatFiat(calculateLongCost())}</span>
                </div>
                {longSpreadInfo && (
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                    <span>Spread Cost ({longSpreadInfo.percentage})</span>
                    <span className="text-orange-400 font-mono" translate="no">{formatFiat(parseFloat(longSpreadInfo.cost))}</span>
                  </div>
                )}
                <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                  <span>{t('trading.liquidationPrice')}</span>
                  <span className="text-red-400 font-mono" translate="no">{formatFiatPrice(calculateLiquidationPrice('long', livePairPrice, leverage, marginType))}</span>
                </div>
              </div>
            </div>

            <button 
              onClick={handleLong}
              className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white py-4 rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-emerald-500/25 transform hover:scale-105"
            >
              {t('futures.buyLong')}
            </button>
          </div>
        </div>

        {/* Short Form */}
        <div className="flex-1">
          <div className="mb-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-400">
              <span>{t('trading.availableMargin')}</span>
              <span className="flex items-center gap-2 text-emerald-400 font-mono">
                {formatFiat(availableBalance !== undefined ? availableBalance : usdtBalance)}
                <div className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse"></div>
              </span>
            </div>
          </div>

          <div className="space-y-6">
            {/* Price Input */}
            <div className="mb-3">
              <label className="flex items-center gap-2 text-sm text-slate-400 mb-1 md:mb-3">
                {getConnectionIndicator()}
                {t('common.price')} (EUR)
              </label>
              <input
                id="short-price-input"
                type="text"
                value={convertUsdToEur(livePairPrice).toFixed(4)}
                className={`w-full bg-transparent px-4 py-3 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all hover:border-slate-500/50 font-mono ${priceColorClass} ${priceFlashClass}`}
                readOnly
              />
            </div>

            {/* Amount Input */}
            <div className="mb-3">
              <label className="block text-sm text-slate-400 mb-1 md:mb-3">
                {t('trading.amount')} ({selectedPair.replace('USDT', '')})
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Minimum 0.0001"
                  value={shortAmount}
                  onChange={(e) => {
                    setShortAmount(e.target.value);
                    setShortPercentage(0);
                  }}
                  className="w-full bg-transparent text-white px-4 py-3 pr-16 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all hover:border-slate-500/50 font-mono"
                  translate="no"
                />
                <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 text-sm font-medium" translate="no">
                  {selectedPair.replace('USDT', '')}
                </span>
              </div>
            </div>

            {/* Percentage Buttons */}
            <div className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4 md:gap-2">
              {percentageOptions.map((percentage) => (
                <button
                  key={percentage}
                  onClick={() => handleShortPercentage(percentage)}
                  className={`py-2 text-xs rounded-lg font-medium transition-all duration-300 ${
                    shortPercentage === percentage 
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-purple-500/20 transform scale-105' 
                      : `${softOptionSurfaceClass} border border-slate-600/30 text-slate-400 hover:text-white ${softOptionHoverSurfaceClass}`
                  }`}
                >
                  {percentage}%
                </button>
              ))}
            </div>

            {/* Stop Loss & Take Profit */}
            {shortAmount && parseFloat(shortAmount) > 0 && (
            <div className="border-t border-slate-700/50 pt-3 md:pt-6 mb-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => setShowShortSLModal(true)}
                  className={`flex-1 py-3 rounded-lg border transition-all text-sm font-medium ${
                    shortStopLoss
                      ? 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30'
                      : `${optionSurfaceClass} border-slate-600 text-slate-400 ${optionHoverSurfaceClass}`
                  }`}
                >
                  {shortStopLoss ? <Edit2 size={14} className="inline mr-2" /> : <Plus size={14} className="inline mr-2" />}
                  {t('trading.stopLoss')}
                  {shortStopLoss && (
                    <>
                      <span className="ml-2 font-mono">{formatFiatPrice(shortStopLoss.trigger_price)}</span>
                      <X
                        size={14}
                        className="inline ml-2"
                        onClick={(e) => { e.stopPropagation(); setShortStopLoss(null); }}
                      />
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowShortTPModal(true)}
                  className={`flex-1 py-3 rounded-lg border transition-all text-sm font-medium ${
                    shortTakeProfit
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/30'
                      : `${optionSurfaceClass} border-slate-600 text-slate-400 ${optionHoverSurfaceClass}`
                  }`}
                >
                  {shortTakeProfit ? <Edit2 size={14} className="inline mr-2" /> : <Plus size={14} className="inline mr-2" />}
                  {t('trading.takeProfit')}
                  {shortTakeProfit && (
                    <>
                      <span className="ml-2 font-mono">{formatFiatPrice(shortTakeProfit.trigger_price)}</span>
                      <X
                        size={14}
                        className="inline ml-2"
                        onClick={(e) => { e.stopPropagation(); setShortTakeProfit(null); }}
                      />
                    </>
                  )}
                </button>
              </div>
            </div>
            )}

            <div className="mb-3">
              <div className="space-y-2">
                <div className="flex flex-wrap justify-between gap-2 text-sm text-slate-400">
                  <span>{t('trading.requiredMargin')}</span>
                  <span className="text-slate-300 font-mono" translate="no">{formatFiat(calculateShortCost())}</span>
                </div>
                {shortSpreadInfo && (
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                    <span>Spread Cost ({shortSpreadInfo.percentage})</span>
                    <span className="text-orange-400 font-mono" translate="no">{formatFiat(parseFloat(shortSpreadInfo.cost))}</span>
                  </div>
                )}
                <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                  <span>{t('trading.liquidationPrice')}</span>
                  <span className="text-red-400 font-mono" translate="no">{formatFiatPrice(calculateLiquidationPrice('short', livePairPrice, leverage, marginType))}</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleShort}
              className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white py-4 rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-red-500/25 transform hover:scale-105"
            >
              {t('futures.sellShort')}
            </button>
          </div>
        </div>
      </div>

      {/* Take Profit / Stop Loss Modals */}
      <TakeProfitStopLossModal
        isOpen={showLongSLModal}
        onClose={() => setShowLongSLModal(false)}
        type="stopLoss"
        side="long"
        entryPrice={livePairPrice}
        amount={parseFloat(longAmount) || 0}
        leverage={leverage}
        onConfirm={(price, type, execPrice) => {
          setLongStopLoss({ trigger_price: price, execution_type: type, execution_price: execPrice });
        }}
      />

      <TakeProfitStopLossModal
        isOpen={showLongTPModal}
        onClose={() => setShowLongTPModal(false)}
        type="takeProfit"
        side="long"
        entryPrice={livePairPrice}
        amount={parseFloat(longAmount) || 0}
        leverage={leverage}
        onConfirm={(price, type, execPrice) => {
          setLongTakeProfit({ trigger_price: price, execution_type: type, execution_price: execPrice });
        }}
      />

      <TakeProfitStopLossModal
        isOpen={showShortSLModal}
        onClose={() => setShowShortSLModal(false)}
        type="stopLoss"
        side="short"
        entryPrice={livePairPrice}
        amount={parseFloat(shortAmount) || 0}
        leverage={leverage}
        onConfirm={(price, type, execPrice) => {
          setShortStopLoss({ trigger_price: price, execution_type: type, execution_price: execPrice });
        }}
      />

      <TakeProfitStopLossModal
        isOpen={showShortTPModal}
        onClose={() => setShowShortTPModal(false)}
        type="takeProfit"
        side="short"
        entryPrice={livePairPrice}
        amount={parseFloat(shortAmount) || 0}
        leverage={leverage}
        onConfirm={(price, type, execPrice) => {
          setShortTakeProfit({ trigger_price: price, execution_type: type, execution_price: execPrice });
        }}
      />
    </div>
  );
};

export default FuturesTradingForms;
