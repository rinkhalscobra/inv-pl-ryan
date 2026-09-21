import { AlertTriangle, ArrowDown, CheckCircle, Lock, RefreshCw } from 'lucide-react';
import SwapAssetField, { type SwapAssetFieldProps } from './SwapAssetField';
import type { SwapCurrency } from './types';

interface SwapTradePanelProps {
  fromField: SwapAssetFieldProps;
  toField: SwapAssetFieldProps;
  fromCurrency: SwapCurrency;
  toCurrency: SwapCurrency;
  fromAmount: string;
  toAmount: string;
  isSwapping: boolean;
  isBybitConnected: boolean;
  lockedPrices: boolean;
  remainingLockTime: number;
  swapError: string | null;
  swapSuccess: string | null;
  onRefresh: () => void;
  onUnlock: () => void;
  onReverse: () => void;
  onConfirm: () => void;
  getEffectivePrice: (side: 'from' | 'to') => number;
  calculateFee: () => number;
  formatAssetAmount: (amount: number, symbol: string) => string;
}

export default function SwapTradePanel({ fromField, toField, fromCurrency, toCurrency, fromAmount,
  toAmount, isSwapping, isBybitConnected, lockedPrices, remainingLockTime, swapError, swapSuccess,
  onRefresh, onUnlock, onReverse, onConfirm, getEffectivePrice, calculateFee, formatAssetAmount }: SwapTradePanelProps) {
  const fromPrice = getEffectivePrice('from');
  const toPrice = getEffectivePrice('to');
  const canQuote = fromPrice > 0 && toPrice > 0;

  return (
    <section className="relative z-20 mx-auto w-full max-w-2xl min-w-0 rounded-xl border border-white/[0.07] bg-[#11151b] p-4 sm:p-6" aria-label="Swap ticket">
      <div className="mb-6 flex flex-col gap-3 border-b border-white/[0.07] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-white">Swap ticket</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          {lockedPrices ? (
            <span className="flex items-center gap-2 rounded-md border border-violet-400/20 bg-violet-400/10 px-3 py-1.5 text-violet-200">
              <Lock size={14} /> Price locked: {Math.ceil(remainingLockTime / 1000)}s
            </span>
          ) : (
            <>
              <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${isBybitConnected ? 'bg-green-400' : 'bg-blue-400'}`} />{isBybitConnected ? 'Live prices' : 'Snapshot prices'}</span>
              {!isBybitConnected && <button type="button" onClick={onRefresh} className="flex items-center gap-1 text-blue-400 hover:text-blue-300" title="Refresh prices now"><RefreshCw size={14} /> Refresh</button>}
            </>
          )}
        </div>
      </div>

      {swapError && <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4"><AlertTriangle size={20} className="shrink-0 text-red-400" /><span className="text-red-400">{swapError}</span></div>}
      {swapSuccess && <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-green-500/30 bg-green-500/10 p-4"><CheckCircle size={20} className="shrink-0 text-green-400" /><span className="text-green-400">{swapSuccess}</span></div>}

      <SwapAssetField {...fromField} />
      <div className="my-4 flex justify-center"><button type="button" onClick={onReverse} aria-label="Reverse swap assets" className="rounded-full app-action-soft p-3 transition-colors"><ArrowDown size={20} className="text-slate-400" /></button></div>
      <SwapAssetField {...toField} />

      {fromAmount && toAmount && (
        <div className="mb-6 space-y-2 rounded-xl app-surface-muted p-4">
          <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2"><span className="text-slate-400">Exchange rate</span>
              <button type="button" onClick={lockedPrices ? onUnlock : onRefresh} className={`flex items-center gap-1 text-xs underline ${lockedPrices ? 'text-purple-400 hover:text-purple-300' : 'text-blue-400 hover:text-blue-300'}`} title={lockedPrices ? 'Unlock and refresh prices' : 'Refresh prices'}><RefreshCw size={12} />{lockedPrices ? 'Unlock & refresh' : 'Refresh'}</button>
            </div>
            <span className="break-all text-white sm:text-right">1 {fromCurrency.symbol} = {canQuote ? (fromPrice / toPrice).toFixed(8) : '--'} {toCurrency.symbol}</span>
          </div>
          <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="text-slate-400">Fee (0.1%)</span><span className="text-white sm:text-right">{formatAssetAmount(calculateFee(), fromCurrency.symbol)} {fromCurrency.symbol}</span></div>
          <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="text-slate-400">Minimum received</span><span className="text-white sm:text-right">{formatAssetAmount(parseFloat(toAmount) * 0.995, toCurrency.symbol)} {toCurrency.symbol}</span></div>
        </div>
      )}
      {fromAmount && !canQuote && <div className="mb-4 flex items-start gap-2 rounded-xl app-status-warning p-3 text-sm"><AlertTriangle size={16} className="shrink-0 text-purple-400" /><span className="text-purple-400">Price data unavailable. Click Refresh to update prices.</span></div>}
      <button type="button" onClick={onConfirm}
        disabled={!fromAmount || !toAmount || isSwapping || parseFloat(fromAmount) <= 0 || !canQuote}
        className="w-full rounded-xl app-action-primary py-4 font-medium transition-all disabled:cursor-not-allowed">
        {isSwapping ? 'Swapping...' : !canQuote ? 'Price unavailable' : 'Swap'}
      </button>
    </section>
  );
}
