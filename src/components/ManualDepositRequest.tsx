import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface ManualDepositRequestProps {
  onSubmitted?: () => void;
}

interface PendingRequest {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
}

export default function ManualDepositRequest({ onSubmitted }: ManualDepositRequestProps) {
  const [amount, setAmount] = useState('');
  const [request, setRequest] = useState<PendingRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = request?.id;

  useEffect(() => {
    if (!requestId) return;

    const channel = supabase
      .channel(`manual-deposit-${requestId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'transactions',
          filter: `id=eq.${requestId}`,
        },
        (payload) => {
          const updated = payload.new as { status?: string };
          const nextStatus = updated.status;
          if (nextStatus) {
            setRequest((current) => current ? { ...current, status: nextStatus } : current);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [requestId]);

  const submitRequest = async () => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 10) {
      setError('The minimum deposit is $10');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('create-manual-deposit', {
        body: { amount: numericAmount },
      });
      if (invokeError) {
        const context = (invokeError as { context?: Response }).context;
        const responseBody = context ? await context.json().catch(() => null) : null;
        throw new Error(responseBody?.error || invokeError.message);
      }
      if (!data?.success) throw new Error(data?.error || 'Unable to submit deposit request');

      setRequest({
        id: String(data.transaction_id),
        amount: Number(data.amount),
        status: String(data.status),
        createdAt: String(data.created_at),
      });
      onSubmitted?.();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit deposit request');
    } finally {
      setLoading(false);
    }
  };

  const status = request?.status.toLowerCase();

  return (
    <div className="space-y-5">
      {!request ? (
        <>
          <div>
            <label className="block text-sm text-slate-400 mb-2">Requested deposit amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
              <input
                type="number"
                min="10"
                max="1000000"
                step="1"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="Enter amount"
                className="w-full app-input pl-8 pr-20 py-3 rounded-xl"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">USDT</span>
            </div>
          </div>

          <button
            onClick={submitRequest}
            disabled={loading || !amount}
            className="w-full app-action-primary disabled:opacity-60 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2"
          >
            {loading ? <RefreshCw size={18} className="animate-spin" /> : <Clock size={18} />}
            {loading ? 'Submitting...' : 'Submit Deposit Request'}
          </button>
        </>
      ) : (
        <div className={`border rounded-xl p-5 ${
          status === 'completed'
            ? 'bg-emerald-500/10 border-emerald-500/30'
            : status === 'failed'
              ? 'bg-red-500/10 border-red-500/30'
              : 'bg-amber-500/10 border-amber-500/30'
        }`}>
          <div className="flex items-center gap-3 mb-3">
            {status === 'completed' ? (
              <CheckCircle className="text-emerald-400" size={22} />
            ) : status === 'failed' ? (
              <AlertTriangle className="text-red-400" size={22} />
            ) : (
              <Clock className="text-amber-400" size={22} />
            )}
            <div>
              <p className="text-white font-semibold">{request.amount.toLocaleString()} USDT</p>
              <p className="text-sm text-slate-400 capitalize">Status: {request.status}</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 break-all">Reference: {request.id}</p>
          <button
            onClick={() => {
              setRequest(null);
              setAmount('');
              setError(null);
            }}
            className="w-full mt-4 app-action-soft text-white py-2 rounded-xl"
          >
            Submit another request
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3 text-red-400">
          <AlertTriangle size={20} className="flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <p className="text-xs text-slate-500 text-center">
        This is a manual request. No real payment is processed and no balance is credited until CRM review.
      </p>
    </div>
  );
}
