import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Clipboard, Upload, FileSpreadsheet, KeyRound, Link2, Loader2, Plus, RefreshCw, Send, ShieldCheck, Users, X } from 'lucide-react';
import AppSelect from './AppSelect';
import { supabase } from '../lib/supabaseClient';
import { parseCsv, rowsToLeads, type LeadInput } from '../lib/leadImport';

type LeadStatus = 'new' | 'inviting' | 'registered' | 'existing';
type SourceKind = 'affiliate_api' | 'google_sheet';
interface Lead {
  id: string; email: string; first_name: string; last_name: string; phone: string;
  country: string; campaign: string; notes: string; source_kind: string;
  source_name: string; status: LeadStatus; registered_user_id: string | null;
  registration_error: string | null; last_registration_attempt_at: string | null;
  created_at: string; invited_at: string | null;
  office_id: string | null; source_metadata: { incoming_office?: string | null };
}
interface Source {
  id: string; name: string; kind: SourceKind; sheet_url: string | null;
  active: boolean; last_synced_at: string | null; last_sync_error: string | null;
  created_at: string;
}
interface Owner { user_id: string; role: 'agent'; users: { email: string; first_name: string | null; last_name: string | null; office_id: string | null } }
interface Office { id: string; name: string; code: string; status: 'active' | 'inactive' }
interface Dashboard { leads: Lead[]; total: number; sources: Source[]; owners: Owner[]; offices: Office[] }
interface ImportResult { added: number; duplicates: number; invalid: number }

const panel = 'rounded-xl border border-white/10 bg-[#151b26]';
const input = 'w-full rounded-lg border border-white/15 bg-[#0e1420] px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400';
const button = 'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50';
const emptyDashboard: Dashboard = { leads: [], total: 0, sources: [], owners: [], offices: [] };

async function invokeLeadAction(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('admin-leads', { body });
  if (error) {
    const response = (error as { context?: Response }).context;
    const payload = response instanceof Response ? await response.clone().json().catch(() => null) as { error?: string } | null : null;
    throw new Error(payload?.error || error.message);
  }
  const result = data as Record<string, unknown> | null;
  if (result?.error) throw new Error(String(result.error));
  return result || {};
}

