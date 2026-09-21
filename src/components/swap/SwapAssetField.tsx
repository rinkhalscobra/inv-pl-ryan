import type { RefObject } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SwapAssetIcon from './SwapAssetIcon';
import type { SwapCurrency } from './types';

export interface SwapAssetFieldProps {
  side: 'from' | 'to';
  currency: SwapCurrency;
  amount: string;
  onAmountChange: (value: string) => void;
  approximateValue: string;
  currencies: SwapCurrency[];
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (currency: SwapCurrency) => void;
  dropdownRef: RefObject<HTMLDivElement>;
  formatBalance: (currency: SwapCurrency) => string;
  formatFiat: (value: number) => string;
  onMax?: () => void;
}

export default function SwapAssetField({ side, currency, amount, onAmountChange, approximateValue,
  currencies, searchTerm, onSearchTermChange, isOpen, onToggle, onSelect, dropdownRef,
  formatBalance, formatFiat, onMax }: SwapAssetFieldProps) {
  const { t } = useTranslation();
  const title = side === 'from' ? t('swap.from') : t('swap.to');

  return (
    <div className={side === 'from' ? 'mb-2' : 'mb-6'}>
      <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-slate-400">{title}</span>
        <span className="text-sm text-slate-400 sm:text-right">{t('common.balance')}: {formatBalance(currency)} {currency.symbol}</span>
      </div>
      <div className="rounded-xl app-surface-muted p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <input type="text" inputMode="decimal" value={amount} onChange={event => onAmountChange(event.target.value)}
            placeholder={side === 'from' ? t('swap.enterAmount') : '0.00'}
            aria-label={`${title} amount`}
            className="w-full min-w-0 bg-transparent text-2xl font-medium text-white focus:outline-none sm:text-3xl" />
          <div className="relative w-full sm:w-auto" ref={dropdownRef}>
            <button type="button" onClick={onToggle} aria-expanded={isOpen} aria-haspopup="listbox"
              className="flex w-full items-center justify-between gap-2 rounded-xl app-action-soft px-4 py-2 transition-colors sm:w-auto">
              <SwapAssetIcon currency={currency} />
              <span className="font-medium text-white">{currency.symbol}</span>
              <ChevronDown size={16} className="text-slate-400" />
            </button>
            {isOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 max-h-96 w-full overflow-hidden rounded-xl app-dropdown sm:w-80">
                <div className="border-b border-slate-700 p-4">
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="search" placeholder="Search assets..." value={searchTerm}
                      onChange={event => onSearchTermChange(event.target.value)}
                      className="w-full rounded-lg app-input py-2 pl-10 pr-4" />
                  </div>
                </div>
                <div role="listbox" aria-label={`${title} asset`} className="max-h-64 overflow-y-auto [scrollbar-color:#a855f7_#312e81] [scrollbar-width:thin]">
                  {currencies.map(option => (
                    <button key={option.symbol} type="button" role="option" aria-selected={option.symbol === currency.symbol}
                      onClick={() => onSelect(option)}
                      className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-purple-500/10">
                      <span className="flex min-w-0 items-center gap-3">
                        <SwapAssetIcon currency={option} />
                        <span className="min-w-0"><span className="block font-medium text-white">{option.symbol}</span><span className="block truncate text-sm text-slate-400">{option.name}</span></span>
                      </span>
                      <span className="shrink-0 text-right"><span className="block text-white">{formatBalance(option)}</span><span className="block text-sm text-slate-400">{formatFiat(option.price || 0)}</span></span>
                    </button>
                  ))}
                  {currencies.length === 0 && <div className="p-4 text-center text-sm text-slate-400">No assets found</div>}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-sm text-slate-400">≈ {approximateValue}</span>
          {onMax && <button type="button" onClick={onMax} className="text-sm font-medium text-blue-400 transition-colors hover:text-blue-300">MAX</button>}
        </div>
      </div>
    </div>
  );
}
