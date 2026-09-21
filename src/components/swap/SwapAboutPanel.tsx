import { CheckCircle, Clock, Info, Smartphone, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function SwapAboutPanel() {
  const { t } = useTranslation();
  return (
    <section className="mx-auto w-full max-w-[1440px] px-4 pb-6 sm:px-6 lg:px-8" aria-label="About asset swaps">
      <div className="rounded-xl border border-white/[0.08] bg-[#11151b] p-4 sm:p-6">
        <div className="mb-4 flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg app-icon-tile"><Info size={16} className="text-white" /></span><h2 className="text-lg font-semibold text-white">About asset swaps</h2></div>
        <p className="mb-4 text-sm leading-relaxed text-slate-300">{t('swap.aboutDescription')}</p>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><CheckCircle size={14} className="text-emerald-400" />{t('swap.advantages')}</h3>
        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <span className="flex items-center gap-2 text-slate-300"><Zap size={14} className="text-emerald-400" />{t('swap.instantExecution')}</span>
          <span className="flex items-center gap-2 text-slate-300"><Clock size={14} className="text-blue-400" />{t('swap.noOrderBookWaiting')}</span>
          <span className="flex items-center gap-2 text-slate-300"><Smartphone size={14} className="text-purple-400" />{t('swap.simpleInterface')}</span>
          <span className="font-medium text-green-400">0.1% fee</span>
          {[t('swap.noGasFees'), t('swap.noNetworkFees'), t('swap.noHiddenCosts')].map(label => <span key={label} className="flex items-center gap-2 text-slate-300"><CheckCircle size={14} className="text-green-400" />{label}</span>)}
        </div>
      </div>
    </section>
  );
}
