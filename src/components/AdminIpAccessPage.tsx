import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Globe2, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface AllowedIp {
  ip_address: string;
  label: string;
  created_at: string;
  created_by: string | null;
  is_current: boolean;
}

export default function AdminIpAccessPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<AllowedIp[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ip, setIp] = useState('');
  const [label, setLabel] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: requestError } = await supabase.rpc('crm_admin_list_ips');
    if (requestError) setError(requestError.message);
    else {
      setEntries((data as AllowedIp[] | null) || []);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const addIp = async (event: FormEvent) => {
    event.preventDefault();
    if (!ip.trim() || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const value = ip.trim();
    const { error: requestError } = await supabase.rpc('crm_admin_add_ip', { p_ip: value, p_label: label.trim() });
    if (requestError) setError(requestError.code === '23505' ? 'This IP address is already approved.' : requestError.message);
    else {
      setIp('');
      setLabel('');
      await refresh();
      setNotice(`${value} can now access the administrator CRM after signing in.`);
    }
    setBusy(false);
  };

  const removeIp = async (value: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: requestError } = await supabase.rpc('crm_admin_remove_ip', { p_ip: value });
    if (requestError) setError(requestError.message);
    else {
      setConfirmRemove(null);
      await refresh();
      setNotice(`${value} no longer has administrator CRM network access.`);
    }
    setBusy(false);
  };

  const currentIp = entries.find(entry => entry.is_current)?.ip_address;

  return <main className="min-h-screen bg-[#0d1118] px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1440px]">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('/admin')} aria-label="Back to CRM" className="rounded-lg border border-white/10 p-2.5 text-slate-300 hover:border-violet-400/40 hover:text-white"><ArrowLeft size={19} /></button>
          <div className="rounded-lg bg-violet-500/15 p-2.5 text-violet-300"><ShieldCheck size={21} /></div>
          <div><h1 className="text-2xl font-bold">Administrator IP access</h1><p className="text-sm text-slate-400">Control which networks can reach the CRM and its administrator data.</p></div>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading || busy} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:text-white disabled:opacity-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</button>
      </header>

      {error && <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
      {notice && <div role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"><CheckCircle2 size={16} />{notice}</div>}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="overflow-hidden rounded-xl border border-white/10 bg-[#151b26]">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div><h2 className="font-semibold">Approved IP addresses</h2><p className="mt-1 text-xs text-slate-400">Changes apply to page requests and administrator operations.</p></div>
            <span className="rounded-md bg-white/5 px-2.5 py-1 text-xs text-slate-300">{entries.length} active</span>
          </div>
          {loading ? <div className="px-5 py-10 text-sm text-slate-400">Loading approved networks...</div> : entries.length === 0 ? <div className="px-5 py-10 text-sm text-slate-400">No approved addresses found.</div> :
            <div className="divide-y divide-white/[0.07]">
              {entries.map(entry => <div key={entry.ip_address} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-semibold text-white">{entry.ip_address}</span>{entry.is_current && <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">Current network</span>}</div>
                  <div className="mt-1 text-xs text-slate-400">{entry.label || 'No label'} · Added {new Date(entry.created_at).toLocaleDateString()}</div>
                </div>
                {entry.is_current ? <span className="text-xs text-slate-500">Protected while in use</span> : confirmRemove === entry.ip_address ?
                  <div className="flex items-center gap-2"><button type="button" onClick={() => setConfirmRemove(null)} disabled={busy} className="rounded-lg px-3 py-2 text-xs text-slate-300 hover:text-white">Cancel</button><button type="button" onClick={() => void removeIp(entry.ip_address)} disabled={busy} className="rounded-lg bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/25 disabled:opacity-50">Confirm removal</button></div> :
                  <button type="button" onClick={() => setConfirmRemove(entry.ip_address)} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:border-red-400/40 hover:text-red-200 disabled:opacity-50"><Trash2 size={14} />Remove</button>}
              </div>)}
            </div>}
        </section>

        <section className="rounded-xl border border-white/10 bg-[#151b26] p-5">
          <div className="mb-5 flex items-center gap-2"><Globe2 size={19} className="text-violet-300" /><h2 className="font-semibold">Add an approved network</h2></div>
          <form onSubmit={addIp} className="space-y-4">
            <label className="block text-xs font-medium text-slate-300">IP address<input type="text" value={ip} onChange={event => setIp(event.target.value)} required maxLength={45} autoComplete="off" spellCheck={false} placeholder="203.0.113.10" className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0e1420] px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-violet-400" /></label>
            <label className="block text-xs font-medium text-slate-300">Label <span className="font-normal text-slate-500">(optional)</span><input type="text" value={label} onChange={event => setLabel(event.target.value)} maxLength={80} placeholder="Office, VPN, or location" className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0e1420] px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400" /></label>
            <button type="submit" disabled={busy || !ip.trim()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"><Plus size={17} />Approve IP address</button>
          </form>
          <p className="mt-4 border-t border-white/10 pt-4 text-xs leading-5 text-slate-400">Enter one IPv4 or IPv6 address. Network ranges are not accepted. The person connecting from that address must still sign in with an administrator account.</p>
          {currentIp && <p className="mt-3 text-xs text-slate-500">Your current network: <span className="font-mono text-slate-300">{currentIp}</span></p>}
        </section>
      </div>
    </div>
  </main>;
}
