import { ArrowDown, X } from 'lucide-react';
import SwapAssetIcon from './SwapAssetIcon';
import type { SwapCurrency } from './types';

interface SwapConfirmationDialogProps {
  fromCurrency: SwapCurrency;
  toCurrency: SwapCurrency;
  fromAmount: string;
  toAmount: string;
  rate: number;
  fee: number;
  isSwapping: boolean;
  formatAssetAmount: (amount: number, symbol: string) => string;
  formatAssetValue: (amount: number, side: 'from' | 'to') => string;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function SwapConfirmationDialog({ fromCurrency, toCurrency, fromAmount, toAmount, rate,
  fee, isSwapping, formatAssetAmount, formatAssetValue, onCancel, onConfirm }: SwapConfirmationDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/76 p-4 backdrop-blur-sm" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="swap-confirm-title" className="w-full max-w-md rounded-2xl app-auth-card app-modal-opaque p-4 sm:p-6 md:p-8">
        <div className="mb-6 flex items-center justify-between"><h2 id="swap-confirm-title" className="text-xl font-bold text-white">Confirm swap</h2><button type="button" onClick={onCancel} aria-label="Close confirmation" className="text-slate-400 transition-colors hover:text-white"><X size={20} /></button></div>
        <div className="mb-6 space-y-4">
          <div className="rounded-xl app-surface-muted p-4"><div className="mb-1 text-sm text-slate-400">You pay</div><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-2"><SwapAssetIcon currency={fromCurrency} /><span className="font-medium text-white">{fromCurrency.symbol}</span></div><div className="text-left sm:text-right"><div className="font-bold text-white">{formatAssetAmount(parseFloat(fromAmount), fromCurrency.symbol)}</div><div className="text-sm text-slate-400">≈ {formatAssetValue(parseFloat(fromAmount) || 0, 'from')}</div></div></div></div>
          <div className="flex justify-center"><ArrowDown size={20} className="text-slate-400" /></div>
          <div className="rounded-xl app-surface-muted p-4"><div className="mb-1 text-sm text-slate-400">You receive</div><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-2"><SwapAssetIcon currency={toCurrency} /><span className="font-medium text-white">{toCurrency.symbol}</span></div><div className="text-left sm:text-right"><div className="font-bold text-white">{formatAssetAmount(parseFloat(toAmount), toCurrency.symbol)}</div><div className="text-sm text-slate-400">≈ {formatAssetValue(parseFloat(toAmount) || 0, 'to')}</div></div></div></div>
          <div className="space-y-2 rounded-xl app-surface-muted p-4"><div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="text-slate-400">Exchange rate</span><span className="break-all text-white sm:text-right">1 {fromCurrency.symbol} = {rate > 0 ? rate.toFixed(8) : '--'} {toCurrency.symbol}</span></div><div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="text-slate-400">Fee (0.1%)</span><span className="text-white sm:text-right">{formatAssetAmount(fee, fromCurrency.symbol)} {fromCurrency.symbol}</span></div></div>
        </div>
        <div className="flex flex-col-reverse gap-3 sm:flex-row"><button type="button" onClick={onCancel} className="flex-1 rounded-xl app-action-soft py-3 font-medium text-white transition-colors">Cancel</button><button type="button" onClick={onConfirm} disabled={isSwapping} className="flex-1 rounded-xl app-action-primary py-3 font-medium text-white transition-all disabled:cursor-not-allowed">{isSwapping ? 'Swapping...' : 'Confirm swap'}</button></div>
      </div>
    </div>
  );
}