const nameOf = (lead: Lead) => `${lead.first_name} ${lead.last_name}`.trim() || 'Unnamed lead';
const ownerName = (owner: Owner) => {
  const user = Array.isArray(owner.users) ? owner.users[0] : owner.users;
  return `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.email || owner.user_id;
};

export default function AdminLeadsPage({ staffMode = false }: { staffMode?: boolean }) {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<Dashboard>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState('all');
  const [officeFilter, setOfficeFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [affiliateName, setAffiliateName] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [secret, setSecret] = useState<{ name: string; key: string } | null>(null);
  const [confirmRotate, setConfirmRotate] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [owner, setOwner] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invokeLeadAction({ action: 'dashboard', page, status, search, office_id: officeFilter });
      setDashboard(data as unknown as Dashboard);
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load leads'); }
    finally { setLoading(false); }
  }, [page, status, search, officeFilter]);
  useEffect(() => { void refresh(); }, [refresh]);

  const run = async (key: string, action: () => Promise<string>) => {
    setBusy(key); setError(null); setNotice(null);
    try { const result = await action(); setNotice(result); await refresh(); }
    catch (cause) { await refresh(); setError(cause instanceof Error ? cause.message : 'The action failed'); }
    finally { setBusy(null); }
  };

  const createAffiliate = (event: FormEvent) => {
    event.preventDefault();
    void run('affiliate', async () => {
      const data = await invokeLeadAction({ action: 'create_affiliate', name: affiliateName });
      setSecret({ name: affiliateName, key: String(data.api_key) });
      setAffiliateName('');
      return 'Affiliate connection created. Copy its key now; it is shown only once.';
    });
  };

  const createSheet = (event: FormEvent) => {
    event.preventDefault();
    void run('sheet', async () => {
      const data = await invokeLeadAction({ action: 'create_sheet', name: sheetName, url: sheetUrl });
      const source = data.source as Source;
      setSheetName(''); setSheetUrl('');
      const synced = await invokeLeadAction({ action: 'sync_sheet', source_id: source.id });
      const result = synced.result as ImportResult;
      return `Sheet connected. ${result.added} new leads, ${result.duplicates} duplicates, ${result.invalid} invalid rows.`;
    });
  };

  const syncSource = (source: Source) => void run(`sync-${source.id}`, async () => {
    const data = await invokeLeadAction({ action: 'sync_sheet', source_id: source.id });
    const result = data.result as ImportResult;
    return `${source.name}: ${result.added} new leads, ${result.duplicates} duplicates, ${result.invalid} invalid rows.`;
  });

  const toggleSource = (source: Source) => void run(`source-${source.id}`, async () => {
    await invokeLeadAction({ action: 'set_source_active', source_id: source.id, active: !source.active });
    return `${source.name} ${source.active ? 'paused' : 'activated'}.`;
  });

  const rotateKey = (source: Source) => void run(`rotate-${source.id}`, async () => {
    const data = await invokeLeadAction({ action: 'rotate_key', source_id: source.id });
    setConfirmRotate(null);
    setSecret({ name: source.name, key: String(data.api_key) });
    return 'Key rotated. The previous affiliate key stopped working immediately.';
  });

  const importFile = (file: File) => void run('import', async () => {
    if (file.size > 5_000_000) throw new Error('Choose a file smaller than 5 MB.');
    let rows: unknown[][];
    if (file.name.toLowerCase().endsWith('.csv')) rows = parseCsv(await file.text());
    else if (file.name.toLowerCase().endsWith('.xlsx')) {
      const { readSheet } = await import('read-excel-file/browser');
      rows = await readSheet(file);
    } else throw new Error('Choose a CSV or .xlsx Excel file.');
    const parsed = rowsToLeads(rows);
    if (!parsed.leads.length) throw new Error('The file has no valid leads. Include an Email column.');
    if (parsed.leads.length > 5000) throw new Error('Import up to 5,000 leads per file.');
    const totals: ImportResult = { added: 0, duplicates: 0, invalid: parsed.invalid };
    for (let index = 0; index < parsed.leads.length; index += 200) {
      const data = await invokeLeadAction({ action: 'import_rows', filename: file.name, rows: parsed.leads.slice(index, index + 200) as LeadInput[] });
      const result = data.result as ImportResult;
      totals.added += result.added; totals.duplicates += result.duplicates; totals.invalid += result.invalid;
    }
    return `Import complete: ${totals.added} new leads, ${totals.duplicates} duplicates, ${totals.invalid} invalid rows.`;
  });

  const registerLead = () => {
    if (!selectedLead) return;
    const lead = selectedLead;
    const [ownerRole, ownerId] = owner ? owner.split(':') : [null, null];
    void run(`register-${lead.id}`, async () => {
      const data = await invokeLeadAction({ action: 'register_lead', lead_id: lead.id, owner_role: ownerRole, owner_id: ownerId });
      setSelectedLead(null); setOwner('');
      return data.outcome === 'existing'
        ? `${lead.email} already has an account; the lead has been linked to it.`
        : `${lead.email} is now an active client with a trading account and document folder.`;
    });
  };
  const setLeadOffice = (lead: Lead, officeId: string) => void run(`office-${lead.id}`, async () => {
    await invokeLeadAction({ action: 'set_lead_office', lead_id: lead.id, office_id: officeId || null });
    return 'Lead Office updated.';
  });

  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/affiliate-leads`;
  const newCount = dashboard.leads.filter(lead => lead.status === 'new').length;

  return <main className="min-h-screen bg-[#0d1118] px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1800px]">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate(staffMode ? '/crm' : '/admin')} aria-label="Back to CRM" className={`${button} border border-white/10 text-slate-300 hover:text-white`}><ArrowLeft size={18} /></button>
          <div className="rounded-lg bg-violet-500/15 p-2.5 text-violet-300"><Users size={21} /></div>
          <div><h1 className="text-2xl font-bold">Lead inbox</h1><p className="text-sm text-slate-400">{staffMode ? 'All Sales Offices. Use the Office selector as a filter.' : 'Collect affiliate leads and invite them to become clients.'}</p></div>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading || !!busy} className={`${button} border border-white/10 text-slate-300 hover:text-white`}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</button>
      </header>

      {error && <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
      {notice && <div role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"><Check size={16} />{notice}</div>}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className={`${panel} px-5 py-4`}><div className="text-xs text-slate-400">Matching leads</div><div className="mt-1 text-2xl font-bold">{dashboard.total.toLocaleString()}</div></div>
        <div className={`${panel} px-5 py-4`}><div className="text-xs text-slate-400">New on this page</div><div className="mt-1 text-2xl font-bold text-violet-300">{newCount}</div></div>
        <div className={`${panel} px-5 py-4`}><div className="text-xs text-slate-400">Active connections</div><div className="mt-1 text-2xl font-bold">{dashboard.sources.filter(source => source.active).length}</div></div>
      </div>

      <div className={`grid items-start gap-5 ${staffMode ? '' : 'xl:grid-cols-[minmax(0,1fr)_390px]'}`}>
        <section className={`${panel} min-w-0 overflow-hidden`}>
          <div className="flex flex-wrap items-center gap-3 border-b border-white/10 p-4">
            <div className="mr-auto"><h2 className="font-semibold">Leads</h2><p className="text-xs text-slate-400">Register a lead to create and initialize the complete client account.</p></div>
            <form onSubmit={event => { event.preventDefault(); setPage(0); setSearch(searchInput.trim()); }} className="flex gap-2"><input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Search email" className={`${input} w-40 sm:w-48`} /><button type="submit" className={`${button} border border-white/10 text-slate-200 hover:text-white`}>Search</button></form>
            <AppSelect value={officeFilter} onChange={event => { setPage(0); setOfficeFilter(event.target.value); }} className={`${input} w-44`} aria-label="Filter by Office"><option value="all">All Offices</option><option value="unassigned">No Office</option>{dashboard.offices.map(office => <option key={office.id} value={office.id}>{office.code} · {office.name}</option>)}</AppSelect>
            <AppSelect value={status} onChange={event => { setPage(0); setStatus(event.target.value); }} className={`${input} w-36`} aria-label="Filter lead status"><option value="all">All statuses</option><option value="new">New</option><option value="inviting">Processing</option><option value="registered">Registered</option><option value="existing">Existing</option></AppSelect>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[940px] text-left text-sm"><thead className="border-b border-white/10 bg-[#111723] text-xs text-slate-400"><tr><th className="px-4 py-3">Lead</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Office</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Received</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-white/[0.07]">
            {dashboard.leads.map(lead => <tr key={lead.id} className="hover:bg-white/[0.025]">
              <td className="px-4 py-3"><div className="font-semibold text-white">{nameOf(lead)}</div><div className="text-xs text-slate-400">{lead.email}</div>{lead.campaign && <div className="mt-1 text-[11px] text-violet-300">{lead.campaign}</div>}</td>
              <td className="px-4 py-3 text-xs text-slate-300">{lead.phone || '—'}{lead.country && <div className="text-slate-500">{lead.country}</div>}</td>
              <td className="px-4 py-3"><AppSelect value={lead.office_id || ''} onChange={event => setLeadOffice(lead, event.target.value)} disabled={!!busy || lead.status !== 'new'} className={`${input} min-w-36 py-2 text-xs`}><option value="" disabled={staffMode}>No office</option>{dashboard.offices.filter(office => office.status === 'active').map(office => <option key={office.id} value={office.id}>{office.code} · {office.name}</option>)}</AppSelect>{lead.source_metadata?.incoming_office && <div className="mt-1 text-[10px] text-slate-500">Incoming: {lead.source_metadata.incoming_office}</div>}</td>
              <td className="px-4 py-3 text-xs text-slate-300"><div>{lead.source_name || 'Import'}</div><div className="text-slate-500">{lead.source_kind.replaceAll('_', ' ')}</div></td>
              <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">{new Date(lead.created_at).toLocaleDateString()}</td>
              <td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-xs ${lead.status === 'new' ? 'bg-violet-500/15 text-violet-200' : lead.status === 'registered' ? 'bg-emerald-500/15 text-emerald-200' : 'bg-white/5 text-slate-300'}`}>{lead.status === 'inviting' ? 'Processing' : lead.status === 'existing' ? 'Existing client' : lead.status}</span>{lead.registration_error && <div className="mt-2 max-w-64 text-[11px] leading-4 text-red-300">Last attempt: {lead.registration_error}</div>}</td>
              <td className="px-4 py-3 text-right">{lead.status === 'new' ? <button type="button" onClick={() => { setSelectedLead(lead); setOwner(''); }} disabled={!!busy} className={`${button} bg-violet-600 text-white hover:bg-violet-500`}><Send size={14} />Register</button> : lead.status === 'inviting' ? <span className="text-xs text-slate-400">Account creation in progress</span> : <span className="text-xs text-slate-500">Linked</span>}</td>
            </tr>)}
            </tbody></table>{!loading && dashboard.leads.length === 0 && <div className="p-10 text-center text-sm text-slate-400">No leads match this view yet.</div>}{loading && <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-400"><Loader2 size={17} className="animate-spin" />Loading leads</div>}</div>
          <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs text-slate-400"><span>{dashboard.total ? `${page * 50 + 1}–${Math.min((page + 1) * 50, dashboard.total)} of ${dashboard.total}` : '0 leads'}</span><div className="flex gap-2"><button type="button" onClick={() => setPage(value => value - 1)} disabled={page === 0 || loading} className={`${button} border border-white/10 disabled:opacity-40`}>Previous</button><button type="button" onClick={() => setPage(value => value + 1)} disabled={(page + 1) * 50 >= dashboard.total || loading} className={`${button} border border-white/10 disabled:opacity-40`}>Next</button></div></div>
        </section>

        {!staffMode && <aside className="space-y-4">
          <section className={`${panel} p-5`}><div className="mb-4 flex items-center gap-2"><KeyRound size={18} className="text-violet-300" /><h2 className="font-semibold">Affiliate API</h2></div><p className="mb-4 text-xs leading-5 text-slate-400">Create a key for each affiliate. They can send leads to your endpoint without CRM access.</p><form onSubmit={createAffiliate} className="flex gap-2"><input required maxLength={100} value={affiliateName} onChange={event => setAffiliateName(event.target.value)} placeholder="Affiliate name" className={input} /><button type="submit" disabled={!!busy} className={`${button} bg-violet-600 text-white hover:bg-violet-500`}><Plus size={16} /></button></form><div className="mt-3 break-all rounded-lg bg-[#0e1420] p-3 font-mono text-[11px] text-slate-400">{apiUrl}</div></section>
          <section className={`${panel} p-5`}><div className="mb-4 flex items-center gap-2"><Link2 size={18} className="text-violet-300" /><h2 className="font-semibold">Google Sheet</h2></div><p className="mb-4 text-xs leading-5 text-slate-400">Connect a Google Sheet that can be exported as CSV. The server checks active sheets every 10 minutes.</p><form onSubmit={createSheet} className="space-y-2.5"><input required maxLength={100} value={sheetName} onChange={event => setSheetName(event.target.value)} placeholder="Sheet name" className={input} /><input required type="url" value={sheetUrl} onChange={event => setSheetUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." className={input} /><button type="submit" disabled={!!busy} className={`${button} w-full bg-violet-600 text-white hover:bg-violet-500`}><Plus size={16} />Connect and sync</button></form></section>
          <section className={`${panel} p-5`}><div className="mb-4 flex items-center gap-2"><FileSpreadsheet size={18} className="text-violet-300" /><h2 className="font-semibold">Import a file</h2></div><p className="mb-4 text-xs leading-5 text-slate-400">Upload CSV or Excel .xlsx with an Email column. Office or Team is optional; unknown values remain safely unclassified.</p><label className={`${button} w-full cursor-pointer border border-white/15 text-slate-200 hover:border-violet-400/40`}><Upload size={16} />{busy === 'import' ? 'Importing...' : 'Choose CSV or Excel file'}<input type="file" accept=".csv,.xlsx" className="sr-only" disabled={!!busy} onChange={event => { const file = event.target.files?.[0]; if (file) importFile(file); event.target.value = ''; }} /></label></section>
          <section className={`${panel} overflow-hidden`}><div className="border-b border-white/10 px-5 py-4"><h2 className="font-semibold">Connections</h2><p className="mt-1 text-xs text-slate-400">Pause, sync, or rotate a source.</p></div>{dashboard.sources.length === 0 ? <div className="px-5 py-6 text-xs text-slate-400">No connections yet.</div> : <div className="divide-y divide-white/[0.07]">{dashboard.sources.map(source => <div key={source.id} className="p-4"><div className="flex items-start justify-between gap-2"><div><div className="text-sm font-semibold">{source.name}</div><div className="mt-0.5 text-xs text-slate-500">{source.kind === 'google_sheet' ? 'Google Sheet' : 'Affiliate API'} · {source.active ? 'Active' : 'Paused'}</div></div><span className={`mt-1 h-2 w-2 rounded-full ${source.active ? 'bg-emerald-400' : 'bg-slate-600'}`} /></div>{source.last_synced_at && <div className="mt-2 text-[11px] text-slate-500">Last sync {new Date(source.last_synced_at).toLocaleString()}</div>}{source.last_sync_error && <div className="mt-2 text-xs text-amber-300">{source.last_sync_error}</div>}<div className="mt-3 flex flex-wrap gap-2">{source.kind === 'google_sheet' && <button type="button" onClick={() => syncSource(source)} disabled={!!busy || !source.active} className={`${button} border border-white/10 text-xs text-slate-300 hover:text-white`}><RefreshCw size={13} />Sync now</button>}{source.kind === 'affiliate_api' && (confirmRotate === source.id ? <><button type="button" onClick={() => setConfirmRotate(null)} className={`${button} text-xs text-slate-400`}>Cancel</button><button type="button" onClick={() => rotateKey(source)} disabled={!!busy} className={`${button} bg-amber-500/15 text-xs text-amber-200`}>Confirm rotation</button></> : <button type="button" onClick={() => setConfirmRotate(source.id)} disabled={!!busy} className={`${button} border border-white/10 text-xs text-slate-300 hover:text-white`}><KeyRound size={13} />Rotate key</button>)}<button type="button" onClick={() => toggleSource(source)} disabled={!!busy} className={`${button} border border-white/10 text-xs text-slate-300 hover:text-white`}>{source.active ? 'Pause' : 'Activate'}</button></div></div>)}</div>}</section>
        </aside>}
      </div>

      {secret && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"><section role="dialog" aria-modal="true" aria-labelledby="affiliate-key-title" className="w-full max-w-xl rounded-2xl border border-white/15 bg-[#171e2b] p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 id="affiliate-key-title" className="text-lg font-semibold">{secret.name} API key</h2><p className="mt-1 text-sm text-amber-200">Copy this key now. It cannot be viewed again.</p></div><button type="button" onClick={() => setSecret(null)} aria-label="Close" className="text-slate-400 hover:text-white"><X size={20} /></button></div><div className="mt-5 break-all rounded-lg border border-white/10 bg-[#0d1118] p-4 font-mono text-xs text-white">{secret.key}</div><button type="button" onClick={() => void navigator.clipboard.writeText(secret.key).then(() => setNotice('Affiliate key copied.')).catch(() => setError('Copy failed. Select the key manually.'))} className={`${button} mt-4 w-full bg-violet-600 text-white hover:bg-violet-500`}><Clipboard size={16} />Copy key</button><div className="mt-4 rounded-lg bg-white/5 p-3 text-xs leading-5 text-slate-300">Send a POST request to <span className="break-all font-mono">{apiUrl}</span> with header <span className="font-mono">x-affiliate-key: YOUR_KEY</span> and JSON body <span className="font-mono">{'{"email":"lead@example.com","first_name":"Jane","last_name":"Doe"}'}</span>.</div></section></div>}

      {selectedLead && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"><section role="dialog" aria-modal="true" aria-labelledby="register-lead-title" className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#171e2b] p-6 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h2 id="register-lead-title" className="text-lg font-semibold">Create client account</h2><p className="mt-1 text-sm text-slate-400">{nameOf(selectedLead)} · {selectedLead.email}</p></div><button type="button" onClick={() => setSelectedLead(null)} disabled={!!busy} aria-label="Close" className="text-slate-400 hover:text-white"><X size={20} /></button></div><div className="mt-5 rounded-lg border border-violet-400/20 bg-violet-500/10 p-4 text-sm text-slate-200"><ShieldCheck size={18} className="mb-2 text-violet-300" />Creates an unpromoted Sales client in {dashboard.offices.find(item => item.id === selectedLead.office_id)?.code || 'No office'}. Retention assignment becomes available only after promotion.</div>{error && <div role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}<label className="mt-5 block text-xs font-medium text-slate-300">Assign same-Office sales agent <span className="font-normal text-slate-500">(optional)</span><AppSelect value={owner} onChange={event => setOwner(event.target.value)} className={`mt-1.5 ${input}`}><option value="">Unassigned</option>{dashboard.owners.filter(item => { const user = Array.isArray(item.users) ? item.users[0] : item.users; return (user?.office_id || '') === (selectedLead.office_id || ''); }).map(item => <option key={item.user_id} value={`agent:${item.user_id}`}>{ownerName(item)}</option>)}</AppSelect></label><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setSelectedLead(null)} disabled={!!busy} className={`${button} border border-white/10 text-slate-300`}>Cancel</button><button type="button" onClick={registerLead} disabled={!!busy} className={`${button} bg-violet-600 text-white hover:bg-violet-500`}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}Create client</button></div></section></div>}
    </div>
  </main>;
}
