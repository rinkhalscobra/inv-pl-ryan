import React, { useState, useCallback, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Plus, Edit2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CFD_INSTRUMENTS } from '../constants/tradingPairs';
import { useMarketData } from '../contexts/MarketDataContext';
import { getInstrumentTypeFromSymbol } from '../constants/tradingTiers';
import { calculateSpreadCost, formatSpreadDisplay } from '../constants/spreadConfig';
import TakeProfitStopLossModal from './TakeProfitStopLossModal';

interface CFDTradingFormsProps {
  usdtBalance: number;
  availableBalance?: number;
  surfaceVariant?: 'default' | 'cfd';
  maxForexLeverage: number;
  minForexLeverage?: number;
  maxCommoditiesLeverage: number;
  minCommoditiesLeverage?: number;
  maxStocksLeverage: number;
  minStocksLeverage?: number;
  selectedPair: string;
  currentPrice: number;
  userCfdTier?: string;
  calculateLiquidationPrice: (
    side: 'long' | 'short',
    entryPrice: number,
    leverage: number,
    marginType: 'isolated' | 'cross',
    amount?: number,
    totalBalance?: number
  ) => number;
  onCFDTrade: (
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

const CFDTradingForms: React.FC<CFDTradingFormsProps> = ({
  usdtBalance,
  availableBalance,
  surfaceVariant = 'default',
  maxForexLeverage,
  minForexLeverage = 1,
  maxCommoditiesLeverage,
  minCommoditiesLeverage = 1,
  maxStocksLeverage,
  minStocksLeverage = 1,
  selectedPair,
  currentPrice,
  userCfdTier,
  calculateLiquidationPrice,
  onCFDTrade
}) => {
  const { t } = useTranslation();
  const { getSnapshotPriceBySymbol, refreshSnapshot, lastSnapshotTime, isConnected: isLiveDataConnected, marketData } = useMarketData();
  const [marginType, setMarginType] = useState<'isolated' | 'cross'>('isolated');
  const isCfdSurface = surfaceVariant === 'cfd';
  const panelSurfaceClass = isCfdSurface
    ? 'app-surface-primary'
    : 'bg-slate-800/30';
  const cardSurfaceClass = isCfdSurface
    ? 'app-surface-muted'
    : 'bg-slate-900/50';
  const controlSurfaceClass = isCfdSurface
    ? 'app-control'
    : 'bg-slate-900/50';
  const controlHoverSurfaceClass = isCfdSurface
    ? 'app-surface-hover'
    : 'hover:bg-slate-700/50';
  const optionSurfaceClass = isCfdSurface
    ? 'app-control'
    : 'bg-slate-800/50';
  const optionHoverSurfaceClass = isCfdSurface
    ? 'app-surface-hover'
    : 'hover:bg-slate-700/50';
  const softOptionSurfaceClass = isCfdSurface
    ? 'app-surface-muted'
    : 'bg-slate-700/50';
  const softOptionHoverSurfaceClass = isCfdSurface
    ? 'app-surface-hover'
    : 'hover:bg-slate-600/50';
  const tierSurfaceClass = isCfdSurface
    ? 'app-surface-muted'
    : 'bg-slate-800/50';

  const instrumentType = getInstrumentTypeFromSymbol(selectedPair);
  const maxAllowedLeverage = instrumentType === 'forex' ? maxForexLeverage :
                              instrumentType === 'commodity' ? maxCommoditiesLeverage :
                              (instrumentType === 'index' || instrumentType === 'etf') ? maxStocksLeverage :
                              maxStocksLeverage;
  const minAllowedLeverage = instrumentType === 'forex' ? minForexLeverage :
                              instrumentType === 'commodity' ? minCommoditiesLeverage :
                              (instrumentType === 'index' || instrumentType === 'etf') ? minStocksLeverage :
                              minStocksLeverage;
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

  // Get current price for the selected CFD instrument using snapshot
  const getCurrentPriceForCFD = useCallback(() => {
    // Use snapshot price for stable trading experience
    const snapshotPrice = getSnapshotPriceBySymbol(selectedPair);
    return snapshotPrice > 0 ? snapshotPrice : currentPrice;
  }, [selectedPair, getSnapshotPriceBySymbol, currentPrice]);

  const livePairPrice = getCurrentPriceForCFD();
  const selectedInstrument = CFD_INSTRUMENTS.find(item => item.symbol === selectedPair);
  const hasVerifiedPrice = Number.isFinite(livePairPrice) && livePairPrice > 0;
  const canTradeSelectedInstrument = selectedInstrument?.tradable !== false && hasVerifiedPrice;

const getLotSize = (symbol: string): number => {
  const instrument = CFD_INSTRUMENTS.find(item => item.symbol === symbol);

  if (instrument && instrument.type === 'forex') {
    // Special handling for JPY pairs
    if (symbol.endsWith("JPY")) {
      return 1000; // Use 10,000 units for JPY pairs
    }
    return 100000; // Default standard forex lot size
  } else if (instrument && instrument.type === 'commodity') {
    switch (symbol) {
      case 'XAG/USD': return 5000;
      case 'XAUUSD':
      case 'XAU/USD': return 100;
      case 'XPTUSD':
      case 'XPT/USD': return 100;
      case 'XPDUSD':
      case 'XPD/USD': return 100;
      case 'NATGAS/USD': return 10000;
      case 'BCO/USD': return 1000;
      case 'WTICO/USD': return 1000;
      case 'CORN/USD': return 5000;
      case 'WHEAT/USD': return 5000;
      case 'SUGAR/USD': return 112000;
      default: return 1;
    }
  } else if (instrument && instrument.type === 'stock') {
    return 100;
  }

  return 1;
};


  // Calculate amount from percentage for long positions
  const calculateLongAmountFromPercentage = useCallback((percentage: number) => {
    if (percentage <= 0) return '';

    const priceToUse = livePairPrice;
    if (!Number.isFinite(priceToUse) || priceToUse <= 0) return '';
    const lotSize = getLotSize(selectedPair);
    const balanceToUse = availableBalance !== undefined ? availableBalance : usdtBalance;
    const targetMargin = balanceToUse * (percentage / 100);
    const amount = (targetMargin * leverage) / (priceToUse * lotSize);

    // Ensure amount meets minimum trade size
    const minTradeSize = getMinTradeSize();
    const adjustedAmount = Math.max(amount, minTradeSize);

    return adjustedAmount.toFixed(getInstrumentType() === 'Stock' ? 0 : 5);
  }, [availableBalance, usdtBalance, leverage, livePairPrice, selectedPair]);

  // Calculate amount from percentage for short positions
  const calculateShortAmountFromPercentage = useCallback((percentage: number) => {
    if (percentage <= 0) return '';

    const priceToUse = livePairPrice;
    if (!Number.isFinite(priceToUse) || priceToUse <= 0) return '';
    const lotSize = getLotSize(selectedPair);
    const balanceToUse = availableBalance !== undefined ? availableBalance : usdtBalance;
    const targetMargin = balanceToUse * (percentage / 100);
    const amount = (targetMargin * leverage) / (priceToUse * lotSize);

    // Ensure amount meets minimum trade size
    const minTradeSize = getMinTradeSize();
    const adjustedAmount = Math.max(amount, minTradeSize);

    return adjustedAmount.toFixed(getInstrumentType() === 'Stock' ? 0 : 5);
  }, [availableBalance, usdtBalance, leverage, livePairPrice, selectedPair]);

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

  const generateLeverageOptions = () => {
    if (isLeverageLocked) return [minAllowedLeverage];
    const baseOptions = [1, 2, 3, 5, 10, 20, 25, 30, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000];
    const filtered = baseOptions.filter(option => option >= minAllowedLeverage && option <= maxAllowedLeverage);
    if (filtered.length === 0) return [minAllowedLeverage];
    return filtered;
  };

  const leverageOptions = generateLeverageOptions();
  const percentageOptions = [25, 50, 75, 100];

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'Starter': return '📊';
      case 'Plus': return '📈';
      case 'Advanced': return '✅';
      case 'Pro': return '🏆';
      case 'Elite': return '👑';
      default: return '📊';
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'Starter': return 'text-slate-400';
      case 'Plus': return 'text-blue-400';
      case 'Advanced': return 'text-green-400';
      case 'Pro': return 'text-amber-400';
      case 'Elite': return 'text-emerald-400';
      default: return 'text-slate-400';
    }
  };

