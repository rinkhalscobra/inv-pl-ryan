import React, { useState, useCallback, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Plus, Edit2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CFD_INSTRUMENTS } from '../constants/tradingPairs';
import { getCfdLotSize as getLotSize } from '../lib/cfdLots';
import { CFD_QUOTE_MAX_AGE_MS } from '../constants/quoteFreshness';
import { useMarketData } from '../contexts/MarketDataContext';
import { getInstrumentTypeFromSymbol } from '../constants/tradingTiers';
import { useInstrumentSpread } from '../hooks/useInstrumentSpread';
import TakeProfitStopLossModal from './TakeProfitStopLossModal';
import AppSelect from './AppSelect';
import { useFiatCurrency } from '../hooks/useFiatCurrency';
import { configuredSpreadCost, positionSizeForMargin } from '../lib/positionValuation';
import { calculateDerivativeNotionalUsd, calculateDerivativePnlUsd } from '../utils/derivativeCalculations';

interface CFDTradingFormsProps {
  usdtBalance: number;
  availableBalance?: number;
  surfaceVariant?: 'default' | 'cfd' | 'terminal';
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
  ) => boolean | Promise<boolean>;
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
  const spreadConfig = useInstrumentSpread(selectedPair);
  const { code, convertUsdToDisplay, convertDisplayToUsd, formatFiat, formatFiatPrice } = useFiatCurrency();
  const { getMarketDataBySymbol, getPriceBySymbol, getSnapshotPriceBySymbol, refreshQuotes, quotesReady, error: quoteRefreshError } = useMarketData();
  const [marginType, setMarginType] = useState<'isolated' | 'cross'>('isolated');
  const isTerminal = surfaceVariant === 'terminal';
  const isCfdSurface = surfaceVariant === 'cfd' || isTerminal;
  const [activeSide, setActiveSide] = useState<'long' | 'short'>('long');
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
  const priceIsUsd = instrumentType !== 'forex';
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
  const [limitPrice, setLimitPrice] = useState('');
  const [longAmount, setLongAmount] = useState('');
  const [shortAmount, setShortAmount] = useState('');
  const [longPercentage, setLongPercentage] = useState(0);
  const [shortPercentage, setShortPercentage] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRetryingQuote, setIsRetryingQuote] = useState(false);
  const [, setQuoteClock] = useState(0);

  // Get current price for the selected CFD instrument using snapshot
  const getCurrentPriceForCFD = useCallback(() => {
    const livePrice = getPriceBySymbol(selectedPair);
    if (livePrice > 0) return livePrice;
    const snapshotPrice = getSnapshotPriceBySymbol(selectedPair);
    return snapshotPrice > 0 ? snapshotPrice : currentPrice;
  }, [selectedPair, getPriceBySymbol, getSnapshotPriceBySymbol, currentPrice]);

  const livePairPrice = getCurrentPriceForCFD();
  const displayCfdPrice = (price: number) => priceIsUsd
    ? formatFiatPrice(price)
    : price.toFixed(getPricePrecision());
  const selectedInstrument = CFD_INSTRUMENTS.find(item => item.symbol === selectedPair);
  const selectedQuote = getMarketDataBySymbol(selectedPair);
  const quoteTimestamp = Date.parse(selectedQuote?.timestamp || '');
  const hasVerifiedPrice = Number.isFinite(livePairPrice)
    && livePairPrice > 0
    && Number.isFinite(quoteTimestamp)
    && quoteTimestamp <= Date.now() + 60 * 1000
    && Date.now() - quoteTimestamp < CFD_QUOTE_MAX_AGE_MS;
  const quoteIssue = !selectedQuote
    ? 'No stored quote has arrived for this market.'
    : !Number.isFinite(quoteTimestamp)
      ? 'The stored quote has no valid source time.'
      : quoteTimestamp > Date.now() + 60 * 1000
        ? 'The stored quote has an invalid future time.'
        : `Last source quote: ${new Date(quoteTimestamp).toLocaleString('en-GB')}.`;
  const canTradeSelectedInstrument = selectedInstrument?.tradable !== false && hasVerifiedPrice;
  useEffect(() => {
    if (!Number.isFinite(quoteTimestamp)) return;
    const untilStale = quoteTimestamp + CFD_QUOTE_MAX_AGE_MS - Date.now();
    if (untilStale <= 0) return;
    const timer = window.setTimeout(() => setQuoteClock(Date.now()), untilStale + 1);
    return () => window.clearTimeout(timer);
  }, [quoteTimestamp]);
  const parsedLimitPrice = Number(limitPrice);
  const orderEntryPrice = orderType === 'limit'
    ? priceIsUsd ? convertDisplayToUsd(parsedLimitPrice) : parsedLimitPrice
    : livePairPrice;




  // Calculate amount from percentage for long positions
  const calculateLongAmountFromPercentage = useCallback((percentage: number) => {
    if (percentage <= 0) return '';

    const priceToUse = orderEntryPrice;
    if (!Number.isFinite(priceToUse) || priceToUse <= 0) return '';
    const lotSize = getLotSize(selectedPair);
    const balanceToUse = availableBalance !== undefined ? availableBalance : usdtBalance;
    const targetMargin = balanceToUse * (percentage / 100);
    const notionalPerLot = calculateDerivativeNotionalUsd(selectedPair, lotSize, priceToUse, getPriceBySymbol);
    if (notionalPerLot <= 0) return '';
    const amount = positionSizeForMargin(targetMargin, leverage, notionalPerLot, 5);
    return amount >= getMinTradeSize() ? amount.toFixed(5) : '';
  }, [availableBalance, usdtBalance, leverage, orderEntryPrice, selectedPair, getPriceBySymbol]);

  // Calculate amount from percentage for short positions
  const calculateShortAmountFromPercentage = useCallback((percentage: number) => {
    if (percentage <= 0) return '';

    const priceToUse = orderEntryPrice;
    if (!Number.isFinite(priceToUse) || priceToUse <= 0) return '';
    const lotSize = getLotSize(selectedPair);
    const balanceToUse = availableBalance !== undefined ? availableBalance : usdtBalance;
    const targetMargin = balanceToUse * (percentage / 100);
    const notionalPerLot = calculateDerivativeNotionalUsd(selectedPair, lotSize, priceToUse, getPriceBySymbol);
    if (notionalPerLot <= 0) return '';
    const amount = positionSizeForMargin(targetMargin, leverage, notionalPerLot, 5);
    return amount >= getMinTradeSize() ? amount.toFixed(5) : '';
  }, [availableBalance, usdtBalance, leverage, orderEntryPrice, selectedPair, getPriceBySymbol]);

  // Stop Loss / Take Profit states
  const [longStopLoss, setLongStopLoss] = useState<{ trigger_price: number; execution_type: 'market' | 'limit'; execution_price?: number } | null>(null);
  const [longTakeProfit, setLongTakeProfit] = useState<{ trigger_price: number; execution_type: 'market' | 'limit'; execution_price?: number } | null>(null);
  const [shortStopLoss, setShortStopLoss] = useState<{ trigger_price: number; execution_type: 'market' | 'limit'; execution_price?: number } | null>(null);
  const [shortTakeProfit, setShortTakeProfit] = useState<{ trigger_price: number; execution_type: 'market' | 'limit'; execution_price?: number } | null>(null);

  // Draft amounts and risk levels belong to the instrument on which they were entered.
  useEffect(() => {
    setLongAmount('');
    setShortAmount('');
    setLongPercentage(0);
    setShortPercentage(0);
    setLimitPrice('');
    setLongStopLoss(null);
    setLongTakeProfit(null);
    setShortStopLoss(null);
    setShortTakeProfit(null);
    setErrorMessage(null);
    setSuccessMessage(null);
  }, [selectedPair]);

  useEffect(() => {
    setLimitPrice('');
  }, [code]);

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
    const notionalUsd = calculateDerivativeNotionalUsd(selectedPair, amount * lotSize, orderEntryPrice, getPriceBySymbol);
    return spreadConfig ? configuredSpreadCost(spreadConfig, notionalUsd) : 0;
  };

  const getSpreadDisplay = (amount: number = 1) => {
    if (!spreadConfig) return null;
    const spreadCost = getSpreadCost(amount);
    return {
      cost: spreadCost.toFixed(8),
      percentage: `${((spreadConfig?.spreadPercentage || 0.0001) * 100).toFixed(4)}%`,
      description: spreadConfig?.description || 'Standard spread'
    };
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
    return calculateDerivativePnlUsd(
      selectedPair,
      side,
      entryPrice,
      triggerPrice,
      amount * lotSize,
      getPriceBySymbol
    );
  };

  const handleLong = async () => {
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

    const priceToUse = orderEntryPrice;
    if (!Number.isFinite(priceToUse) || priceToUse <= 0) {
      setErrorMessage('Enter a valid limit price before placing an order.');
      return;
    }
    const lotSize = getLotSize(selectedPair);
    const notionalValue = calculateDerivativeNotionalUsd(selectedPair, amount * lotSize, priceToUse, getPriceBySymbol);
    const requiredMargin = notionalValue / leverage;
    
    if (requiredMargin > (availableBalance !== undefined ? availableBalance : usdtBalance)) {
      setErrorMessage('Insufficient available balance');
      return;
    }

    setIsSubmitting(true);
    try {
      const opened = await Promise.resolve(onCFDTrade(selectedPair, 'long', amount * lotSize, leverage, marginType, longStopLoss || undefined, longTakeProfit || undefined, orderType, priceToUse));
      if (!opened) throw new Error('The position was not accepted');
      setSuccessMessage(orderType === 'limit'
        ? `Long limit order placed for ${amount} lots`
        : `Long position opened for ${amount} lots`);
      setLongAmount('');
      setLongPercentage(0);
      setLongStopLoss(null);
      setLongTakeProfit(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to open position');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShort = async () => {
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

    const priceToUse = orderEntryPrice;
    if (!Number.isFinite(priceToUse) || priceToUse <= 0) {
      setErrorMessage('Enter a valid limit price before placing an order.');
      return;
    }
    const lotSize = getLotSize(selectedPair);
    const notionalValue = calculateDerivativeNotionalUsd(selectedPair, amount * lotSize, priceToUse, getPriceBySymbol);
    const requiredMargin = notionalValue / leverage;
    
    if (requiredMargin > (availableBalance !== undefined ? availableBalance : usdtBalance)) {
      setErrorMessage('Insufficient available balance');
      return;
    }

    setIsSubmitting(true);
    try {
      const opened = await Promise.resolve(onCFDTrade(selectedPair, 'short', amount * lotSize, leverage, marginType, shortStopLoss || undefined, shortTakeProfit || undefined, orderType, priceToUse));
      if (!opened) throw new Error('The position was not accepted');
      setSuccessMessage(orderType === 'limit'
        ? `Short limit order placed for ${amount} lots`
        : `Short position opened for ${amount} lots`);
      setShortAmount('');
      setShortPercentage(0);
      setShortStopLoss(null);
      setShortTakeProfit(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to open position');
    } finally {
      setIsSubmitting(false);
    }
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
    const priceToUse = orderEntryPrice;
    const lotSize = getLotSize(selectedPair);
    const notionalValue = calculateDerivativeNotionalUsd(selectedPair, amount * lotSize, priceToUse, getPriceBySymbol);
    const requiredMargin = notionalValue / leverage;
    return requiredMargin;
  };

  const calculateShortCost = () => {
    const amount = parseFloat(shortAmount) || 0;
    const priceToUse = orderEntryPrice;
    const lotSize = getLotSize(selectedPair);
    const notionalValue = calculateDerivativeNotionalUsd(selectedPair, amount * lotSize, priceToUse, getPriceBySymbol);
    const requiredMargin = notionalValue / leverage;
    return requiredMargin;
  };


  const displayInstrumentType = getInstrumentType();
  const lotSize = getLotSize(selectedPair);
  const minTradeSize = getMinTradeSize();

  const longSpreadInfo = longAmount ? getSpreadDisplay(parseFloat(longAmount)) : null;
  const shortSpreadInfo = shortAmount ? getSpreadDisplay(parseFloat(shortAmount)) : null;

  const riskModals = (
    <>
      {/* Take Profit / Stop Loss Modals */}
      <TakeProfitStopLossModal
        isOpen={showLongSLModal}
        onClose={() => setShowLongSLModal(false)}
        type="stopLoss"
        side="long"
        entryPrice={orderEntryPrice > 0 ? orderEntryPrice : livePairPrice}
        amount={parseFloat(longAmount) || 0}
        leverage={leverage}
        lotSize={getLotSize(selectedPair)}
        priceIsUsd={priceIsUsd}
        onConfirm={(price, type, execPrice) => {
          setLongStopLoss({ trigger_price: price, execution_type: type, execution_price: execPrice });
        }}
      />

      <TakeProfitStopLossModal
        isOpen={showLongTPModal}
        onClose={() => setShowLongTPModal(false)}
        type="takeProfit"
        side="long"
        entryPrice={orderEntryPrice > 0 ? orderEntryPrice : livePairPrice}
        amount={parseFloat(longAmount) || 0}
        leverage={leverage}
        lotSize={getLotSize(selectedPair)}
        priceIsUsd={priceIsUsd}
        onConfirm={(price, type, execPrice) => {
          setLongTakeProfit({ trigger_price: price, execution_type: type, execution_price: execPrice });
        }}
      />

      <TakeProfitStopLossModal
        isOpen={showShortSLModal}
        onClose={() => setShowShortSLModal(false)}
        type="stopLoss"
        side="short"
        entryPrice={orderEntryPrice > 0 ? orderEntryPrice : livePairPrice}
        amount={parseFloat(shortAmount) || 0}
        leverage={leverage}
        lotSize={getLotSize(selectedPair)}
        priceIsUsd={priceIsUsd}
        onConfirm={(price, type, execPrice) => {
          setShortStopLoss({ trigger_price: price, execution_type: type, execution_price: execPrice });
        }}
      />

      <TakeProfitStopLossModal
        isOpen={showShortTPModal}
        onClose={() => setShowShortTPModal(false)}
        type="takeProfit"
        side="short"
        entryPrice={orderEntryPrice > 0 ? orderEntryPrice : livePairPrice}
        amount={parseFloat(shortAmount) || 0}
        leverage={leverage}
        lotSize={getLotSize(selectedPair)}
        priceIsUsd={priceIsUsd}
        onConfirm={(price, type, execPrice) => {
          setShortTakeProfit({ trigger_price: price, execution_type: type, execution_price: execPrice });
        }}
      />
    </>
  );

  if (isTerminal) {
    const isLong = activeSide === 'long';
    const activeAmount = isLong ? longAmount : shortAmount;
    const activePercentage = isLong ? longPercentage : shortPercentage;
    const activeStopLoss = isLong ? longStopLoss : shortStopLoss;
    const activeTakeProfit = isLong ? longTakeProfit : shortTakeProfit;
    const activeSpreadInfo = isLong ? longSpreadInfo : shortSpreadInfo;
    const requiredMargin = isLong ? calculateLongCost() : calculateShortCost();
    const parsedAmount = Number(activeAmount) || 0;
    const submitDisabled = !canTradeSelectedInstrument || isSubmitting
      || !Number.isFinite(parsedAmount) || parsedAmount < minTradeSize
      || !Number.isFinite(orderEntryPrice) || orderEntryPrice <= 0;

    const updateAmount = (value: string) => {
      if (isLong) {
        setLongAmount(value);
        setLongPercentage(0);
      } else {
        setShortAmount(value);
        setShortPercentage(0);
      }
    };

    const updatePercentage = (percentage: number) => {
      if (isLong) handleLongPercentage(percentage);
      else handleShortPercentage(percentage);
    };

    return (
      <>
        <div className="cfd-order-ticket flex h-full min-h-[620px] flex-col bg-[#0b0e11]" translate="no">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.07] px-4">
            <h2 className="text-sm font-semibold text-white">Place order</h2>
            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
              <span className={`h-2 w-2 rounded-full ${hasVerifiedPrice ? 'bg-emerald-400' : 'bg-slate-500'}`} /> {hasVerifiedPrice ? 'Market current' : quotesReady ? 'Unavailable' : 'Loading'}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-width:thin] [scrollbar-color:#334155_transparent]">
            {(errorMessage || successMessage) && (
              <div className={`mb-3 flex items-start gap-2 rounded-md border px-3 py-2.5 text-xs ${errorMessage ? 'border-rose-400/25 bg-rose-400/[0.08] text-rose-300' : 'border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300'}`}>
                {errorMessage ? <AlertTriangle size={15} className="mt-0.5 shrink-0" /> : <CheckCircle size={15} className="mt-0.5 shrink-0" />}
                <span>{errorMessage || successMessage}</span>
              </div>
            )}

            {quotesReady && !canTradeSelectedInstrument && (
              <div className="mb-4 flex items-center gap-3 rounded-md border border-white/[0.09] bg-white/[0.025] p-3 text-slate-300">
                <AlertTriangle size={15} className="flex-shrink-0" />
                <span className="text-xs">
                  {selectedInstrument?.tradable === false
                    ? 'This market is listed, but trading is unavailable until a verified quote source is connected.'
                    : 'This market is temporarily unavailable for trading.'}
                  {selectedInstrument?.tradable !== false && (
                    <span className="mt-1 block text-xs text-slate-400">
                      {quoteIssue} {quoteRefreshError || ''}
                    </span>
                  )}
                  {selectedInstrument?.tradable !== false && (
                    <button type="button" disabled={isRetryingQuote} onClick={async () => {
                      setIsRetryingQuote(true);
                      try { await refreshQuotes(selectedPair, true); }
                      finally { setIsRetryingQuote(false); }
                    }} className="mt-2 block text-xs font-semibold text-slate-300 underline underline-offset-2 disabled:opacity-50">
                      {isRetryingQuote ? 'Checking quote...' : 'Retry quote'}
                    </button>
                  )}
                </span>
              </div>
            )}

            <div className="mb-4 grid grid-cols-2 rounded-md bg-[#161a1e] p-1">
              <button
                type="button"
                onClick={() => setActiveSide('long')}
                aria-pressed={isLong}
                className={`rounded px-3 py-2 text-xs font-semibold transition ${isLong ? 'bg-emerald-400/15 text-emerald-300 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Buy / Long
              </button>
              <button
                type="button"
                onClick={() => setActiveSide('short')}
                aria-pressed={!isLong}
                className={`rounded px-3 py-2 text-xs font-semibold transition ${!isLong ? 'bg-rose-400/15 text-rose-300 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Sell / Short
              </button>
            </div>

            <div className="mb-4 flex items-center gap-5 border-b border-white/[0.07]">
              {(['market', 'limit'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={orderType === type}
                  onClick={() => {
                    setOrderType(type);
                    if (type === 'limit' && !limitPrice && livePairPrice > 0) setLimitPrice((priceIsUsd ? convertUsdToDisplay(livePairPrice) : livePairPrice).toFixed(getPricePrecision()));
                  }}
                  className={`border-b-2 pb-2.5 text-xs font-semibold capitalize transition ${orderType === type ? 'border-violet-400 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                >
                  {t(`trading.${type}`)}
                </button>
              ))}
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1.5 block text-[11px] text-slate-500">Margin mode</label>
                <div className="grid grid-cols-2 rounded-md border border-white/[0.08] bg-[#161a1e] p-0.5">
                  {(['isolated', 'cross'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setMarginType(type)}
                      aria-pressed={marginType === type}
                      className={`rounded px-1 py-2 text-[11px] font-medium capitalize transition ${marginType === type ? 'bg-violet-500/20 text-violet-200' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      {t(`trading.${type}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="cfd-leverage" className="mb-1.5 block text-[11px] text-slate-500">{t('common.leverage')}</label>
                <div className="relative">
                  <AppSelect
                    id="cfd-leverage"
                    value={leverage}
                    onChange={(event) => setLeverage(Number(event.target.value))}
                    disabled={isLeverageLocked}
                    className="h-[38px] w-full appearance-none rounded-md border border-white/[0.08] bg-[#161a1e] px-3 font-mono text-xs font-semibold text-white outline-none transition focus:border-violet-400/50 disabled:cursor-not-allowed"
                  >
                    {leverageOptions.map((option) => <option key={option} value={option}>{option}x</option>)}
                  </AppSelect>
                </div>
              </div>
            </div>

            <div className="mb-3 flex items-center justify-between text-[11px]">
              <span className="text-slate-500">{t('trading.availableMargin')}</span>
              <span className="font-mono font-medium tabular-nums text-slate-200">{formatFiat(availableBalance !== undefined ? availableBalance : usdtBalance)}</span>
            </div>

            <label className="mb-1.5 flex items-center justify-between text-[11px] text-slate-500">
              <span>{orderType === 'market' ? 'Mark price' : 'Limit price'}</span>
              <span className="text-slate-600">{priceIsUsd ? code : 'Rate'}</span>
            </label>
            {orderType === 'market' ? (
              <div className="mb-3 flex h-11 items-center justify-between rounded-md border border-white/[0.09] bg-[#161a1e] px-3 font-mono text-sm tabular-nums text-slate-200">
                <span>{(priceIsUsd ? convertUsdToDisplay(livePairPrice) : livePairPrice).toFixed(getPricePrecision())}</span>
                <span className="text-[10px] font-sans text-slate-600">Market</span>
              </div>
            ) : (
              <div className="relative mb-3">
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label="Limit price"
                  value={limitPrice}
                  onChange={(event) => setLimitPrice(event.target.value)}
                  placeholder={(priceIsUsd ? convertUsdToDisplay(livePairPrice) : livePairPrice).toFixed(getPricePrecision())}
                  className="h-11 w-full rounded-md border border-white/[0.09] bg-[#161a1e] px-3 pr-14 font-mono text-sm text-white outline-none transition placeholder:text-slate-700 hover:border-white/[0.16] focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/20"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-500">{priceIsUsd ? code : 'Rate'}</span>
              </div>
            )}

            <label className="mb-1.5 flex items-center justify-between text-[11px] text-slate-500">
              <span>{t('trading.size')}</span>
              <span>Lots</span>
            </label>
            <div className="relative mb-2">
              <input
                type="text"
                inputMode="decimal"
                placeholder={`Min ${minTradeSize}`}
                aria-label="Size in lots"
                value={activeAmount}
                onChange={(event) => updateAmount(event.target.value)}
                className="h-11 w-full rounded-md border border-white/[0.09] bg-[#161a1e] px-3 pr-14 font-mono text-sm text-white outline-none transition placeholder:text-slate-700 hover:border-white/[0.16] focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/20"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-500">Lots</span>
            </div>

            <div className="relative mb-5 pt-3">
              <div className="absolute left-2 right-2 top-[18px] h-px bg-slate-700" />
              <div className="relative grid grid-cols-4">
                {percentageOptions.map((percentage) => (
                  <button
                    key={percentage}
                    type="button"
                    onClick={() => updatePercentage(percentage)}
                    aria-pressed={activePercentage === percentage}
                    className="group flex flex-col items-center gap-1.5 text-[10px] text-slate-500 transition hover:text-slate-300"
                  >
                    <span className={`h-3 w-3 rotate-45 border transition ${activePercentage >= percentage ? (isLong ? 'border-emerald-400 bg-emerald-400' : 'border-rose-400 bg-rose-400') : 'border-slate-600 bg-[#0b0e11] group-hover:border-slate-400'}`} />
                    {percentage}%
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => isLong ? setShowLongTPModal(true) : setShowShortTPModal(true)}
                className={`rounded-md border px-2 py-2.5 text-[11px] font-medium transition ${activeTakeProfit ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-300' : 'border-white/[0.08] bg-white/[0.025] text-slate-400 hover:border-white/[0.15] hover:text-slate-200'}`}
              >
                {activeTakeProfit ? <Edit2 size={12} className="mr-1 inline" /> : <Plus size={12} className="mr-1 inline" />} Take profit
              </button>
              <button
                type="button"
                onClick={() => isLong ? setShowLongSLModal(true) : setShowShortSLModal(true)}
                className={`rounded-md border px-2 py-2.5 text-[11px] font-medium transition ${activeStopLoss ? 'border-rose-400/35 bg-rose-400/10 text-rose-300' : 'border-white/[0.08] bg-white/[0.025] text-slate-400 hover:border-white/[0.15] hover:text-slate-200'}`}
              >
                {activeStopLoss ? <Edit2 size={12} className="mr-1 inline" /> : <Plus size={12} className="mr-1 inline" />} Stop loss
              </button>
            </div>

            {(activeTakeProfit || activeStopLoss) && (
              <div className="mb-4 space-y-2 text-[11px]">
                {activeTakeProfit && <div className="flex items-center justify-between gap-2 text-slate-400"><span>Take profit <span className="ml-2 font-mono text-slate-200">{displayCfdPrice(activeTakeProfit.trigger_price)}</span></span><button type="button" aria-label="Remove take profit" onClick={() => isLong ? setLongTakeProfit(null) : setShortTakeProfit(null)} className="p-1 hover:text-white"><X size={12} /></button></div>}
                {activeStopLoss && <div className="flex items-center justify-between gap-2 text-slate-400"><span>Stop loss <span className="ml-2 font-mono text-slate-200">{displayCfdPrice(activeStopLoss.trigger_price)}</span></span><button type="button" aria-label="Remove stop loss" onClick={() => isLong ? setLongStopLoss(null) : setShortStopLoss(null)} className="p-1 hover:text-white"><X size={12} /></button></div>}
              </div>
            )}

            <dl className="mb-4 space-y-2 border-t border-white/[0.07] pt-3 text-[11px]">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">{t('trading.requiredMargin')}</dt><dd className="font-mono tabular-nums text-slate-300">{formatFiat(requiredMargin)}</dd></div>
              {activeSpreadInfo && <div className="flex justify-between gap-3"><dt className="text-slate-500">Spread ({activeSpreadInfo.percentage})</dt><dd className="font-mono tabular-nums text-slate-300">{formatFiat(parseFloat(activeSpreadInfo.cost))}</dd></div>}
            </dl>

            <button
              type="button"
              onClick={isLong ? handleLong : handleShort}
              disabled={submitDisabled}
              className={`h-12 w-full rounded-md text-sm font-bold text-white transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500 ${isLong ? 'bg-emerald-600' : 'bg-rose-600'}`}
            >
              {isSubmitting ? 'Placing order...' : isLong ? t('futures.buyLong') : t('futures.sellShort')}
            </button>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-white/[0.07] pt-3 text-[10px]">
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Lot size</dt><dd className="font-mono text-slate-400">{lotSize.toLocaleString()}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Min size</dt><dd className="font-mono text-slate-400">{minTradeSize} lots</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Type</dt><dd className="text-slate-400">{displayInstrumentType}</dd></div>
              {userCfdTier && <div className="flex justify-between gap-2"><dt className="text-slate-500">Account tier</dt><dd className="text-slate-400">{userCfdTier}</dd></div>}
            </dl>
          </div>
        </div>

        {riskModals}
      </>
    );
  }


  return (
    <div className={`${panelSurfaceClass} rounded-2xl border border-slate-700/50 p-3 shadow-2xl backdrop-blur-sm md:p-8`} translate="no">
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

      {quotesReady && !canTradeSelectedInstrument && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-300 md:mb-6 md:p-4">
          <AlertTriangle size={20} className="flex-shrink-0" />
          <span>
            {selectedInstrument?.tradable === false
              ? 'This market is listed, but trading is unavailable until a verified quote source is connected.'
              : 'This market is temporarily unavailable for trading.'}
            {selectedInstrument?.tradable !== false && (
              <span className="mt-1 block text-xs text-amber-200/80">
                {quoteIssue} {quoteRefreshError || ''}
              </span>
            )}
            {selectedInstrument?.tradable !== false && (
              <button type="button" disabled={isRetryingQuote} onClick={async () => {
                setIsRetryingQuote(true);
                try { await refreshQuotes(selectedPair, true); }
                finally { setIsRetryingQuote(false); }
              }} className="mt-2 block text-xs font-semibold text-amber-200 underline underline-offset-2 disabled:opacity-50">
                {isRetryingQuote ? 'Checking quote...' : 'Retry quote'}
              </button>
            )}
          </span>
        </div>
      )}

      {/* Instrument Info */}
      <div className={`${cardSurfaceClass} cfd-ticket-instrument mb-4 rounded-xl border border-slate-700/50 p-3 md:mb-6 md:p-4`}>
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
      <div className="cfd-ticket-controls flex flex-col md:flex-row md:items-center md:justify-between mb-4 md:mb-8 gap-3 md:gap-0">
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

      {orderType === 'limit' && (
        <div className="mb-4 md:mb-6">
          <label htmlFor="cfd-limit-price" className="mb-2 block text-xs text-slate-400">
            Limit price ({priceIsUsd ? code : 'Rate'})
          </label>
          <input
            id="cfd-limit-price"
            type="text"
            inputMode="decimal"
            value={limitPrice}
            onChange={(event) => setLimitPrice(event.target.value)}
            placeholder={(priceIsUsd ? convertUsdToDisplay(livePairPrice) : livePairPrice).toFixed(getPricePrecision())}
            className="w-full rounded-md border border-white/[0.09] bg-[#161a1e] px-3 py-3 font-mono text-sm text-white outline-none placeholder:text-slate-600 focus:border-violet-400/50"
          />
        </div>
      )}

      <div className="cfd-side-forms flex flex-col md:flex-row gap-4 md:gap-8">
        {/* Long Form */}
        <div className="flex-1">
          <div className="mb-6">
            <div className="flex justify-between text-sm text-slate-400 mb-3">
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
              <label className="block text-sm text-slate-400 mb-1 md:mb-3">Mark price ({priceIsUsd ? code : 'Rate'})</label>
              <input
                type="text"
                value={(priceIsUsd ? convertUsdToDisplay(livePairPrice) : livePairPrice).toFixed(getPricePrecision())}
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
                      <span className="ml-2 font-mono">{displayCfdPrice(longStopLoss.trigger_price)}</span>
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
                      <span className="ml-2 font-mono">{displayCfdPrice(longTakeProfit.trigger_price)}</span>
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
                  <span className="text-white font-mono">{formatFiat(calculateLongCost())}</span>
                </div>
                {longSpreadInfo && (
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Spread Cost ({longSpreadInfo.percentage})</span>
                    <span className="text-orange-400 font-mono">{formatFiat(parseFloat(longSpreadInfo.cost))}</span>
                  </div>
                )}
              </div>
              <button
                onClick={handleLong}
                disabled={!canTradeSelectedInstrument || isSubmitting}
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
                {formatFiat(availableBalance !== undefined ? availableBalance : usdtBalance)}
                <div className="w-1 h-1 bg-red-400 rounded-full animate-pulse"></div>
              </span>
            </div>
          </div>

          <div className="space-y-6">
            {/* Price Input */}
            <div className="mb-3">
              <label className="block text-sm text-slate-400 mb-1 md:mb-3">Mark price ({priceIsUsd ? code : 'Rate'})</label>
              <input
                type="text"
                value={(priceIsUsd ? convertUsdToDisplay(livePairPrice) : livePairPrice).toFixed(getPricePrecision())}
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
                      <span className="ml-2 font-mono">{displayCfdPrice(shortStopLoss.trigger_price)}</span>
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
                      <span className="ml-2 font-mono">{displayCfdPrice(shortTakeProfit.trigger_price)}</span>
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
                  <span className="text-white font-mono">{formatFiat(calculateShortCost())}</span>
                </div>
                {shortSpreadInfo && (
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Spread Cost ({shortSpreadInfo.percentage})</span>
                    <span className="text-orange-400 font-mono">{formatFiat(parseFloat(shortSpreadInfo.cost))}</span>
                  </div>
                )}
              </div>
              <button
                onClick={handleShort}
                disabled={!canTradeSelectedInstrument || isSubmitting}
                className="w-full bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white font-bold py-4 rounded-xl transition-all duration-300 shadow-lg shadow-red-500/25 hover:shadow-red-500/40 transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
              >
                {t('trading.short')} {selectedPair}
              </button>
            </div>
          </div>
        </div>
      </div>

      {riskModals}
    </div>
  );
};

export default CFDTradingForms;
