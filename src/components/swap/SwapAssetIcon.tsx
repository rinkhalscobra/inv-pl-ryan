import { DollarSign, Euro } from 'lucide-react';
import type { SwapCurrency } from './types';

export default function SwapAssetIcon({ currency }: { currency: SwapCurrency }) {
  if (currency.symbol === 'EUR') {
    return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white"><Euro size={18} strokeWidth={2.5} /></span>;
  }
  if (currency.symbol === 'USD') {
    return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"><DollarSign size={18} strokeWidth={2.5} /></span>;
  }

  return (
    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full app-icon-tile">
      <img src={currency.iconUrl} alt="" className="h-full w-full object-contain" onError={event => {
        event.currentTarget.style.display = 'none';
        event.currentTarget.nextElementSibling?.classList.remove('hidden');
        event.currentTarget.nextElementSibling?.classList.add('flex');
      }} />
      <span className="absolute inset-0 hidden items-center justify-center text-sm font-bold text-white">
        {currency.symbol.substring(0, 2)}
      </span>
    </span>
  );
}