  // Format required margin with dynamic decimal places
  const formatRequiredMargin = (value: number): string => {
    if (value === 0) return '0.00';
    if (value >= 1) return value.toFixed(2);
    if (value >= 0.01) return value.toFixed(4);
    if (value >= 0.0001) return value.toFixed(6);
    return value.toFixed(8);
  };

  // Clear error and success messages after 5 seconds
  useEffect(() => {
    if (isLeverageLocked) {
      setLeverage(minAllowedLeverage);
    } else if (leverage < minAllowedLeverage) {
      setLeverage(minAllowedLeverage);
    } else if (leverage > maxAllowedLeverage) {
      setLeverage(maxAllowedLeverage);
    }
  }, [minAllowedLeverage, maxAllowedLeverage, isLeverageLocked, selectedPair]);

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
  }, [leverage, livePairPrice, selectedPair, usdtBalance, longPercentage, calculateLongAmountFromPercentage]);

  useEffect(() => {
    if (shortPercentage > 0) {
      const newAmount = calculateShortAmountFromPercentage(shortPercentage);
      setShortAmount(newAmount);
    }
  }, [leverage, livePairPrice, selectedPair, usdtBalance, shortPercentage, calculateShortAmountFromPercentage]);

  // Get instrument type for display
  const getInstrumentType = () => {
    // Look up the instrument in CFD_INSTRUMENTS to get its type
    const instrument = CFD_INSTRUMENTS.find(item => item.symbol === selectedPair);
    if (instrument) {
      // Capitalize the first letter for display
      return instrument.type.charAt(0).toUpperCase() + instrument.type.slice(1);
    }
    
    // Default fallback
    return 'Commodity';
  };

  // Get price precision based on instrument
  const getPricePrecision = useCallback(() => {
    switch (selectedPair) {
      case 'XAUUSD':
      case 'XAUEUR':
        return 4; // Gold: 4 decimal places (e.g., 2300.5000)
      case 'XAGUSD':
      case 'XAGEUR':
        return 5; // Silver: 5 decimal places (e.g., 28.50000)
      case 'XPTUSD':
      case 'XPDUSD':
        return 4; // Platinum/Palladium: 4 decimal places
      case 'WTICOUSD':
      case 'BCOUSD':
        return 4; // Oil: 4 decimal places (e.g., 75.2500)
      case 'NG':
        return 5; // Natural Gas: 5 decimal places (e.g., 2.50000)
      case 'CUCUSD':
        return 5; // Copper: 5 decimal places
      case 'CORN':
      case 'WHEAT':
        return 4; // Grains: 4 decimal places (e.g., 600.2500)
      case 'SUGAR':
        return 5; // Soft commodities: 5 decimal places (e.g., 20.50000)
      default:
        return 4; // Default: 4 decimal places for CFD instruments
    }
  }, [selectedPair]);

  // Get unit label for display
  const getUnitLabel = () => {
    // Use professional trading terminology - all CFD instruments are traded in lots
    return 'Lots';
  };

  // Get contract size based on instrument type
  const getContractSize = () => {
    // Contract size is always 1 for the margin calculation
    // The lot size multiplier is handled separately in getLotSize()
    return 1;
  };

  // Get minimum trade size
  const getMinTradeSize = () => {
    // Unified minimum trade size: 0.01 lots across all CFD instruments
    return 0.01; // 0.01 lots for all instruments
  };


  const getSpreadCost = (amount: number = 1) => {
    const lotSize = getLotSize(selectedPair);
    return calculateSpreadCost(selectedPair, livePairPrice, amount, lotSize);
  };

  const getSpreadDisplay = (amount: number = 1) => {
    const lotSize = getLotSize(selectedPair);
    return formatSpreadDisplay(selectedPair, livePairPrice, amount, lotSize);
  };

  // Calculate estimated PnL for stop loss and take profit
  const calculateEstimatedPnl = (
    side: 'long' | 'short',
    entryPrice: number,
    triggerPrice: number,
    amount: number,
    leverage: number
  ): number => {
    const lotSize = getLotSize(selectedPair);
    
    if (side === 'long') {
      // For long positions: (triggerPrice - entryPrice) * amount * lotSize
      return (triggerPrice - entryPrice) * amount * lotSize;
    } else {
      // For short positions: (entryPrice - triggerPrice) * amount * lotSize
      return (entryPrice - triggerPrice) * amount * lotSize;
    }
  };

  const handleLong = () => {
    if (selectedInstrument?.tradable === false) {
      setErrorMessage('This market is listed for reference and is not currently tradable.');
      return;
    }
    if (!hasVerifiedPrice) {
      setErrorMessage('A verified live price is required before placing an order.');
      return;
    }
    const amount = parseFloat(longAmount);
    if (!amount || amount < getMinTradeSize()) {
      setErrorMessage(`Minimum trade size is ${getMinTradeSize()}`);
      return;
    }

    const priceToUse = livePairPrice;
    const lotSize = getLotSize(selectedPair);
    const notionalValue = amount * priceToUse * lotSize;
    const requiredMargin = notionalValue / leverage;
    
    if (requiredMargin > (availableBalance !== undefined ? availableBalance : usdtBalance)) {
      setErrorMessage('Insufficient available balance');
      return;
    }

    onCFDTrade(selectedPair, 'long', amount * lotSize, leverage, marginType, longStopLoss || undefined, longTakeProfit || undefined, orderType, priceToUse);
    setSuccessMessage(`Long position opened successfully for ${amount} lots`);
    setLongAmount('');
    setLongPercentage(0);
    setLongStopLoss(null);
    setLongTakeProfit(null);
  };

  const handleShort = () => {
    if (selectedInstrument?.tradable === false) {
      setErrorMessage('This market is listed for reference and is not currently tradable.');
      return;
    }
    if (!hasVerifiedPrice) {
      setErrorMessage('A verified live price is required before placing an order.');
      return;
    }
    const amount = parseFloat(shortAmount);
    if (!amount || amount < getMinTradeSize()) {
      setErrorMessage(`Minimum trade size is ${getMinTradeSize()}`);
      return;
    }

    const priceToUse = livePairPrice;
    const lotSize = getLotSize(selectedPair);
    const notionalValue = amount * priceToUse * lotSize;
    const requiredMargin = notionalValue / leverage;
    
    if (requiredMargin > (availableBalance !== undefined ? availableBalance : usdtBalance)) {
      setErrorMessage('Insufficient available balance');
      return;
    }

    onCFDTrade(selectedPair, 'short', amount * lotSize, leverage, marginType, shortStopLoss || undefined, shortTakeProfit || undefined, orderType, priceToUse);
    setSuccessMessage(`Short position opened successfully for ${amount} lots`);
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
    const priceToUse = livePairPrice;
    const lotSize = getLotSize(selectedPair);
    const notionalValue = amount * priceToUse * lotSize;
    const requiredMargin = notionalValue / leverage;
    const spreadCost = amount > 0 ? getSpreadCost(amount) : 0;
    return requiredMargin + spreadCost;
  };

  const calculateShortCost = () => {
    const amount = parseFloat(shortAmount) || 0;
    const priceToUse = livePairPrice;
    const lotSize = getLotSize(selectedPair);
    const notionalValue = amount * priceToUse * lotSize;
    const requiredMargin = notionalValue / leverage;
    const spreadCost = amount > 0 ? getSpreadCost(amount) : 0;
    return requiredMargin + spreadCost;
  };


  const displayInstrumentType = getInstrumentType();
  const lotSize = getLotSize(selectedPair);
  const minTradeSize = getMinTradeSize();

  const longSpreadInfo = longAmount ? getSpreadDisplay(parseFloat(longAmount)) : null;
  const shortSpreadInfo = shortAmount ? getSpreadDisplay(parseFloat(shortAmount)) : null;

  return (
    <div className={`${panelSurfaceClass} rounded-2xl border border-slate-700/50 p-3 shadow-2xl backdrop-blur-sm md:p-8`}>
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

      {!canTradeSelectedInstrument && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-300 md:mb-6 md:p-4">
          <AlertTriangle size={20} className="flex-shrink-0" />
          <span>
            {selectedInstrument?.tradable === false
              ? 'This market is listed, but trading is unavailable until a verified quote source is connected.'
              : 'Waiting for a verified live price before trading is enabled.'}
          </span>
        </div>
      )}

      {/* Instrument Info */}
      <div className={`${cardSurfaceClass} mb-4 rounded-xl border border-slate-700/50 p-3 md:mb-6 md:p-4`}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4 text-sm">
          <div>
            <span className="text-slate-400">Type:</span>
            <div className="font-medium text-white">{displayInstrumentType}</div>
          </div>
          <div>
            <span className="text-slate-400">Lot Size:</span>
            <div className="font-medium text-white">{lotSize.toLocaleString()}</div>
          </div>
          <div>
            <span className="text-slate-400">Min Size:</span>
            <div className="font-medium text-white">{minTradeSize} lots</div>
          </div>
        </div>
      </div>

      {/* Margin Type and Leverage Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 md:mb-8 gap-3 md:gap-0">
        <div className="flex items-center gap-3 md:gap-6">
          <div className={`${controlSurfaceClass} flex rounded-xl border border-slate-600/30 p-1`}>
            <button
              onClick={() => setMarginType('isolated')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                marginType === 'isolated'
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-purple-500/20'
                  : `text-slate-400 hover:text-white ${controlHoverSurfaceClass}`
              }`}
            >
              {t('trading.isolated')}
            </button>
            <button
              onClick={() => setMarginType('cross')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                marginType === 'cross'
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-purple-500/20'
                  : `text-slate-400 hover:text-white ${controlHoverSurfaceClass}`
              }`}
            >
              {t('trading.cross')}
            </button>
          </div>

          <div className="text-orange-400 font-bold text-2xl bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
            {leverage}x
          </div>
        </div>

        {/* Leverage Slider and Preset Buttons */}
        <div className="flex items-center gap-4">
          {isLeverageLocked ? (
            <div className="flex-1 md:flex-initial md:min-w-[300px]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-xs">{t('common.leverage')}</span>
                <span className="text-orange-400 font-bold text-sm">{leverage}x (Fixed)</span>
              </div>
              <div className="w-full h-2 rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500" />
              <div className="flex justify-center mt-1 text-xs text-slate-500">
                <span>{minAllowedLeverage}x</span>
              </div>
            </div>
          ) : (
            <div className="flex-1 md:flex-initial md:min-w-[300px]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-xs">{t('common.leverage')}</span>
                <span className="text-orange-400 font-bold text-sm">{leverage}x</span>
              </div>
              <input
                type="range"
                min={minAllowedLeverage}
                max={maxAllowedLeverage}
                step="1"
                value={leverage}
                onChange={(e) => setLeverage(Number(e.target.value))}
                className="w-full h-2 appearance-none cursor-pointer rounded-lg bg-slate-700 slider-orange"
                style={{
                  background: `linear-gradient(to right, rgb(99, 102, 241) 0%, rgb(192, 38, 211) ${((leverage - minAllowedLeverage) / Math.max(1, maxAllowedLeverage - minAllowedLeverage)) * 100}%, rgb(30, 41, 59) ${((leverage - minAllowedLeverage) / Math.max(1, maxAllowedLeverage - minAllowedLeverage)) * 100}%, rgb(30, 41, 59) 100%)`
                }}
              />
              <div className="flex justify-between mt-1 text-xs text-slate-500">
                <span>{minAllowedLeverage}x</span>
                <span>{maxAllowedLeverage}x</span>
              </div>

              {/* Leverage Preset Buttons - Desktop Only */}
              <div className="hidden md:flex items-center gap-2 mt-3">
                {[10, 50, 100].map((presetLeverage) => (
                  presetLeverage >= minAllowedLeverage && presetLeverage <= maxAllowedLeverage && (
                    <button
                      key={presetLeverage}
                      onClick={() => setLeverage(presetLeverage)}
                      className={`px-3 py-2 rounded-lg font-medium text-sm transition-all whitespace-nowrap ${
                        leverage === presetLeverage
                          ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-purple-500/20'
                          : `${optionSurfaceClass} border border-slate-600/30 text-slate-300 ${optionHoverSurfaceClass}`
                      }`}
                    >
                      {presetLeverage}x
                    </button>
                  )
                ))}
              </div>
            </div>
          )}

          {/* Tier Indicator */}
          {userCfdTier && (
            <div className={`${tierSurfaceClass} hidden md:flex items-center gap-2 rounded-xl border border-slate-700/50 px-4 py-2.5`}>
              <span className="text-2xl">{getTierIcon(userCfdTier)}</span>
              <div className="flex flex-col">
                <span className="text-xs text-slate-500">Your Tier</span>
                <span className={`text-sm font-bold ${getTierColor(userCfdTier)}`}>{userCfdTier}</span>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Order Type Tabs */}
      <div className="flex gap-3 md:gap-6 mb-4 md:mb-8">
        <button
          onClick={() => setOrderType('market')}
          className={`text-sm font-medium px-4 py-2 rounded-lg transition-all duration-300 ${
            orderType === 'market' 
              ? 'text-cyan-400 border border-purple-500/35 bg-gradient-to-r from-indigo-500/24 via-purple-500/24 to-fuchsia-500/18 shadow-lg shadow-purple-500/15' 
              : `text-slate-400 hover:text-white ${controlHoverSurfaceClass}`
          }`}
        >
          {t('trading.market')}
        </button>
        <button
          onClick={() => setOrderType('limit')}
          className={`text-sm font-medium px-4 py-2 rounded-lg transition-all duration-300 ${
            orderType === 'limit' 
              ? 'text-cyan-400 border border-purple-500/35 bg-gradient-to-r from-indigo-500/24 via-purple-500/24 to-fuchsia-500/18 shadow-lg shadow-purple-500/15' 
              : `text-slate-400 hover:text-white ${controlHoverSurfaceClass}`
          }`}
        >
          {t('trading.limit')}
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 md:gap-8">
        {/* Long Form */}
        <div className="flex-1">
          <div className="mb-6">
            <div className="flex justify-between text-sm text-slate-400 mb-3">
              <span>{t('trading.availableMargin')}</span>
              <span className="flex items-center gap-2 text-emerald-400 font-mono">
                {(availableBalance !== undefined ? availableBalance : usdtBalance).toFixed(4)} USD
                <div className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse"></div>
              </span>
            </div>
          </div>

          <div className="space-y-6">
            {/* Price Input */}
            <div className="mb-3">
              <label className="block text-sm text-slate-400 mb-1 md:mb-3">{t('common.price')} (USD)</label>
              <input
                type="text"
                value={livePairPrice.toFixed(getPricePrecision())}
                className="w-full bg-transparent text-white px-4 py-3 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all hover:border-slate-500/50 font-mono"
                readOnly
              />
            </div>

            {/* Amount Input */}
            <div className="mb-3">
              <label className="block text-sm text-slate-400 mb-1 md:mb-3">
                {t('trading.size')} ({getUnitLabel()})
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder={`Min ${minTradeSize}`}
                  value={longAmount}
                  onChange={(e) => {
                    setLongAmount(e.target.value);
                    setLongPercentage(0);
                  }}
                  className="w-full bg-transparent text-white px-4 py-3 pr-16 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all hover:border-slate-500/50 font-mono"
                  translate="no"
                />
                <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 text-sm font-medium" translate="no">
                  LOTS
                </span>
              </div>
            </div>

            {/* Percentage Buttons */}
            <div className="flex gap-1 md:gap-2 mb-3">
              {percentageOptions.map((percentage) => (
                <button
                  key={percentage}
                  onClick={() => handleLongPercentage(percentage)}
                  className={`flex-1 py-2 text-xs rounded-lg font-medium transition-all duration-300 ${
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
              <div className="flex gap-2">
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
                      <span className="ml-2 font-mono">${longStopLoss.trigger_price.toFixed(2)}</span>
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
                      <span className="ml-2 font-mono">${longTakeProfit.trigger_price.toFixed(2)}</span>
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

            {/* Long Trade Button */}
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-slate-400">
                  <span>{t('trading.requiredMargin')}</span>
                  <span className="text-white font-mono">{formatRequiredMargin(calculateLongCost())} USD</span>
                </div>
                {longSpreadInfo && (
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Spread Cost ({longSpreadInfo.percentage})</span>
                    <span className="text-orange-400 font-mono">{parseFloat(longSpreadInfo.cost).toFixed(4)} USD</span>
                  </div>
                )}
              </div>
              <button
                onClick={handleLong}
                disabled={!canTradeSelectedInstrument}
                className="w-full bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white font-bold py-4 rounded-xl transition-all duration-300 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
              >
                {t('trading.long')} {selectedPair}
              </button>
            </div>
          </div>
        </div>

        {/* Short Form */}
        <div className="flex-1">
          <div className="mb-6">
            <div className="flex justify-between text-sm text-slate-400 mb-3">
              <span>{t('trading.availableMargin')}</span>
              <span className="flex items-center gap-2 text-red-400 font-mono">
                {(availableBalance !== undefined ? availableBalance : usdtBalance).toFixed(4)} USD
                <div className="w-1 h-1 bg-red-400 rounded-full animate-pulse"></div>
              </span>
            </div>
          </div>

          <div className="space-y-6">
            {/* Price Input */}
            <div className="mb-3">
              <label className="block text-sm text-slate-400 mb-1 md:mb-3">{t('common.price')} (USD)</label>
              <input
                type="text"
                value={livePairPrice.toFixed(getPricePrecision())}
                className="w-full bg-transparent text-white px-4 py-3 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all hover:border-slate-500/50 font-mono"
                readOnly
              />
            </div>

            {/* Amount Input */}
            <div className="mb-3">
              <label className="block text-sm text-slate-400 mb-1 md:mb-3">
                {t('trading.size')} ({getUnitLabel()})
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder={`Min ${minTradeSize}`}
                  value={shortAmount}
                  onChange={(e) => {
                    setShortAmount(e.target.value);
                    setShortPercentage(0);
                  }}
                  className="w-full bg-transparent text-white px-4 py-3 pr-16 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all hover:border-slate-500/50 font-mono"
                  translate="no"
                />
                <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 text-sm font-medium" translate="no">
                  LOTS
                </span>
              </div>
            </div>

            {/* Percentage Buttons */}
            <div className="flex gap-1 md:gap-2 mb-3">
              {percentageOptions.map((percentage) => (
                <button
                  key={percentage}
                  onClick={() => handleShortPercentage(percentage)}
                  className={`flex-1 py-2 text-xs rounded-lg font-medium transition-all duration-300 ${
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
              <div className="flex gap-2">
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
                      <span className="ml-2 font-mono">${shortStopLoss.trigger_price.toFixed(2)}</span>
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
                      <span className="ml-2 font-mono">${shortTakeProfit.trigger_price.toFixed(2)}</span>
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

            {/* Short Trade Button */}
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-slate-400">
                  <span>{t('trading.requiredMargin')}</span>
                  <span className="text-white font-mono">{formatRequiredMargin(calculateShortCost())} USD</span>
                </div>
                {shortSpreadInfo && (
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Spread Cost ({shortSpreadInfo.percentage})</span>
                    <span className="text-orange-400 font-mono">{parseFloat(shortSpreadInfo.cost).toFixed(4)} USD</span>
                  </div>
                )}
              </div>
              <button
                onClick={handleShort}
                disabled={!canTradeSelectedInstrument}
                className="w-full bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white font-bold py-4 rounded-xl transition-all duration-300 shadow-lg shadow-red-500/25 hover:shadow-red-500/40 transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
              >
                {t('trading.short')} {selectedPair}
              </button>
            </div>
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
        lotSize={getLotSize(selectedPair)}
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
        lotSize={getLotSize(selectedPair)}
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
        lotSize={getLotSize(selectedPair)}
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
        lotSize={getLotSize(selectedPair)}
        onConfirm={(price, type, execPrice) => {
          setShortTakeProfit({ trigger_price: price, execution_type: type, execution_price: execPrice });
        }}
      />
    </div>
  );
};

export default CFDTradingForms;
