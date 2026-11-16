import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, Loader2, RefreshCw, Save, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { depositMethodLabels, formatFundingAmount, fundingStatusLabel, instructionFields, type DepositMethod, type FundingRequest, type PaymentDetails, type PaymentInstructions } from '../lib/funding';
import AppSelect from './AppSelect';

interface Props {
  userId: string;
  auditReason: string;
  onReviewed: () => void;
}
interface InstructionSettings {
  shared: PaymentInstructions[];
  client: PaymentInstructions[];
}
const fieldClass = 'w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm text-white focus:border-purple-400 focus:outline-none';
const panelClass = 'rounded-2xl border border-slate-700/70 bg-slate-900/60 p-5';
const problemText = (problem: unknown) => problem && typeof problem === 'object' && 'message' in problem ? String(problem.message) : 'Unable to complete this action.';

export default function CRMFundingPanel({ userId, auditReason, onReviewed }: Props) {
  const [settings, setSettings] = useState<InstructionSettings>({ shared: [], client: [] });
  const [scope, setScope] = useState<'client' | 'shared'>('client');
  const [method, setMethod] = useState<DepositMethod>('btc');
  const [draft, setDraft] = useState<PaymentDetails>({});
  const [requests, setRequests] = useState<FundingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [review, setReview] = useState<{ row: FundingRequest; decision: 'approve' | 'reject' } | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  const loadRequests = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('admin_get_funding_requests', { p_target_user_id: userId });
    setLoading(false);
    setRequestError(rpcError?.message || null);
    if (!rpcError) setRequests((data || []) as FundingRequest[]);
  }, [userId]);

  const loadSettings = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('admin_get_deposit_payment_instructions', { p_target_user_id: userId });
    setLoadingSettings(false);
    setSettingsError(rpcError?.message || null);
    if (!rpcError) setSettings(data as InstructionSettings);
  }, [userId]);

  useEffect(() => {
    void loadSettings();
    void loadRequests();
    const channel = supabase.channel(`crm-funding-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${userId}` }, () => void loadRequests())
      .subscribe();
    const timer = window.setInterval(() => void loadRequests(), 15_000);
    return () => { window.clearInterval(timer); void supabase.removeChannel(channel); };
  }, [userId, loadSettings, loadRequests]);

  useEffect(() => {
    // Start a client override from the shared details so the admin can change
    // just the destination while retaining network / beneficiary information.
    const selected = settings[scope].find(row => row.method === method)
      || (scope === 'client' ? settings.shared.find(row => row.method === method) : undefined);
    setDraft(selected?.details || {});
  }, [scope, method, settings]);

  const saveInstructions = async (remove = false) => {
    setBusy('instructions'); setError(null); setMessage(null);
    try {
      const details = Object.fromEntries(Object.entries(draft).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()]));
      const { error: rpcError } = await supabase.rpc('admin_save_deposit_payment_instructions', {
        p_target_user_id: userId, p_scope: scope, p_method: method,
        p_details: remove ? null : details, p_reason: auditReason,
      });
      if (rpcError) throw rpcError;
      await loadSettings();
      setMessage(remove ? 'Client override removed. Shared payment details now apply.' : `Payment instructions saved for ${scope === 'client' ? 'this client' : 'all clients in this company'}.`);
    } catch (problem) { setError(problemText(problem)); }
    finally { setBusy(null); }
  };

  const submitReview = async () => {
    if (!review || !reviewNote.trim()) return;
    setBusy(review.row.id); setError(null); setMessage(null);
    try {
      const { error: rpcError } = await supabase.rpc('admin_review_funding_request', {
        p_target_user_id: userId, p_transaction_id: review.row.id,
        p_decision: review.decision, p_reason: reviewNote.trim(),
      });
      if (rpcError) throw rpcError;
      setMessage(`${review.row.type === 'withdrawal' ? 'Withdrawal' : 'Deposit'} ${review.decision === 'approve' ? 'approved' : 'rejected'}.`);
      setReview(null); setReviewNote('');
      await loadRequests();
      onReviewed();
    } catch (problem) { setError(problemText(problem)); }
    finally { setBusy(null); }
  };

  const hasOverride = settings.client.some(row => row.method === method);
  return <div className="space-y-5">
    <section className={panelClass}>
      <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="flex items-center gap-2 font-semibold text-white"><Clock size={18} className="text-amber-300" />Deposit & withdrawal requests</h3><p className="mt-1 text-xs text-slate-400">Requests belong to this client. Approving a deposit credits the wallet. Rejecting a withdrawal releases its reserved funds.</p></div><button type="button" onClick={() => void loadRequests()} disabled={busy !== null} aria-label="Refresh funding requests" className="text-slate-400 hover:text-white"><RefreshCw size={17} /></button></div>
      {requestError && <p role="alert" className="mb-3 text-sm text-red-300">{requestError}</p>}
      {loading ? <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={17} className="animate-spin" />Loading requests…</p>
        : requests.length === 0 ? <p className="text-sm text-slate-500">No deposit or withdrawal requests for this client.</p>
          : <div className="space-y-3">{requests.map(row => <article key={row.id} className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold capitalize text-white">{row.type === 'withdrawal' ? 'Withdrawal' : 'Deposit'} · {formatFundingAmount(Math.abs(row.amount), row.currency || 'EUR')}</p><p className="mt-1 text-xs text-slate-400">{row.deposit_details?.method ? depositMethodLabels[row.deposit_details.method] : row.withdrawal_details?.withdrawal_type === 'bank' ? 'Bank transfer' : row.currency === 'BTC' ? 'Bitcoin' : row.description}</p></div><span className={`rounded-full px-3 py-1 text-xs font-medium ${row.status === 'pending' ? 'bg-amber-500/15 text-amber-300' : row.status === 'completed' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>{fundingStatusLabel(row)}</span></div>
            <p className="mt-2 text-xs text-slate-500">{new Date(row.created_at).toLocaleString()}</p><p className="mt-1 break-all font-mono text-xs text-slate-500">{row.id}</p>
            {(row.withdrawal_details || row.deposit_details?.instructions) && <details className="mt-3 text-xs text-slate-400"><summary className="cursor-pointer">{row.type === 'withdrawal' ? 'Payout details' : 'Payment instructions at submission'}</summary><dl className="mt-3 grid gap-2 sm:grid-cols-2">{Object.entries(row.withdrawal_details || row.deposit_details?.instructions || {}).filter(([, value]) => value !== null && value !== '').map(([key, value]) => <div key={key}><dt className="capitalize text-slate-500">{key.replace(/_/g, ' ')}</dt><dd className="mt-1 whitespace-pre-wrap break-all text-slate-200">{String(value)}</dd></div>)}</dl></details>}
            {row.status === 'pending' && <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy !== null} onClick={() => { setReview({ row, decision: 'approve' }); setReviewNote(''); setError(null); }} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"><CheckCircle2 size={15} />Approve</button><button type="button" disabled={busy !== null} onClick={() => { setReview({ row, decision: 'reject' }); setReviewNote(''); setError(null); }} className="flex items-center gap-2 rounded-lg border border-red-500/40 px-4 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-40"><XCircle size={15} />Reject</button></div>}
          </article>)}</div>}
    </section>

    <section className={panelClass}>
      <h3 className="font-semibold text-white">Deposit payment instructions</h3>
      <p className="mt-1 text-xs leading-5 text-slate-400">Set wallet addresses, bank details and any additional instructions. Client overrides take priority over shared company details. Existing requests retain the instructions recorded when they were submitted.</p>
      <div className="my-4 grid gap-4 sm:grid-cols-2"><label className="text-xs text-slate-400">Payment method<AppSelect value={method} disabled={busy !== null} onChange={event => setMethod(event.target.value as DepositMethod)} className={`${fieldClass} mt-1.5`}>{Object.entries(depositMethodLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</AppSelect></label><label className="text-xs text-slate-400">Apply to<AppSelect value={scope} disabled={busy !== null} onChange={event => setScope(event.target.value as 'client' | 'shared')} className={`${fieldClass} mt-1.5`}><option value="client">This client only</option><option value="shared">All clients in this company</option></AppSelect></label></div>
      {loadingSettings ? <p className="text-sm text-slate-400">Loading payment settings…</p> : settingsError ? <p role="alert" className="text-sm text-red-300">{settingsError}</p> : <>
        <p className="mb-4 text-xs text-slate-400">{scope === 'shared' ? 'Shared details apply to clients without an override for this method.' : hasOverride ? 'This client has custom instructions for this method.' : 'This client uses shared details. Saving creates a client override.'}</p>
        <div className="grid gap-4 sm:grid-cols-2">{instructionFields[method].map(field => <label key={field.key} className="text-xs text-slate-400">{field.label}<input value={draft[field.key] || ''} maxLength={4000} onChange={event => setDraft(current => ({ ...current, [field.key]: event.target.value }))} className={`${fieldClass} mt-1.5`} /></label>)}</div>
        <label className="mt-4 block text-xs text-slate-400">Additional instructions<textarea rows={4} maxLength={4000} value={draft.instructions || ''} onChange={event => setDraft(current => ({ ...current, instructions: event.target.value }))} placeholder="Add transfer instructions, references, or other information for the client." className={`${fieldClass} mt-1.5`} /></label>
        <div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => void saveInstructions()} disabled={busy !== null || !auditReason.trim()} className="flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-40">{busy === 'instructions' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}Save {scope === 'client' ? 'client' : 'shared'} instructions</button>{scope === 'client' && hasOverride && <button type="button" onClick={() => void saveInstructions(true)} disabled={busy !== null || !auditReason.trim()} className="rounded-xl border border-slate-600 px-4 py-2 text-sm text-slate-300 disabled:opacity-40">Use shared instructions</button>}</div>
      </>}
    </section>
    {message && <p role="status" className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-300">{message}</p>}
    {error && <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-300">{error}</p>}

    {review && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-labelledby="funding-review-title" className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"><h3 id="funding-review-title" className="text-lg font-semibold capitalize text-white">{review.decision} {review.row.type === 'withdrawal' ? 'withdrawal' : 'deposit'}</h3><p className="mt-3 text-sm text-slate-300">{formatFundingAmount(Math.abs(review.row.amount), review.row.currency || 'EUR')} · Reference {review.row.id}</p><p className="mt-3 text-sm text-slate-400">{review.row.type === 'withdrawal' ? review.decision === 'approve' ? 'Confirm that the payout has been arranged. Approval marks this withdrawal as completed; the payout is handled manually.' : 'The reserved amount will be returned to this client’s available balance.' : review.decision === 'approve' ? 'Confirm that payment has been received. Approval credits this client’s wallet.' : 'The request will be rejected and no funds will be credited.'}</p><label className="mt-5 block text-xs text-slate-400">Review note (required)<textarea autoFocus rows={3} value={reviewNote} onChange={event => setReviewNote(event.target.value)} className={`${fieldClass} mt-1.5`} /></label>{error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}<div className="mt-5 flex gap-3"><button type="button" onClick={() => setReview(null)} disabled={busy !== null} className="flex-1 rounded-xl border border-slate-600 py-2.5 text-sm text-white">Cancel</button><button type="button" onClick={() => void submitReview()} disabled={busy !== null || !reviewNote.trim()} className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-40 ${review.decision === 'approve' ? 'bg-emerald-600' : 'bg-red-600'}`}>{busy && <Loader2 size={16} className="animate-spin" />}Confirm {review.decision === 'approve' ? 'approval' : 'rejection'}</button></div></section></div>}
  </div>;
}
