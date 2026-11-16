import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, Copy, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { depositMethodLabels, formatFundingAmount, fundingStatusLabel, instructionFields, type DepositCurrency, type DepositMethod, type FundingRequest, type PaymentInstructions } from '../lib/funding';
import AppSelect from './AppSelect';

interface Props {
  userId: string;
  method: DepositMethod;
  onSubmitted?: () => void;
  defaultCurrency?: 'EUR' | 'USD';
}

export default function ManualDepositRequest({ userId, method, onSubmitted, defaultCurrency = 'EUR' }: Props) {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<DepositCurrency>(method === 'btc' ? 'BTC' : defaultCurrency);
  const [instructions, setInstructions] = useState<PaymentInstructions | null>(null);
  const [requests, setRequests] = useState<FundingRequest[]>([]);
  const [request, setRequest] = useState<FundingRequest | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const submission = useRef<{ signature: string; id: string } | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const [settings, history] = await Promise.all([
        supabase.rpc('get_deposit_payment_instructions', { p_method: method }),
        supabase.from('transactions').select('*').eq('user_id', userId).eq('type', 'deposit')
          .eq('deposit_details->>method', method).order('created_at', { ascending: false }).limit(10),
      ]);
      if (!active) return;
      setLoadingDetails(false);
      setLoadError(settings.error?.message || history.error?.message || null);
      if (!settings.error) setInstructions(settings.data as PaymentInstructions);
      if (!history.error) {
        const rows = (history.data || []) as FundingRequest[];
        setRequests(rows);
        setRequest(current => current ? rows.find(row => row.id === current.id) || current : null);
      }
    };
    void refresh();
    const channel = supabase.channel(`funding-${userId}-${method}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${userId}` }, () => void refresh())
      .subscribe();
    const timer = window.setInterval(() => void refresh(), 15_000);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      void supabase.removeChannel(channel);
    };
  }, [userId, method]);

  const submitRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const value = Number(amount);
    const minimum = currency === 'BTC' ? 0.0001 : 10;
    const precision = currency === 'BTC' ? 8 : 2;
    if (!Number.isFinite(value) || value < minimum || value > 1_000_000) {
      setError(`Enter an amount between ${formatFundingAmount(minimum, currency)} and ${formatFundingAmount(1_000_000, currency)}.`);
      return;
    }
    if (Math.abs(value - Number(value.toFixed(precision))) > Number.EPSILON * Math.max(1, value)) {
      setError(`Use at most ${precision} decimal places.`);
      return;
    }
    const signature = `${method}:${currency}:${value}`;
    if (submission.current?.signature !== signature) submission.current = { signature, id: crypto.randomUUID() };
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('request_manual_deposit', {
        p_method: method, p_amount: value, p_currency: currency, p_request_id: submission.current.id,
      });
      if (rpcError) throw rpcError;
      if (!data?.id) throw new Error('The request could not be confirmed. Please try again.');
      const next = data as FundingRequest;
      setRequest(next);
      setRequests(current => [next, ...current.filter(row => row.id !== next.id)].slice(0, 10));
      submission.current = null;
      onSubmitted?.();
    } catch (problem) {
      setError(problem && typeof problem === 'object' && 'message' in problem ? String(problem.message) : 'Unable to submit your deposit request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Current CRM instructions must also become visible when they are configured
  // after submission. The transaction keeps its original snapshot for auditing.
  const details = instructions?.details || {};
  const visibleFields = [...instructionFields[method], { key: 'instructions', label: 'Additional instructions' }]
    .filter(field => details[field.key]?.trim());
  const copy = async (key: string, value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(key); }
    catch { setError('Copy is unavailable. Please select and copy the payment details.'); }
  };

  return <div className="space-y-5">
    <section className="app-surface-muted rounded-xl p-5">
      <h4 className="font-semibold text-white">{depositMethodLabels[method]} payment details</h4>
      {loadingDetails ? <p className="mt-3 flex items-center gap-2 text-sm text-slate-400"><RefreshCw size={16} className="animate-spin" />Loading payment instructions…</p>
        : visibleFields.length ? <dl className="mt-4 space-y-4">{visibleFields.map(field => <div key={field.key}>
          <dt className="text-xs text-slate-400">{field.label}</dt>
          <dd className="mt-1 flex items-start justify-between gap-3 text-sm text-white"><span className="whitespace-pre-wrap break-all">{details[field.key]}</span><button type="button" onClick={() => void copy(field.key, details[field.key])} aria-label={`Copy ${field.label}`} className="shrink-0 text-slate-400 hover:text-white">{copied === field.key ? <CheckCircle size={16} /> : <Copy size={16} />}</button></dd>
        </div>)}</dl>
          : <p className="mt-3 text-sm text-slate-400">You can submit a deposit request now. Your account manager will provide payment instructions when available.</p>}
      {method !== 'bank' && visibleFields.length > 0 && <p className="mt-4 text-xs text-slate-400">Use only the asset and network shown above. Network fees may apply.</p>}
    </section>

    {loadError && <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">Payment details or history could not be refreshed: {loadError}</div>}

    {!request ? <form onSubmit={submitRequest} className="space-y-5">
      {method !== 'btc' && <div><label htmlFor="deposit-currency" className="mb-2 block text-sm text-slate-400">Account currency</label>
        <AppSelect id="deposit-currency" value={currency} onChange={event => setCurrency(event.target.value as DepositCurrency)} className="w-full"><option value="EUR">Euro (EUR)</option><option value="USD">US Dollar (USD)</option></AppSelect>
      </div>}
      <div><label htmlFor="deposit-amount" className="mb-2 block text-sm text-slate-400">Deposit amount ({currency})</label>
        <input id="deposit-amount" type="number" inputMode="decimal" min={currency === 'BTC' ? '0.0001' : '10'} max="1000000" step={currency === 'BTC' ? '0.00000001' : '0.01'} required value={amount} onChange={event => setAmount(event.target.value)} placeholder={currency === 'BTC' ? '0.00010000' : '0.00'} className="app-input w-full rounded-xl px-4 py-3" />
        <p className="mt-2 text-xs text-slate-500">Minimum: {formatFundingAmount(currency === 'BTC' ? 0.0001 : 10, currency)}.{method === 'crypto' && ` Enter the value to be credited to your ${currency} account.`}</p>
      </div>
      <button type="submit" disabled={submitting || !amount} className="app-action-primary flex w-full items-center justify-center gap-2 rounded-xl py-3 font-semibold text-white disabled:opacity-50">{submitting ? <RefreshCw size={18} className="animate-spin" /> : <Clock size={18} />}{submitting ? 'Submitting…' : 'Submit deposit request'}</button>
      <p className="text-center text-xs leading-5 text-slate-400">Your request starts as pending. Funds are credited after your deposit has been reviewed and approved.</p>
    </form> : <section role="status" className={`rounded-xl border p-5 ${request.status === 'completed' ? 'border-emerald-500/30 bg-emerald-500/10' : request.status === 'failed' ? 'border-red-500/30 bg-red-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
      <div className="flex items-center gap-3">{request.status === 'completed' ? <CheckCircle className="text-emerald-400" /> : request.status === 'failed' ? <AlertTriangle className="text-red-400" /> : <Clock className="text-amber-400" />}<div><p className="font-semibold text-white">{formatFundingAmount(request.amount, request.currency)}</p><p className="text-sm text-slate-300">{fundingStatusLabel(request)}</p></div></div>
      <p className="mt-3 text-sm text-slate-300">{request.status === 'pending' ? 'Your deposit request has been received and is awaiting approval. You can track its status here or in your transactions.' : request.status === 'completed' ? 'Your deposit has been approved and credited to your account.' : 'This deposit request was not approved. Contact your account manager for assistance.'}</p>
      <p className="mt-3 break-all text-xs text-slate-400">Reference: {request.id}</p>
      <button type="button" onClick={() => { setRequest(null); setAmount(''); setError(null); }} className="app-action-soft mt-4 w-full rounded-xl py-2 text-white">New deposit request</button>
    </section>}

    {error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"><AlertTriangle size={18} className="shrink-0" />{error}</div>}
    {requests.length > 0 && <section><h4 className="mb-3 text-sm font-semibold text-white">Recent {depositMethodLabels[method]} requests</h4><div className="space-y-2">{requests.map(row => <div key={row.id} className="app-surface-muted rounded-xl p-3"><div className="flex flex-wrap justify-between gap-2 text-sm"><span className="font-medium text-white">{formatFundingAmount(row.amount, row.currency)}</span><span className={row.status === 'pending' ? 'text-amber-400' : row.status === 'completed' ? 'text-emerald-400' : 'text-red-400'}>{fundingStatusLabel(row)}</span></div><div className="mt-1 text-xs text-slate-400">{new Date(row.created_at).toLocaleString()}</div><div className="mt-1 break-all text-xs text-slate-500">Reference: {row.id}</div></div>)}</div></section>}
  </div>;
}
