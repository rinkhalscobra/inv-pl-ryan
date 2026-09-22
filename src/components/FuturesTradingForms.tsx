import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { AlertTriangle, CheckCircle, Plus, CreditCard as Edit2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useBybitData } from '../contexts/BybitDataContext';
import { usePrevious } from '../hooks/usePrevious';
import { formatSpreadDisplay } from '../constants/spreadConfig';
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
  ) => boolean | Promise<boolean>;
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
  const { convertUsdToEur, convertEurToUsd, formatFiat, formatFiatPrice } = useFiatCurrency();
  const { getCryptoDataBySymbol, getPriceDirection } = useBybitData();
  const [quoteClock, setQuoteClock] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setQuoteClock(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);
  const [marginType, setMarginType] = useState<'isolated' | 'cross'>('isolated');
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
  const [activeSide, setActiveSide] = useState<'long' | 'short'>('long');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);

  const livePairPrice = useMemo(() => {
    const quote = getCryptoDataBySymbol(selectedPair);
    const age = quoteClock - Date.parse(quote?.timestamp || '');
    return quote && age >= 0 && age <= 2 * 60_000 ? quote.price : 0;
  }, [getCryptoDataBySymbol, selectedPair, quoteClock]);

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
    return <div className={`h-2 w-2 rounded-full ${livePairPrice > 0 ? 'bg-emerald-400' : 'bg-amber-400'}`}
      title={livePairPrice > 0 ? 'Twelve Data quote current' : 'Quote unavailable or stale'} />;
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
    
    const entryPrice = orderType === 'limit' ? convertEurToUsd(Number(limitPrice)) : livePairPrice;
    if (!(entryPrice > 0)) return '';
    const targetMargin = (availableBalance ?? usdtBalance) * (percentage / 100);
    const amount = (targetMargin * leverage) / entryPrice;
    
    return amount.toFixed(6);
  }, [availableBalance, convertEurToUsd, leverage, limitPrice, livePairPrice, orderType, usdtBalance]);

  // Calculate amount from percentage for short positions
  const calculateShortAmountFromPercentage = useCallback((percentage: number) => {
    if (percentage <= 0) return '';
    
    if (livePairPrice <= 0) return '';
    
    const entryPrice = orderType === 'limit' ? convertEurToUsd(Number(limitPrice)) : livePairPrice;
    if (!(entryPrice > 0)) return '';
    const targetMargin = (availableBalance ?? usdtBalance) * (percentage / 100);
    const amount = (targetMargin * leverage) / entryPrice;
    
    return amount.toFixed(6);
  }, [availableBalance, convertEurToUsd, leverage, limitPrice, livePairPrice, orderType, usdtBalance]);

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
      return (triggerPrice - entryPrice) * amount;
    } else {
      return (entryPrice - triggerPrice) * amount;
    }
  };

  const handleLong = async () => {
    const amount = parseFloat(longAmount);
    const entryPrice = orderType === 'limit' ? convertEurToUsd(parseFloat(limitPrice)) : livePairPrice;
    
    if (!amount || amount <= 0) {
      setErrorMessage('Please enter a valid amount');
      return;
    }

    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
      setErrorMessage(orderType === 'limit' ? 'Please enter a valid limit price' : 'A verified live price is required before placing an order');
      return;
    }
    const notionalValue = amount * entryPrice;
    const requiredMargin = notionalValue / leverage;
    
    if (requiredMargin > (availableBalance !== undefined ? availableBalance : usdtBalance)) {
      setErrorMessage('Insufficient available balance');
      return;
    }

    // Always pass the live price to ensure the parent component has it
    setIsSubmitting(true);
    try {
      const opened = await Promise.resolve(onFuturesTrade(selectedPair, 'long', amount, leverage, marginType, longStopLoss || undefined, longTakeProfit || undefined, orderType, entryPrice));
      if (!opened) throw new Error('The position was not accepted');
      setSuccessMessage(orderType === 'limit'
        ? `Long limit order placed for ${amount} ${selectedPair.replace('USDT', '')}`
        : `Long position opened for ${amount} ${selectedPair.replace('USDT', '')}`);
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
    const amount = parseFloat(shortAmount);
    const entryPrice = orderType === 'limit' ? convertEurToUsd(parseFloat(limitPrice)) : livePairPrice;
    
    if (!amount || amount <= 0) {
      setErrorMessage('Please enter a valid amount');
      return;
    }

    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
      setErrorMessage(orderType === 'limit' ? 'Please enter a valid limit price' : 'A verified live price is required before placing an order');
      return;
    }
    const notionalValue = amount * entryPrice;
    const requiredMargin = notionalValue / leverage;
    
    if (requiredMargin > (availableBalance !== undefined ? availableBalance : usdtBalance)) {
      setErrorMessage('Insufficient available balance');
      return;
    }

    // Always pass the live price to ensure the parent component has it
    setIsSubmitting(true);
    try {
      const opened = await Promise.resolve(onFuturesTrade(selectedPair, 'short', amount, leverage, marginType, shortStopLoss || undefined, shortTakeProfit || undefined, orderType, entryPrice));
      if (!opened) throw new Error('The position was not accepted');
      setSuccessMessage(orderType === 'limit'
        ? `Short limit order placed for ${amount} ${selectedPair.replace('USDT', '')}`
        : `Short position opened for ${amount} ${selectedPair.replace('USDT', '')}`);
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
    const entryPrice = orderType === 'limit' ? convertEurToUsd(parseFloat(limitPrice)) || 0 : livePairPrice;
    const notionalValue = amount * entryPrice;
    const requiredMargin = notionalValue / leverage;
    return requiredMargin;
  };

  const calculateShortCost = () => {
    const amount = parseFloat(shortAmount) || 0;
    const entryPrice = orderType === 'limit' ? convertEurToUsd(parseFloat(limitPrice)) || 0 : livePairPrice;
    const notionalValue = amount * entryPrice;
    const requiredMargin = notionalValue / leverage;
    return requiredMargin;
  };


  const longSpreadInfo = longAmount ? formatSpreadDisplay(selectedPair, livePairPrice, parseFloat(longAmount), 1) : null;
  const shortSpreadInfo = shortAmount ? formatSpreadDisplay(selectedPair, livePairPrice, parseFloat(shortAmount), 1) : null;

  if (isFuturesSurface) {
    const isLong = activeSide === 'long';
    const activeAmount = isLong ? longAmount : shortAmount;
    const activePercentage = isLong ? longPercentage : shortPercentage;
    const activeStopLoss = isLong ? longStopLoss : shortStopLoss;
    const activeTakeProfit = isLong ? longTakeProfit : shortTakeProfit;
    const activeSpreadInfo = isLong ? longSpreadInfo : shortSpreadInfo;
    const requiredMargin = isLong ? calculateLongCost() : calculateShortCost();
    const baseAsset = selectedPair.replace('USDT', '');
    const orderEntryPrice = orderType === 'limit' ? convertEurToUsd(parseFloat(limitPrice)) || livePairPrice : livePairPrice;
    const parsedAmount = Number(activeAmount) || 0;
    const liquidationPrice = calculateLiquidationPrice(
      activeSide,
      orderEntryPrice,
      leverage,
      marginType,
      parsedAmount,
      availableBalance ?? usdtBalance,
    );
    const canSubmit = isSubmitting || parsedAmount <= 0 || (orderType === 'market'
      ? livePairPrice <= 0
      : !(Number(limitPrice) > 0));

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
        <div className="futures-order-ticket flex h-full min-h-[620px] flex-col bg-[#0b0e11]" translate="no">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.07] px-4">
            <h2 className="text-sm font-semibold text-white">Place order</h2>
            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
              {getConnectionIndicator()} {livePairPrice > 0 ? 'Quote current' : 'Quote stale'}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-width:thin] [scrollbar-color:#334155_transparent]">
            {(errorMessage || successMessage) && (
              <div className={`mb-3 flex items-start gap-2 rounded-md border px-3 py-2.5 text-xs ${errorMessage ? 'border-rose-400/25 bg-rose-400/[0.08] text-rose-300' : 'border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300'}`}>
                {errorMessage ? <AlertTriangle size={15} className="mt-0.5 shrink-0" /> : <CheckCircle size={15} className="mt-0.5 shrink-0" />}
                <span>{errorMessage || successMessage}</span>
              </div>
            )}

            <div className="mb-4 grid grid-cols-2 rounded-md bg-[#161a1e] p-1">
              <button
                type="button"
                onClick={() => setActiveSide('long')}
                className={`rounded px-3 py-2 text-xs font-semibold transition ${isLong ? 'bg-emerald-400/15 text-emerald-300 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Buy / Long
              </button>
              <button
                type="button"
                onClick={() => setActiveSide('short')}
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
                  onClick={() => {
                    setOrderType(type);
                    if (type === 'limit' && !limitPrice && livePairPrice > 0) setLimitPrice(convertUsdToEur(livePairPrice).toFixed(4));
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
                      className={`rounded px-1 py-2 text-[11px] font-medium capitalize transition ${marginType === type ? 'bg-violet-500/20 text-violet-200' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      {t(`trading.${type}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] text-slate-500">{t('common.leverage')}</label>
                <div className="relative">
                  <select
                    value={leverage}
                    onChange={(event) => setLeverage(Number(event.target.value))}
                    disabled={isLeverageLocked}
                    className="h-[38px] w-full appearance-none rounded-md border border-white/[0.08] bg-[#161a1e] px-3 font-mono text-xs font-semibold text-white outline-none transition focus:border-violet-400/50 disabled:cursor-not-allowed"
                  >
                    {leverageOptions.map((option) => <option key={option} value={option}>{option}x</option>)}
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-violet-300">{leverage}x</span>
                </div>
              </div>
            </div>

            <div className="mb-3 flex items-center justify-between text-[11px]">
              <span className="text-slate-500">{t('trading.availableMargin')}</span>
              <span className="font-mono font-medium tabular-nums text-slate-200">{formatFiat(availableBalance !== undefined ? availableBalance : usdtBalance)}</span>
            </div>

            <label className="mb-1.5 flex items-center justify-between text-[11px] text-slate-500">
              <span>{orderType === 'market' ? 'Mark price' : 'Limit price'}</span>
              <span className="text-slate-600">EUR</span>
            </label>
            {orderType === 'market' ? (
              <div className={`mb-3 flex h-11 items-center justify-between rounded-md border border-white/[0.09] bg-[#161a1e] px-3 font-mono text-sm tabular-nums ${priceColorClass} ${priceFlashClass}`}>
                <span>{convertUsdToEur(livePairPrice).toFixed(4)}</span>
                <span className="text-[10px] font-sans text-slate-600">Market</span>
              </div>
            ) : (
              <div className="relative mb-3">
                <input
                  type="text"
                  inputMode="decimal"
                  value={limitPrice}
                  onChange={(event) => setLimitPrice(event.target.value)}
                  placeholder={convertUsdToEur(livePairPrice).toFixed(4)}
                  className="h-11 w-full rounded-md border border-white/[0.09] bg-[#161a1e] px-3 pr-14 font-mono text-sm text-white outline-none transition placeholder:text-slate-700 hover:border-white/[0.16] focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/20"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-500">EUR</span>
              </div>
            )}

            <label className="mb-1.5 flex items-center justify-between text-[11px] text-slate-500">
              <span>{t('futures.amount')}</span>
              <span>{baseAsset}</span>
            </label>
            <div className="relative mb-2">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.0000"
                value={activeAmount}
                onChange={(event) => updateAmount(event.target.value)}
                className="h-11 w-full rounded-md border border-white/[0.09] bg-[#161a1e] px-3 pr-14 font-mono text-sm text-white outline-none transition placeholder:text-slate-700 hover:border-white/[0.16] focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/20"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-500">{baseAsset}</span>
            </div>

            <div className="relative mb-5 pt-3">
              <div className="absolute left-2 right-2 top-[18px] h-px bg-slate-700" />
              <div className="relative grid grid-cols-4">
                {percentageOptions.map((percentage) => (
                  <button
                    key={percentage}
                    type="button"
                    onClick={() => updatePercentage(percentage)}
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

            <dl className="mb-4 space-y-2 border-t border-white/[0.07] pt-3 text-[11px]">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">{t('trading.requiredMargin')}</dt><dd className="font-mono tabular-nums text-slate-300">{formatFiat(requiredMargin)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Est. liquidation</dt><dd className="font-mono tabular-nums text-rose-300">{formatFiatPrice(liquidationPrice)}</dd></div>
              {activeSpreadInfo && <div className="flex justify-between gap-3"><dt className="text-slate-500">Spread ({activeSpreadInfo.percentage})</dt><dd className="font-mono tabular-nums text-amber-300">{formatFiat(parseFloat(activeSpreadInfo.cost))}</dd></div>}
            </dl>

            <button
              type="button"
              onClick={isLong ? handleLong : handleShort}
              disabled={canSubmit}
              className={`h-12 w-full rounded-md text-sm font-bold text-white shadow-lg transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500 ${isLong ? 'bg-emerald-500 shadow-emerald-500/15' : 'bg-rose-500 shadow-rose-500/15'}`}
            >
              {isSubmitting ? 'Placing order...' : isLong ? t('futures.buyLong') : t('futures.sellShort')}
            </button>
          </div>
        </div>

        <TakeProfitStopLossModal allowLimitExecution={false} isOpen={showLongSLModal} onClose={() => setShowLongSLModal(false)} type="stopLoss" side="long" entryPrice={orderEntryPrice} amount={parseFloat(longAmount) || 0} leverage={leverage} onConfirm={(price, type, execPrice) => setLongStopLoss({ trigger_price: price, execution_type: type, execution_price: execPrice })} />
        <TakeProfitStopLossModal allowLimitExecution={false} isOpen={showLongTPModal} onClose={() => setShowLongTPModal(false)} type="takeProfit" side="long" entryPrice={orderEntryPrice} amount={parseFloat(longAmount) || 0} leverage={leverage} onConfirm={(price, type, execPrice) => setLongTakeProfit({ trigger_price: price, execution_type: type, execution_price: execPrice })} />
        <TakeProfitStopLossModal allowLimitExecution={false} isOpen={showShortSLModal} onClose={() => setShowShortSLModal(false)} type="stopLoss" side="short" entryPrice={orderEntryPrice} amount={parseFloat(shortAmount) || 0} leverage={leverage} onConfirm={(price, type, execPrice) => setShortStopLoss({ trigger_price: price, execution_type: type, execution_price: execPrice })} />
        <TakeProfitStopLossModal allowLimitExecution={false} isOpen={showShortTPModal} onClose={() => setShowShortTPModal(false)} type="takeProfit" side="short" entryPrice={orderEntryPrice} amount={parseFloat(shortAmount) || 0} leverage={leverage} onConfirm={(price, type, execPrice) => setShortTakeProfit({ trigger_price: price, execution_type: type, execution_price: execPrice })} />
      </>
    );
  }

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
              disabled={isSubmitting || livePairPrice <= 0}
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
              disabled={isSubmitting || livePairPrice <= 0}
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
