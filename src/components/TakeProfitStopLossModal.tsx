import React, { useState, useEffect, useMemo } from 'react';
import { X, Percent, Euro, TrendingUp, TrendingDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFiatCurrency } from '../hooks/useFiatCurrency';

interface TakeProfitStopLossModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'takeProfit' | 'stopLoss';
  side: 'long' | 'short';
  entryPrice: number;
  amount: number;
  leverage: number;
  lotSize?: number;
  priceIsUsd?: boolean;
  variant?: 'vertical' | 'horizontal';
  onConfirm: (triggerPrice: number, executionType: 'market' | 'limit', executionPrice?: number) => void;
}

type InputMode = 'price' | 'pnl' | 'percentage';

const TakeProfitStopLossModal: React.FC<TakeProfitStopLossModalProps> = ({
  isOpen,
  onClose,
  type,
  side,
  entryPrice,
  amount,
  leverage,
  lotSize = 1,
  priceIsUsd = true,
  variant = 'vertical',
  onConfirm
}) => {
  const { t } = useTranslation();
  const { convertEurToUsd, convertUsdToEur, formatFiat, formatFiatPrice } = useFiatCurrency();
  const [inputMode, setInputMode] = useState<InputMode>('price');
  const [priceValue, setPriceValue] = useState('');
  const [pnlValue, setPnlValue] = useState('');
  const [percentageValue, setPercentageValue] = useState('');
  const [executionType, setExecutionType] = useState<'market' | 'limit'>('market');
  const [executionPrice, setExecutionPrice] = useState('');

  const isTP = type === 'takeProfit';
  const colorClass = isTP ? 'emerald' : 'red';

  useEffect(() => {
    if (!isOpen) {
      setPriceValue('');
      setPnlValue('');
      setPercentageValue('');
      setExecutionPrice('');
      setInputMode('price');
      setExecutionType('market');
    }
  }, [isOpen]);

  const actualPositionSize = amount * lotSize;
  const displayPrice = (price: number) => priceIsUsd ? formatFiatPrice(price) : price.toFixed(5);
  const parseDisplayPrice = (price: number) => priceIsUsd ? convertEurToUsd(price) : price;

  const calculatePriceFromPnL = (targetPnL: number): number => {
    if (side === 'long') {
      return entryPrice + (targetPnL / actualPositionSize);
    } else {
      return entryPrice - (targetPnL / actualPositionSize);
    }
  };

  const calculatePriceFromROI = (targetROI: number): number => {
    const margin = (actualPositionSize * entryPrice) / leverage;
    const targetPnL = (targetROI / 100) * margin;

    if (side === 'long') {
      return entryPrice + (targetPnL / actualPositionSize);
    } else {
      return entryPrice - (targetPnL / actualPositionSize);
    }
  };

  const calculatePnLFromPrice = (price: number): number => {
    if (side === 'long') {
      return (price - entryPrice) * actualPositionSize;
    } else {
      return (entryPrice - price) * actualPositionSize;
    }
  };

  const calculatePercentageFromPrice = (price: number): number => {
    return Math.abs(((price - entryPrice) / entryPrice) * 100);
  };

  const calculatedValues = useMemo(() => {
    let triggerPrice = 0;
    let pnl = 0;
    let percentage = 0;
    let roi = 0;

    if (inputMode === 'price' && priceValue) {
      triggerPrice = parseDisplayPrice(parseFloat(priceValue));
      pnl = calculatePnLFromPrice(triggerPrice);
      percentage = calculatePercentageFromPrice(triggerPrice);
    } else if (inputMode === 'pnl' && pnlValue) {
      pnl = convertEurToUsd(parseFloat(pnlValue));
      if (!isTP) {
        pnl = -Math.abs(pnl);
      }
      triggerPrice = calculatePriceFromPnL(pnl);
      percentage = calculatePercentageFromPrice(triggerPrice);
    } else if (inputMode === 'percentage' && percentageValue) {
      roi = parseFloat(percentageValue);
      if (!isTP) {
        roi = -Math.abs(roi);
      }
      triggerPrice = calculatePriceFromROI(roi);
      pnl = calculatePnLFromPrice(triggerPrice);
      percentage = calculatePercentageFromPrice(triggerPrice);
    }

    if (triggerPrice > 0 && inputMode !== 'percentage') {
      const margin = (actualPositionSize * entryPrice) / leverage;
      roi = (pnl / margin) * 100;
    }

    return { triggerPrice, pnl, percentage, roi };
  }, [inputMode, priceValue, pnlValue, percentageValue, entryPrice, amount, leverage, side, actualPositionSize, convertEurToUsd, isTP, priceIsUsd]);

  const handleInputChange = (mode: InputMode, value: string) => {
    const sanitized = value.replace(/[^0-9.]/g, '');
    if ((sanitized.match(/\./g) || []).length > 1) return;

    if (mode === 'price') {
      setPriceValue(sanitized);
    } else if (mode === 'pnl') {
      setPnlValue(sanitized);
    } else if (mode === 'percentage') {
      setPercentageValue(sanitized);
    }
  };

  const isValid = calculatedValues.triggerPrice > 0 && !isNaN(calculatedValues.triggerPrice);

  const validateTPSL = (): string | null => {
    if (!isValid) return 'Please enter a valid value';

    const { triggerPrice, pnl } = calculatedValues;

    if (isTP) {
      if (pnl <= 0) {
        return 'Take profit must result in a positive PnL';
      }
      if (side === 'long' && triggerPrice <= entryPrice) {
        return 'Take profit price must be above entry price for long positions';
      }
      if (side === 'short' && triggerPrice >= entryPrice) {
        return 'Take profit price must be below entry price for short positions';
      }
    } else {
      if (pnl >= 0) {
        return 'Stop loss must result in a negative PnL';
      }
      if (side === 'long' && triggerPrice >= entryPrice) {
        return 'Stop loss price must be below entry price for long positions';
      }
      if (side === 'short' && triggerPrice <= entryPrice) {
        return 'Stop loss price must be above entry price for short positions';
      }
    }

    if (executionType === 'limit') {
      const execPrice = parseDisplayPrice(parseFloat(executionPrice));
      if (!execPrice || execPrice <= 0) {
        return 'Please enter a valid execution price';
      }
    }

    return null;
  };

  const handleConfirm = () => {
    const error = validateTPSL();
    if (error) {
      alert(error);
      return;
    }

    const execPrice = executionType === 'limit' && executionPrice
      ? parseDisplayPrice(parseFloat(executionPrice))
      : undefined;

    onConfirm(calculatedValues.triggerPrice, executionType, execPrice);
    onClose();
  };

  if (!isOpen) return null;

  if (variant === 'horizontal') {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="app-auth-card rounded-2xl p-6 max-w-4xl w-full">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              {isTP ? (
                <TrendingUp className="text-emerald-400" size={24} />
              ) : (
                <TrendingDown className="text-red-400" size={24} />
              )}
              <h3 className={`text-xl font-bold text-${colorClass}-400`}>
                Edit {isTP ? 'Take Profit' : 'Stop Loss'}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Left side - Input controls */}
            <div className="space-y-4">
              <div className="app-surface-muted rounded-xl p-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-slate-400">Side:</span>
                    <span className={`ml-2 font-medium ${side === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {side.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Entry:</span>
                    <span className="ml-2 font-mono text-white">{displayPrice(entryPrice)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Amount:</span>
                    <span className="ml-2 font-mono text-white">{amount.toFixed(6)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Leverage:</span>
                    <span className="ml-2 font-mono text-white">{leverage}x</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setInputMode('price')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                    inputMode === 'price'
                      ? `bg-${colorClass}-500/20 text-${colorClass}-400 border border-${colorClass}-500/50`
                      : 'app-control text-slate-400 hover:text-white'
                  }`}
                >
                  <Euro size={14} className="inline mr-1" />
                  Price
                </button>
                <button
                  onClick={() => setInputMode('pnl')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                    inputMode === 'pnl'
                      ? `bg-${colorClass}-500/20 text-${colorClass}-400 border border-${colorClass}-500/50`
                      : 'app-control text-slate-400 hover:text-white'
                  }`}
                >
                  PnL
                </button>
                <button
                  onClick={() => setInputMode('percentage')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                    inputMode === 'percentage'
                      ? `bg-${colorClass}-500/20 text-${colorClass}-400 border border-${colorClass}-500/50`
                      : 'app-control text-slate-400 hover:text-white'
                  }`}
                >
                  <Percent size={14} className="inline mr-1" />
                  %
                </button>
              </div>

              {inputMode === 'price' && (
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Trigger Price ({priceIsUsd ? 'EUR' : 'Rate'})</label>
                  <input
                    type="text"
                    value={priceValue}
                    onChange={(e) => handleInputChange('price', e.target.value)}
                    placeholder="0.00"
                    className={`w-full bg-slate-900/50 text-white px-4 py-3 rounded-lg border border-${colorClass}-500/30 focus:outline-none focus:ring-2 focus:ring-${colorClass}-500/50 font-mono`}
                  />
                </div>
              )}

              {inputMode === 'pnl' && (
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Target PnL (EUR)</label>
                  <input
                    type="text"
                    value={pnlValue}
                    onChange={(e) => handleInputChange('pnl', e.target.value)}
                    placeholder="0.00"
                    className={`w-full bg-slate-900/50 text-white px-4 py-3 rounded-lg border border-${colorClass}-500/30 focus:outline-none focus:ring-2 focus:ring-${colorClass}-500/50 font-mono mb-3`}
                  />
                  <div className="space-y-2">
                    <label className="block text-xs text-slate-500">Quick Select (% of Margin)</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={pnlValue ? Math.min(100, Math.abs((parseFloat(pnlValue) / convertUsdToEur((actualPositionSize * entryPrice) / leverage)) * 100)) : 0}
                      onChange={(e) => {
                        const percentage = parseFloat(e.target.value);
                        const margin = convertUsdToEur((actualPositionSize * entryPrice) / leverage);
                        const targetPnl = (percentage / 100) * margin;
                        handleInputChange('pnl', targetPnl.toFixed(2));
                      }}
                      className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider-thumb"
                      style={{
                        background: `linear-gradient(to right, ${isTP ? '#10b981' : '#ef4444'} 0%, ${isTP ? '#10b981' : '#ef4444'} ${pnlValue ? Math.min(100, Math.abs((parseFloat(pnlValue) / convertUsdToEur((actualPositionSize * entryPrice) / leverage)) * 100)) : 0}%, #334155 ${pnlValue ? Math.min(100, Math.abs((parseFloat(pnlValue) / convertUsdToEur((actualPositionSize * entryPrice) / leverage)) * 100)) : 0}%, #334155 100%)`
                      }}
                    />
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>0%</span>
                      <span>50%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>
              )}

              {inputMode === 'percentage' && (
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Target ROI (%)</label>
                  <input
                    type="text"
                    value={percentageValue}
                    onChange={(e) => handleInputChange('percentage', e.target.value)}
                    placeholder="0.00"
                    className={`w-full bg-slate-900/50 text-white px-4 py-3 rounded-lg border border-${colorClass}-500/30 focus:outline-none focus:ring-2 focus:ring-${colorClass}-500/50 font-mono mb-3`}
                  />
                  <div className="space-y-2">
                    <label className="block text-xs text-slate-500">Quick Select ROI</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={percentageValue ? Math.min(100, Math.abs(parseFloat(percentageValue))) : 0}
                      onChange={(e) => {
                        handleInputChange('percentage', e.target.value);
                      }}
                      className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider-thumb"
                      style={{
                        background: `linear-gradient(to right, ${isTP ? '#10b981' : '#ef4444'} 0%, ${isTP ? '#10b981' : '#ef4444'} ${percentageValue ? Math.min(100, Math.abs(parseFloat(percentageValue))) : 0}%, #334155 ${percentageValue ? Math.min(100, Math.abs(parseFloat(percentageValue))) : 0}%, #334155 100%)`
                      }}
                    />
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>0%</span>
                      <span>50%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right side - Preview and actions */}
            <div className="space-y-4">
              {isValid && (
                <div className={`bg-${colorClass}-500/10 rounded-xl p-4 border border-${colorClass}-500/30`}>
                  <h4 className="text-sm font-semibold text-slate-300 mb-3">Preview</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Trigger Price:</span>
                      <span className="font-mono text-white">{displayPrice(calculatedValues.triggerPrice)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Est. PnL:</span>
                      <span className={`font-mono font-bold ${calculatedValues.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatFiat(calculatedValues.pnl)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Price Change:</span>
                      <span className="font-mono text-white">{calculatedValues.percentage.toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">ROI:</span>
                      <span className={`font-mono font-bold ${calculatedValues.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {calculatedValues.roi.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm text-slate-400 mb-2">Execution Type</label>
                <select
                  value={executionType}
                  onChange={(e) => setExecutionType(e.target.value as 'market' | 'limit')}
                  className={`w-full bg-slate-900/50 text-white px-4 py-3 rounded-lg border border-${colorClass}-500/30 focus:outline-none focus:ring-2 focus:ring-${colorClass}-500/50`}
                >
                  <option value="market">Market</option>
                  <option value="limit">Limit</option>
                </select>
                {executionType === 'limit' && (
                  <input
                    type="text"
                    value={executionPrice}
                    onChange={(e) => setExecutionPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder={`Execution price (${priceIsUsd ? 'EUR' : 'rate'})`}
                    className={`w-full mt-2 bg-slate-900/50 text-white px-4 py-3 rounded-lg border border-${colorClass}-500/30 focus:outline-none focus:ring-2 focus:ring-${colorClass}-500/50 font-mono`}
                  />
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="flex-1 app-action-soft text-white py-3 rounded-xl font-semibold transition-all duration-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onConfirm(0, 'market');
                    onClose();
                  }}
                  className="flex-1 app-action-soft text-white py-3 rounded-xl font-semibold transition-all duration-300"
                >
                  Remove
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!isValid}
                  className={`flex-1 bg-gradient-to-r from-${colorClass}-500 to-${colorClass}-600 hover:from-${colorClass}-600 hover:to-${colorClass}-700 disabled:from-slate-700 disabled:to-slate-800 text-white py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-${colorClass}-500/25 disabled:shadow-none`}
                >
                  Update {isTP ? 'TP' : 'SL'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="app-auth-card rounded-2xl p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {isTP ? (
              <TrendingUp className="text-emerald-400" size={24} />
            ) : (
              <TrendingDown className="text-red-400" size={24} />
            )}
            <h3 className={`text-xl font-bold text-${colorClass}-400`}>
              {isTP ? 'Take Profit' : 'Stop Loss'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mb-6 app-surface-muted rounded-xl p-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-400">Side:</span>
              <span className={`ml-2 font-medium ${side === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>
                {side.toUpperCase()}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Entry:</span>
              <span className="ml-2 font-mono text-white">{displayPrice(entryPrice)}</span>
            </div>
            <div>
              <span className="text-slate-400">Amount:</span>
              <span className="ml-2 font-mono text-white">{amount.toFixed(6)}</span>
            </div>
            <div>
              <span className="text-slate-400">Leverage:</span>
              <span className="ml-2 font-mono text-white">{leverage}x</span>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setInputMode('price')}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                inputMode === 'price'
                  ? `bg-${colorClass}-500/20 text-${colorClass}-400 border border-${colorClass}-500/50`
                  : 'app-control text-slate-400 hover:text-white'
              }`}
            >
              <Euro size={14} className="inline mr-1" />
              Price
            </button>
            <button
              onClick={() => setInputMode('pnl')}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                inputMode === 'pnl'
                  ? `bg-${colorClass}-500/20 text-${colorClass}-400 border border-${colorClass}-500/50`
                  : 'app-control text-slate-400 hover:text-white'
              }`}
            >
              PnL
            </button>
            <button
              onClick={() => setInputMode('percentage')}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                inputMode === 'percentage'
                  ? `bg-${colorClass}-500/20 text-${colorClass}-400 border border-${colorClass}-500/50`
                  : 'app-control text-slate-400 hover:text-white'
              }`}
            >
              <Percent size={14} className="inline mr-1" />
              %
            </button>
          </div>

          {inputMode === 'price' && (
            <div>
              <label className="block text-sm text-slate-400 mb-2">Trigger Price ({priceIsUsd ? 'EUR' : 'Rate'})</label>
              <input
                type="text"
                value={priceValue}
                onChange={(e) => handleInputChange('price', e.target.value)}
                placeholder="0.00"
                className={`w-full bg-slate-900/50 text-white px-4 py-3 rounded-lg border border-${colorClass}-500/30 focus:outline-none focus:ring-2 focus:ring-${colorClass}-500/50 font-mono`}
              />
            </div>
          )}

          {inputMode === 'pnl' && (
            <div>
              <label className="block text-sm text-slate-400 mb-2">Target PnL (EUR)</label>
              <input
                type="text"
                value={pnlValue}
                onChange={(e) => handleInputChange('pnl', e.target.value)}
                placeholder="0.00"
                className={`w-full bg-slate-900/50 text-white px-4 py-3 rounded-lg border border-${colorClass}-500/30 focus:outline-none focus:ring-2 focus:ring-${colorClass}-500/50 font-mono mb-3`}
              />
              <div className="space-y-2">
                <label className="block text-xs text-slate-500">Quick Select (% of Margin)</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={pnlValue ? Math.min(100, Math.abs((parseFloat(pnlValue) / convertUsdToEur((actualPositionSize * entryPrice) / leverage)) * 100)) : 0}
                  onChange={(e) => {
                    const percentage = parseFloat(e.target.value);
                    const margin = convertUsdToEur((actualPositionSize * entryPrice) / leverage);
                    const targetPnl = (percentage / 100) * margin;
                    handleInputChange('pnl', targetPnl.toFixed(2));
                  }}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider-thumb"
                  style={{
                    background: `linear-gradient(to right, ${isTP ? '#10b981' : '#ef4444'} 0%, ${isTP ? '#10b981' : '#ef4444'} ${pnlValue ? Math.min(100, Math.abs((parseFloat(pnlValue) / convertUsdToEur((actualPositionSize * entryPrice) / leverage)) * 100)) : 0}%, #334155 ${pnlValue ? Math.min(100, Math.abs((parseFloat(pnlValue) / convertUsdToEur((actualPositionSize * entryPrice) / leverage)) * 100)) : 0}%, #334155 100%)`
                  }}
                />
                <div className="flex justify-between text-xs text-slate-500">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>
          )}

          {inputMode === 'percentage' && (
            <div>
              <label className="block text-sm text-slate-400 mb-2">Target ROI (%)</label>
              <input
                type="text"
                value={percentageValue}
                onChange={(e) => handleInputChange('percentage', e.target.value)}
                placeholder="0.00"
                className={`w-full bg-slate-900/50 text-white px-4 py-3 rounded-lg border border-${colorClass}-500/30 focus:outline-none focus:ring-2 focus:ring-${colorClass}-500/50 font-mono mb-3`}
              />
              <div className="space-y-2">
                <label className="block text-xs text-slate-500">Quick Select ROI</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={percentageValue ? Math.min(100, Math.abs(parseFloat(percentageValue))) : 0}
                  onChange={(e) => {
                    handleInputChange('percentage', e.target.value);
                  }}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider-thumb"
                  style={{
                    background: `linear-gradient(to right, ${isTP ? '#10b981' : '#ef4444'} 0%, ${isTP ? '#10b981' : '#ef4444'} ${percentageValue ? Math.min(100, Math.abs(parseFloat(percentageValue))) : 0}%, #334155 ${percentageValue ? Math.min(100, Math.abs(parseFloat(percentageValue))) : 0}%, #334155 100%)`
                  }}
                />
                <div className="flex justify-between text-xs text-slate-500">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {isValid && (
          <div className={`mb-4 bg-${colorClass}-500/10 rounded-xl p-4 border border-${colorClass}-500/30`}>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Trigger Price:</span>
                <span className="font-mono text-white">{displayPrice(calculatedValues.triggerPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Est. PnL:</span>
                <span className={`font-mono font-bold ${calculatedValues.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatFiat(calculatedValues.pnl)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Price Change:</span>
                <span className="font-mono text-white">{calculatedValues.percentage.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">ROI:</span>
                <span className={`font-mono font-bold ${calculatedValues.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {calculatedValues.roi.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="mb-6">
          <label className="block text-sm text-slate-400 mb-2">Execution Type</label>
          <select
            value={executionType}
            onChange={(e) => setExecutionType(e.target.value as 'market' | 'limit')}
            className={`w-full bg-slate-900/50 text-white px-4 py-3 rounded-lg border border-${colorClass}-500/30 focus:outline-none focus:ring-2 focus:ring-${colorClass}-500/50`}
          >
            <option value="market">Market</option>
            <option value="limit">Limit</option>
          </select>
          {executionType === 'limit' && (
            <input
              type="text"
              value={executionPrice}
              onChange={(e) => setExecutionPrice(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder={`Execution price (${priceIsUsd ? 'EUR' : 'rate'})`}
              className={`w-full mt-2 bg-slate-900/50 text-white px-4 py-3 rounded-lg border border-${colorClass}-500/30 focus:outline-none focus:ring-2 focus:ring-${colorClass}-500/50 font-mono`}
            />
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 app-action-soft text-white font-medium py-3 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm(0, 'market');
              onClose();
            }}
            className="flex-1 app-action-soft text-white font-medium py-3 rounded-xl transition-all"
          >
            Remove
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid}
            className={`flex-1 bg-gradient-to-r from-${colorClass}-500 to-${colorClass}-600 hover:from-${colorClass}-600 hover:to-${colorClass}-700 disabled:from-slate-600 disabled:to-slate-600 text-white font-medium py-3 rounded-xl transition-all disabled:cursor-not-allowed`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

export default TakeProfitStopLossModal;


