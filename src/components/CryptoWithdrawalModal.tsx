import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Bitcoin, CheckCircle, Copy, X } from 'lucide-react';
import { useFiatCurrency } from '../hooks/useFiatCurrency';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  btcBalance: number;
  currentBtcPrice: number;
  onWithdraw: (amount: number, address: string, network: string) => Promise<string>;
}

const FEE = 0.0005;

const CryptoWithdrawalModal: React.FC<Props> = ({ isOpen, onClose, btcBalance, currentBtcPrice, onWithdraw }) => {
  const { formatFiat } = useFiatCurrency();
  const [amount, setAmount] = useState('');
  const [address, setAddress] = useState('');
  const [network, setNetwork] = useState('BTC');
  const [step, setStep] = useState<'form' | 'confirmation' | 'success'>('form');
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setAmount(''); setAddress(''); setNetwork('BTC'); setStep('form');
    setTransactionId(null); setError(null); setLoading(false);
  }, [isOpen]);

  if (!isOpen) return null;
  const value = Number(amount);
  const receives = Number.isFinite(value) ? Math.max(0, value - FEE) : 0;

  const validate = () => {
    if (!Number.isFinite(value) || value < 0.001) return 'Minimum BTC withdrawal is 0.001 BTC.';
    if (value > btcBalance) return 'Insufficient BTC balance.';
    const target = address.trim();
    if (network === 'Lightning') return /^lnbc[0-9a-z]{20,}$/i.test(target) ? null : 'Enter a valid Bitcoin Lightning invoice.';
    return /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{20,}$/i.test(target) ? null : 'Enter a valid Bitcoin address.';
  };

  const review = (event: React.FormEvent) => {
    event.preventDefault();
    const problem = validate();
    if (problem) return setError(problem);
    setError(null); setStep('confirmation');
  };

  const confirm = async () => {
    setLoading(true); setError(null);
    try {
      setTransactionId(await onWithdraw(value, address.trim(), network));
      setStep('success');
    } catch (err: any) {
      setError(err?.message || 'Withdrawal failed.'); setStep('form');
    } finally { setLoading(false); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm">
    <div className="app-surface-primary max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl p-5 shadow-2xl sm:p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/20"><Bitcoin size={21} className="text-orange-400" /></div><h2 className="text-xl font-semibold text-white">{step === 'form' ? 'Withdraw Bitcoin' : step === 'confirmation' ? 'Confirm Withdrawal' : 'Withdrawal Initiated'}</h2></div>
        <button onClick={onClose} aria-label="Close withdrawal" title="Close" className="text-slate-400 hover:text-white"><X size={20} /></button>
      </div>
      {error && <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><span>{error}</span></div>}

      {step === 'form' && <form onSubmit={review} className="space-y-5">
        <div><div className="mb-2 flex justify-between text-sm text-slate-400"><label htmlFor="btc-withdrawal-amount">Amount</label><span>Available: {btcBalance.toFixed(8)} BTC</span></div>
          <div className="relative"><input id="btc-withdrawal-amount" value={amount} onChange={e => /^\d*(\.\d{0,8})?$/.test(e.target.value) && setAmount(e.target.value)} inputMode="decimal" placeholder="0.00100000" className="app-input w-full rounded-xl px-4 py-3 pr-24 text-white" /><div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2"><button type="button" onClick={() => setAmount(btcBalance.toFixed(8))} className="text-xs text-blue-400">MAX</button><span className="text-sm text-slate-400">BTC</span></div></div>
          <p className="mt-1 text-xs text-slate-500">Minimum: 0.001 BTC. Network fee: 0.0005 BTC.</p></div>
        <div><label htmlFor="btc-withdrawal-address" className="mb-2 block text-sm text-slate-400">Recipient address or invoice</label><input id="btc-withdrawal-address" value={address} onChange={e => setAddress(e.target.value)} placeholder={network === 'Lightning' ? 'lnbc...' : 'bc1...'} autoComplete="off" className="app-input w-full rounded-xl px-4 py-3 text-white" /></div>
        <div><label htmlFor="btc-withdrawal-network" className="mb-2 block text-sm text-slate-400">Network</label><select id="btc-withdrawal-network" value={network} onChange={e => setNetwork(e.target.value)} className="app-input custom-select w-full rounded-xl px-4 py-3 text-white"><option value="BTC">Bitcoin Network</option><option value="Lightning">Lightning Network</option></select></div>
        <div className="space-y-2 rounded-xl border border-slate-700/40 bg-slate-900/30 p-4 text-sm"><div className="flex justify-between"><span className="text-slate-400">Network fee</span><span>0.0005 BTC</span></div><div className="flex justify-between"><span className="text-slate-400">Recipient receives</span><span>{receives.toFixed(8)} BTC</span></div></div>
        <button type="submit" disabled={!amount || !address || loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-400"><ArrowUpRight size={18} /> Review Withdrawal</button>
      </form>}

      {step === 'confirmation' && <div className="space-y-5"><div className="app-surface-muted space-y-3 rounded-xl p-4 text-sm"><div className="text-center"><div className="text-slate-400">Withdrawal amount</div><div className="text-2xl font-bold text-white">{value.toFixed(8)} BTC</div><div className="text-slate-400">{currentBtcPrice > 0 ? `Approx. ${formatFiat(value * currentBtcPrice)}` : 'Live fiat price unavailable'}</div></div><div className="flex justify-between"><span className="text-slate-400">Network</span><span>{network}</span></div><div className="flex justify-between gap-4"><span className="text-slate-400">Recipient</span><span className="break-all text-right font-mono text-xs">{address}</span></div><div className="flex justify-between"><span className="text-slate-400">Recipient receives</span><span>{receives.toFixed(8)} BTC</span></div></div><div className="flex gap-3"><button onClick={() => setStep('form')} disabled={loading} className="app-action-soft flex-1 rounded-xl py-3 text-white">Back</button><button onClick={confirm} disabled={loading} className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white disabled:bg-slate-700">{loading ? 'Submitting...' : 'Confirm'}</button></div></div>}

      {step === 'success' && <div className="space-y-5 text-center"><CheckCircle size={52} className="mx-auto text-green-400" /><div><h3 className="text-xl font-semibold text-white">Request submitted</h3><p className="mt-2 text-sm text-slate-300">Your BTC is reserved and the request is visible in transaction history.</p></div>{transactionId && <div className="app-surface-muted rounded-xl p-4 text-left"><div className="text-xs text-slate-400">Transaction reference</div><div className="mt-1 flex items-center justify-between gap-2"><span className="break-all font-mono text-xs text-white">{transactionId}</span><button onClick={() => navigator.clipboard.writeText(transactionId)} aria-label="Copy transaction reference" title="Copy" className="shrink-0 text-slate-400"><Copy size={16} /></button></div></div>}<button onClick={onClose} className="app-action-soft w-full rounded-xl py-3 text-white">Close</button></div>}
    </div>
  </div>;
};

export default CryptoWithdrawalModal;
