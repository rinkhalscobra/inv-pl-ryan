import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, BookOpen, Check, Clipboard, Copy, Download, Upload, FileSpreadsheet, KeyRound, Link2, Loader2, Pencil, PhoneCall, Plus, RefreshCw, Send, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import AppSelect from './AppSelect';
import { supabase } from '../lib/supabaseClient';
import { parseCsv, rowsToLeads, type LeadInput } from '../lib/leadImport';
import { getSelectedCrmCompanyId, setSelectedCrmCompanyId, type CrmCompany } from '../lib/crmCompany';

type LeadStatus = 'new' | 'inviting' | 'registered' | 'existing';
type SourceKind = 'affiliate_api' | 'google_sheet';
interface Lead {
  id: string; email: string; first_name: string; last_name: string; phone: string;
  country: string; campaign: string; notes: string; source_kind: string;
  source_name: string; status: LeadStatus; registered_user_id: string | null;
  registration_error: string | null; last_registration_attempt_at: string | null;
  created_at: string; invited_at: string | null;
  office_id: string | null; source_metadata: { incoming_office?: string | null };
  phone_e164: string | null; phone_country_code: string | null; phone_calling_code: string | null;
  phone_validation_status: 'pending' | 'valid' | 'invalid' | 'unsupported' | 'missing';
  phone_validation_reason: string; phone_routing_status: 'pending' | 'routed' | 'no_office' | 'no_desk_manager' | 'invalid' | 'manual';
  phone_routed_at: string | null;
}
interface Source {
  id: string; name: string; kind: SourceKind; sheet_url: string | null;
  active: boolean; last_synced_at: string | null; last_sync_error: string | null;
  created_at: string;
}
interface Owner { user_id: string; role: 'agent'; users: { email: string; first_name: string | null; last_name: string | null; office_id: string | null } }
interface DeskManager { user_id: string; role: 'desk_manager'; users: { email: string; first_name: string | null; last_name: string | null; office_id: string | null } }
interface Office { id: string; name: string; code: string; status: 'active' | 'inactive' }
interface Dashboard { leads: Lead[]; total: number; sources: Source[]; owners: Owner[]; offices: Office[]; desk_managers: DeskManager[]; incorrect_phone_count: number; routing_review_count: number; actor_role: 'admin' | 'workflow_manager' | 'desk_manager' }
interface ImportResult { added: number; duplicates: number; invalid: number }

const panel = 'rounded-xl border border-white/10 bg-[#151b26]';
const input = 'w-full rounded-lg border border-white/15 bg-[#0e1420] px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400';
const button = 'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50';
const emptyDashboard: Dashboard = { leads: [], total: 0, sources: [], owners: [], offices: [], desk_managers: [], incorrect_phone_count: 0, routing_review_count: 0, actor_role: 'admin' };

const affiliateDocumentation = (apiUrl: string, apiKey = 'YOUR_AFFILIATE_KEY') => `AFFILIATE LEAD API - INTEGRATION GUIDE

Purpose
This is a server-to-server API for sending prospective client details into the company's CRM Lead inbox. It does not give the affiliate CRM access and it does not create a client account, deposit, or trade. CRM staff review the lead and register it separately.

Endpoint
POST ${apiUrl}

Required headers
Content-Type: application/json
x-affiliate-key: ${apiKey}

Single-lead request
{
  "email": "jane@example.com",
  "first_name": "Jane",
  "last_name": "Doe",
  "phone": "+49 30 901820",
  "country": "US",
  "campaign": "Spring campaign",
  "notes": "Requested a callback",
  "external_id": "partner-123"
}

Batch request (1 to 100 leads)
{
  "leads": [
    {
      "email": "jane@example.com",
      "first_name": "Jane",
      "last_name": "Doe"
    }
  ]
}

cURL example
curl --request POST '${apiUrl}' \\
  --header 'Content-Type: application/json' \\
  --header 'x-affiliate-key: ${apiKey}' \\
  --data '{"email":"jane@example.com","first_name":"Jane","last_name":"Doe","phone":"+49 30 901820","country":"DE","campaign":"Spring campaign","external_id":"partner-123"}'

JavaScript / Node.js example
const response = await fetch('${apiUrl}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-affiliate-key': process.env.AFFILIATE_API_KEY
  },
  body: JSON.stringify({
    email: 'jane@example.com',
    first_name: 'Jane',
    last_name: 'Doe',
    phone: '+49 30 901820',
    country: 'DE',
    campaign: 'Spring campaign',
    external_id: 'partner-123'
  })
});
const result = await response.json();
if (!response.ok) throw new Error(result.error || 'Lead submission failed');

Success response
HTTP 200
{"accepted":1,"duplicates":0,"invalid":0}

Response counters
- accepted: new leads saved to the CRM
- duplicates: valid leads already present for this company, or repeated emails in the request
- invalid: records missing a valid email address

Field rules
- email: required, valid email, maximum 254 characters; normalized to lowercase
- first_name: optional, maximum 100 characters
- last_name: optional, maximum 100 characters
- full_name: optional alternative to first_name and last_name, maximum 200 characters
- phone: optional, maximum 60 characters; use international + or 00 format
- country: optional, maximum 100 characters
- office: optional source metadata, maximum 100 characters; it does not override phone routing
- campaign: optional, maximum 120 characters
- notes: optional, maximum 2,000 characters
- external_id: optional affiliate reference, maximum 120 characters

Phone validation and Office assignment
The server validates the complete international number against real country numbering plans. A valid number is normalized to E.164 and its detected country code routes the lead to the active Office with the same two-letter code (for example +49 -> DE, +33 -> FR, +34 -> ES, +39 -> IT). Invalid, missing, or unknown numbers appear in the Incorrect numbers review queue. A valid country without a matching Office, or an Office without a Desk Manager, appears in Routing review. The submitted country and office fields cannot override the detected phone country.

Errors
- 400: malformed JSON, empty batch, or more than 100 leads
- 401: missing, invalid, paused, rotated, or unknown affiliate key
- 405: method other than POST
- 413: request body larger than 500,000 characters
- 500: temporary server error; retry later

Security and delivery rules
- Call this endpoint from the affiliate's backend/server, not browser JavaScript.
- Never expose the key in a website, mobile app, URL, query string, log, or public repository.
- The key is shown only once. Store it as a secret environment variable.
- Email is the duplicate key inside the destination company. external_id is a reference field, not the duplicate key.
- A paused connection or rotated key stops accepting leads immediately.
- For a 500 response, retry safely. A retry may return the lead as a duplicate if the original request was saved.
`;

async function invokeLeadActionRequest(body: Record<string, unknown>): Promise<Record<string, unknown>> {
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
const deskManagerName = (manager: DeskManager) => {
  const user = Array.isArray(manager.users) ? manager.users[0] : manager.users;
  return `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.email || manager.user_id;
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
  const [phoneFilter, setPhoneFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [affiliateName, setAffiliateName] = useState('');
  const [showAffiliateDocs, setShowAffiliateDocs] = useState(false);
  const [sheetName, setSheetName] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [secret, setSecret] = useState<{ name: string; key: string } | null>(null);
  const [confirmRotate, setConfirmRotate] = useState<string | null>(null);
  const [editingAffiliateId, setEditingAffiliateId] = useState<string | null>(null);
  const [editingAffiliateName, setEditingAffiliateName] = useState('');
  const [deleteAffiliate, setDeleteAffiliate] = useState<Source | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [owner, setOwner] = useState('');
  const [companies, setCompanies] = useState<CrmCompany[]>([]);
  const [companyId, setCompanyId] = useState(getSelectedCrmCompanyId() || '');
  const [isPlatformNetwork, setIsPlatformNetwork] = useState(false);

  const invokeLeadAction = useCallback((body: Record<string, unknown>) => invokeLeadActionRequest({ ...body, company_id: companyId || null }), [companyId]);

  useEffect(() => {
    if (staffMode) return;
    void Promise.all([supabase.rpc('crm_admin_list_companies'), supabase.rpc('crm_admin_network_context')]).then(([companyResult, contextResult]) => {
      const next = (companyResult.data as CrmCompany[] | null) || [];
      setCompanies(next);
      setIsPlatformNetwork((contextResult.data as { is_platform?: boolean } | null)?.is_platform === true);
      const selected = next.some(company => company.id === companyId) ? companyId : next[0]?.id || '';
      if (selected) { setCompanyId(selected); setSelectedCrmCompanyId(selected); }
    });
  }, [companyId, staffMode]);

  useEffect(() => {
    setEditingAffiliateId(null);
    setEditingAffiliateName('');
    setConfirmRotate(null);
  }, [companyId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invokeLeadAction({ action: 'dashboard', page, status, search, office_id: officeFilter, phone_filter: phoneFilter });
      setDashboard(data as unknown as Dashboard);
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load leads'); }
    finally { setLoading(false); }
  }, [invokeLeadAction, page, status, search, officeFilter, phoneFilter]);
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

  const renameAffiliate = (event: FormEvent, source: Source) => {
    event.preventDefault();
    const name = editingAffiliateName.trim();
    if (!name) { setError('Enter an affiliate name.'); return; }
    void run(`rename-${source.id}`, async () => {
      const data = await invokeLeadAction({ action: 'rename_affiliate_source', source_id: source.id, name });
      const result = data.result as { updated_leads?: number } | undefined;
      setEditingAffiliateId(null);
      setEditingAffiliateName('');
      return `${source.name} was renamed to ${name}. ${result?.updated_leads || 0} linked lead record${result?.updated_leads === 1 ? '' : 's'} updated.`;
    });
  };

  const deleteAffiliateSource = (deleteLeads: boolean) => {
    if (!deleteAffiliate) return;
    const source = deleteAffiliate;
    void run(`delete-${source.id}`, async () => {
      const data = await invokeLeadAction({ action: 'delete_affiliate_source', source_id: source.id, delete_leads: deleteLeads });
      const result = data.result as { deleted_leads?: number; linked_leads?: number } | undefined;
      setDeleteAffiliate(null);
      return deleteLeads
        ? `${source.name} and ${result?.deleted_leads || 0} linked lead record${result?.deleted_leads === 1 ? '' : 's'} were deleted. Existing client accounts were preserved.`
        : `${source.name} was deleted. ${result?.linked_leads || 0} linked lead record${result?.linked_leads === 1 ? '' : 's'} were preserved.`;
    });
  };

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
  const reprocessPhoneRouting = () => void run('phone-routing', async () => {
    const data = await invokeLeadAction({ action: 'reprocess_phone_routing' });
    const result = data.result as { updated?: number } | undefined;
    return `${result?.updated || 0} lead phone number${result?.updated === 1 ? '' : 's'} revalidated and routed.`;
  });

  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/affiliate-leads`;
  const copyToClipboard = async (value: string, message: string) => {
    try { await navigator.clipboard.writeText(value); setError(null); setNotice(message); }
    catch { setError('Copy failed. Select and copy the text manually.'); }
  };
  const downloadAffiliateDocs = () => {
    const file = new Blob([affiliateDocumentation(apiUrl, secret?.key)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    const safeName = secret?.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    link.href = url; link.download = safeName ? `${safeName}-affiliate-api-package.txt` : 'affiliate-api-integration-guide.txt'; link.click();
    URL.revokeObjectURL(url);
  };
  const newCount = dashboard.leads.filter(lead => lead.status === 'new').length;

  return <main className="min-h-screen bg-[#0d1118] px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1800px]">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate(staffMode ? '/crm' : '/admin')} aria-label="Back to CRM" className={`${button} border border-white/10 text-slate-300 hover:text-white`}><ArrowLeft size={18} /></button>
          <div className="rounded-lg bg-violet-500/15 p-2.5 text-violet-300"><Users size={21} /></div>
          <div><h1 className="text-2xl font-bold">Lead inbox</h1><p className="text-sm text-slate-400">{staffMode ? (dashboard.actor_role === 'desk_manager' ? 'Phone-routed leads for your Office.' : 'All Sales Offices. Use the Office selector as a filter.') : 'Validate, route, and register incoming affiliate leads.'}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">{!staffMode && isPlatformNetwork && companies.length > 0 && <AppSelect value={companyId} onChange={event => { setCompanyId(event.target.value); setSelectedCrmCompanyId(event.target.value); setPage(0); }} className="min-w-[220px] rounded-lg border border-violet-400/30 bg-[#0e1420] px-3 py-2 text-sm text-violet-100">{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</AppSelect>}{!staffMode && <button type="button" onClick={reprocessPhoneRouting} disabled={loading || !!busy} className={`${button} border border-violet-400/25 text-violet-200 hover:bg-violet-500/10`}><PhoneCall size={16} />{busy === 'phone-routing' ? 'Checking...' : 'Recheck phone routing'}</button>}<button type="button" onClick={() => void refresh()} disabled={loading || !!busy} className={`${button} border border-white/10 text-slate-300 hover:text-white`}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</button></div>
      </header>

      {error && <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
      {notice && <div role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"><Check size={16} />{notice}</div>}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className={`${panel} px-5 py-4`}><div className="text-xs text-slate-400">Matching leads</div><div className="mt-1 text-2xl font-bold">{dashboard.total.toLocaleString()}</div></div>
        <div className={`${panel} px-5 py-4`}><div className="text-xs text-slate-400">New on this page</div><div className="mt-1 text-2xl font-bold text-violet-300">{newCount}</div></div>
        <button type="button" onClick={() => { setPage(0); setPhoneFilter('incorrect'); }} className={`${panel} px-5 py-4 text-left transition hover:border-red-400/30 ${phoneFilter === 'incorrect' ? 'border-red-400/40 bg-red-500/[0.06]' : ''}`}><div className="text-xs text-slate-400">Incorrect numbers</div><div className="mt-1 text-2xl font-bold text-red-300">{dashboard.incorrect_phone_count.toLocaleString()}</div></button>
        <button type="button" onClick={() => { setPage(0); setPhoneFilter('routing_review'); }} className={`${panel} px-5 py-4 text-left transition hover:border-amber-400/30 ${phoneFilter === 'routing_review' ? 'border-amber-400/40 bg-amber-500/[0.06]' : ''}`}><div className="text-xs text-slate-400">Routing review</div><div className="mt-1 text-2xl font-bold text-amber-300">{dashboard.routing_review_count.toLocaleString()}</div></button>
      </div>

      <div className={`grid items-start gap-5 ${staffMode ? '' : 'xl:grid-cols-[minmax(0,1fr)_390px]'}`}>
        <section className={`${panel} min-w-0 overflow-hidden`}>
          <div className="flex flex-wrap items-center gap-3 border-b border-white/10 p-4">
            <div className="mr-auto"><h2 className="font-semibold">Leads</h2><p className="text-xs text-slate-400">Register a lead to create and initialize the complete client account.</p></div>
            <form onSubmit={event => { event.preventDefault(); setPage(0); setSearch(searchInput.trim()); }} className="flex gap-2"><input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Search email" className={`${input} w-40 sm:w-48`} /><button type="submit" className={`${button} border border-white/10 text-slate-200 hover:text-white`}>Search</button></form>
            <AppSelect value={phoneFilter} onChange={event => { setPage(0); setPhoneFilter(event.target.value); }} className={`${input} w-48`} aria-label="Filter phone quality"><option value="all">All phone numbers</option><option value="valid">Correct numbers</option><option value="incorrect">Incorrect numbers</option><option value="routing_review">Routing review</option></AppSelect>
            {dashboard.actor_role !== 'desk_manager' && <AppSelect value={officeFilter} onChange={event => { setPage(0); setOfficeFilter(event.target.value); }} className={`${input} w-44`} aria-label="Filter by Office"><option value="all">All Offices</option><option value="unassigned">No Office</option>{dashboard.offices.map(office => <option key={office.id} value={office.id}>{office.code} · {office.name}</option>)}</AppSelect>}
            <AppSelect value={status} onChange={event => { setPage(0); setStatus(event.target.value); }} className={`${input} w-36`} aria-label="Filter lead status"><option value="all">All statuses</option><option value="new">New</option><option value="inviting">Processing</option><option value="registered">Registered</option><option value="existing">Existing</option></AppSelect>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[940px] text-left text-sm"><thead className="border-b border-white/10 bg-[#111723] text-xs text-slate-400"><tr><th className="px-4 py-3">Lead</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Office</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Received</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-white/[0.07]">
            {dashboard.leads.map(lead => <tr key={lead.id} className="hover:bg-white/[0.025]">
              <td className="px-4 py-3"><div className="font-semibold text-white">{nameOf(lead)}</div><div className="text-xs text-slate-400">{lead.email}</div>{lead.campaign && <div className="mt-1 text-[11px] text-violet-300">{lead.campaign}</div>}</td>
              <td className="px-4 py-3 text-xs text-slate-300"><div>{lead.phone_e164 || lead.phone || '—'}</div>{lead.phone_validation_status === 'valid' ? <div className="mt-1 text-[11px] font-medium text-emerald-300">Correct · {lead.phone_country_code} (+{lead.phone_calling_code})</div> : <div className="mt-1 max-w-52 text-[11px] leading-4 text-red-300">{lead.phone_validation_status === 'pending' ? 'Not checked yet' : lead.phone_validation_reason || 'Incorrect number'}</div>}{lead.country && <div className="mt-1 text-[10px] text-slate-500">Submitted country: {lead.country}</div>}</td>
              <td className="px-4 py-3"><AppSelect value={lead.office_id || ''} onChange={event => setLeadOffice(lead, event.target.value)} disabled={!!busy || lead.status !== 'new' || dashboard.actor_role === 'desk_manager'} className={`${input} min-w-36 py-2 text-xs`}><option value="" disabled={staffMode}>No office</option>{dashboard.offices.filter(office => office.status === 'active').map(office => <option key={office.id} value={office.id}>{office.code} · {office.name}</option>)}</AppSelect><div className={`mt-1 text-[10px] ${lead.phone_routing_status === 'routed' || lead.phone_routing_status === 'manual' ? 'text-emerald-300' : 'text-amber-300'}`}>{lead.phone_routing_status === 'routed' ? 'Auto-routed by phone' : lead.phone_routing_status === 'no_desk_manager' ? 'Office has no Desk Manager' : lead.phone_routing_status === 'no_office' ? 'No Office for detected country' : lead.phone_routing_status === 'manual' ? 'Manually classified' : lead.phone_routing_status === 'invalid' ? 'Waiting for phone correction' : 'Routing not checked'}</div>{lead.office_id && dashboard.desk_managers.filter(manager => { const user = Array.isArray(manager.users) ? manager.users[0] : manager.users; return user?.office_id === lead.office_id; }).length > 0 && <div className="mt-1 max-w-52 text-[10px] text-slate-400">Desk: {dashboard.desk_managers.filter(manager => { const user = Array.isArray(manager.users) ? manager.users[0] : manager.users; return user?.office_id === lead.office_id; }).map(deskManagerName).join(', ')}</div>}</td>
              <td className="px-4 py-3 text-xs text-slate-300"><div>{lead.source_name || 'Import'}</div><div className="text-slate-500">{lead.source_kind.replaceAll('_', ' ')}</div></td>
              <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">{new Date(lead.created_at).toLocaleDateString()}</td>
              <td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-xs ${lead.status === 'new' ? 'bg-violet-500/15 text-violet-200' : lead.status === 'registered' ? 'bg-emerald-500/15 text-emerald-200' : 'bg-white/5 text-slate-300'}`}>{lead.status === 'inviting' ? 'Processing' : lead.status === 'existing' ? 'Existing client' : lead.status}</span>{lead.registration_error && <div className="mt-2 max-w-64 text-[11px] leading-4 text-red-300">Last attempt: {lead.registration_error}</div>}</td>
              <td className="px-4 py-3 text-right">{lead.status === 'new' ? <button type="button" onClick={() => { setSelectedLead(lead); setOwner(''); }} disabled={!!busy} className={`${button} bg-violet-600 text-white hover:bg-violet-500`}><Send size={14} />Register</button> : lead.status === 'inviting' ? <span className="text-xs text-slate-400">Account creation in progress</span> : <span className="text-xs text-slate-500">Linked</span>}</td>
            </tr>)}
            </tbody></table>{!loading && dashboard.leads.length === 0 && <div className="p-10 text-center text-sm text-slate-400">No leads match this view yet.</div>}{loading && <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-400"><Loader2 size={17} className="animate-spin" />Loading leads</div>}</div>
          <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs text-slate-400"><span>{dashboard.total ? `${page * 50 + 1}–${Math.min((page + 1) * 50, dashboard.total)} of ${dashboard.total}` : '0 leads'}</span><div className="flex gap-2"><button type="button" onClick={() => setPage(value => value - 1)} disabled={page === 0 || loading} className={`${button} border border-white/10 disabled:opacity-40`}>Previous</button><button type="button" onClick={() => setPage(value => value + 1)} disabled={(page + 1) * 50 >= dashboard.total || loading} className={`${button} border border-white/10 disabled:opacity-40`}>Next</button></div></div>
        </section>

        {!staffMode && <aside className="space-y-4">
          <section className={`${panel} p-5`}>
            <div className="mb-3 flex items-center gap-2"><KeyRound size={18} className="text-violet-300" /><h2 className="font-semibold">Affiliate API</h2></div>
            <p className="text-xs leading-5 text-slate-400">A secure server-to-server connection that lets an affiliate deliver leads to this company’s CRM without receiving CRM access.</p>
            <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-500/[0.07] p-3 text-xs leading-5 text-emerald-100"><b>What to send:</b> create the affiliate’s key, then download and send the generated <b>Affiliate API package</b>. It contains their private key and the complete instructions in one file.</div>
            <button type="button" onClick={() => setShowAffiliateDocs(true)} className={`${button} mt-4 w-full border border-violet-400/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20`}><BookOpen size={16} />View full integration guide</button>
            <div className="my-4 border-t border-white/10" />
            <label className="mb-1.5 block text-xs font-medium text-slate-300">Create a private key</label>
            <form onSubmit={createAffiliate} className="flex gap-2"><input required maxLength={100} value={affiliateName} onChange={event => setAffiliateName(event.target.value)} placeholder="Affiliate or partner name" className={input} /><button type="submit" disabled={!!busy} aria-label="Create affiliate key" className={`${button} bg-violet-600 text-white hover:bg-violet-500`}><Plus size={16} /></button></form>
            <p className="mt-2 text-[11px] leading-4 text-amber-200/80">The secret key is displayed once. Create a different key for each affiliate.</p>
          </section>
          <section className={`${panel} p-5`}><div className="mb-4 flex items-center gap-2"><Link2 size={18} className="text-violet-300" /><h2 className="font-semibold">Google Sheet</h2></div><p className="mb-4 text-xs leading-5 text-slate-400">Connect a Google Sheet that can be exported as CSV. The server checks active sheets every 10 minutes.</p><form onSubmit={createSheet} className="space-y-2.5"><input required maxLength={100} value={sheetName} onChange={event => setSheetName(event.target.value)} placeholder="Sheet name" className={input} /><input required type="url" value={sheetUrl} onChange={event => setSheetUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." className={input} /><button type="submit" disabled={!!busy} className={`${button} w-full bg-violet-600 text-white hover:bg-violet-500`}><Plus size={16} />Connect and sync</button></form></section>
          <section className={`${panel} p-5`}><div className="mb-4 flex items-center gap-2"><FileSpreadsheet size={18} className="text-violet-300" /><h2 className="font-semibold">Import a file</h2></div><p className="mb-4 text-xs leading-5 text-slate-400">Upload CSV or Excel .xlsx with an Email column. International phone numbers are validated and routed automatically.</p><label className={`${button} w-full cursor-pointer border border-white/15 text-slate-200 hover:border-violet-400/40`}><Upload size={16} />{busy === 'import' ? 'Importing...' : 'Choose CSV or Excel file'}<input type="file" accept=".csv,.xlsx" className="sr-only" disabled={!!busy} onChange={event => { const file = event.target.files?.[0]; if (file) importFile(file); event.target.value = ''; }} /></label></section>
          <section className={`${panel} overflow-hidden`}>
            <div className="border-b border-white/10 px-5 py-4"><h2 className="font-semibold">Connections</h2><p className="mt-1 text-xs text-slate-400">Rename, pause, rotate, or delete an Affiliate API connection.</p></div>
            {dashboard.sources.length === 0 ? <div className="px-5 py-6 text-xs text-slate-400">No connections yet.</div> : <div className="divide-y divide-white/[0.07]">{dashboard.sources.map(source => <div key={source.id} className="p-4">
              {editingAffiliateId === source.id ? <form onSubmit={event => renameAffiliate(event, source)} className="flex items-center gap-2"><input autoFocus required maxLength={100} value={editingAffiliateName} onChange={event => setEditingAffiliateName(event.target.value)} aria-label={`New name for ${source.name}`} className={`${input} min-w-0 flex-1 py-2`} /><button type="submit" disabled={!!busy || !editingAffiliateName.trim()} className={`${button} border border-emerald-400/25 p-2 text-emerald-300 hover:bg-emerald-500/10`} aria-label="Save affiliate name"><Check size={15} /></button><button type="button" onClick={() => { setEditingAffiliateId(null); setEditingAffiliateName(''); }} disabled={!!busy} className={`${button} border border-white/10 p-2 text-slate-400 hover:text-white`} aria-label="Cancel affiliate rename"><X size={15} /></button></form> : <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="flex items-center gap-2"><div className="truncate text-sm font-semibold">{source.name}</div>{source.kind === 'affiliate_api' && <button type="button" onClick={() => { setEditingAffiliateId(source.id); setEditingAffiliateName(source.name); setConfirmRotate(null); setError(null); setNotice(null); }} disabled={!!busy} className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-white/5 hover:text-violet-300 disabled:opacity-50" aria-label={`Edit ${source.name} name`} title="Edit affiliate name"><Pencil size={13} /></button>}</div><div className="mt-0.5 text-xs text-slate-500">{source.kind === 'google_sheet' ? 'Google Sheet' : 'Affiliate API'} · {source.active ? 'Active' : 'Paused'}</div></div><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${source.active ? 'bg-emerald-400' : 'bg-slate-600'}`} /></div>}
              {source.last_synced_at && <div className="mt-2 text-[11px] text-slate-500">Last sync {new Date(source.last_synced_at).toLocaleString()}</div>}
              {source.last_sync_error && <div className="mt-2 text-xs text-amber-300">{source.last_sync_error}</div>}
              <div className="mt-3 flex flex-wrap gap-2">
                {source.kind === 'google_sheet' && <button type="button" onClick={() => syncSource(source)} disabled={!!busy || !source.active} className={`${button} border border-white/10 text-xs text-slate-300 hover:text-white`}><RefreshCw size={13} />Sync now</button>}
                {source.kind === 'affiliate_api' && (confirmRotate === source.id ? <><button type="button" onClick={() => setConfirmRotate(null)} className={`${button} text-xs text-slate-400`}>Cancel</button><button type="button" onClick={() => rotateKey(source)} disabled={!!busy} className={`${button} bg-amber-500/15 text-xs text-amber-200`}>Confirm rotation</button></> : <button type="button" onClick={() => setConfirmRotate(source.id)} disabled={!!busy} className={`${button} border border-white/10 text-xs text-slate-300 hover:text-white`}><KeyRound size={13} />Rotate key</button>)}
                <button type="button" onClick={() => toggleSource(source)} disabled={!!busy} className={`${button} border border-white/10 text-xs text-slate-300 hover:text-white`}>{source.active ? 'Pause' : 'Activate'}</button>
                {source.kind === 'affiliate_api' && <button type="button" onClick={() => { setConfirmRotate(null); setDeleteAffiliate(source); }} disabled={!!busy} className={`${button} border border-red-400/20 text-xs text-red-300 hover:bg-red-500/10 hover:text-red-200`}><Trash2 size={13} />Delete</button>}
              </div>
            </div>)}</div>}
          </section>
        </aside>}
      </div>

      {deleteAffiliate && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4">
        <section role="dialog" aria-modal="true" aria-labelledby="delete-affiliate-title" className="w-full max-w-2xl rounded-2xl border border-red-400/25 bg-[#171e2b] p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-red-300"><AlertTriangle size={19} /><span className="text-xs font-semibold uppercase tracking-wider">Permanent deletion</span></div><h2 id="delete-affiliate-title" className="mt-1 text-xl font-bold text-white">Delete {deleteAffiliate.name}?</h2><p className="mt-2 text-sm leading-6 text-slate-400">Choose what happens to the Lead Inbox records received from this affiliate. The affiliate key will stop working immediately with either option.</p></div><button type="button" onClick={() => setDeleteAffiliate(null)} disabled={!!busy} aria-label="Cancel affiliate deletion" className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-50"><X size={20} /></button></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => deleteAffiliateSource(false)} disabled={!!busy} className="rounded-xl border border-amber-400/25 bg-amber-500/[0.06] p-4 text-left transition hover:bg-amber-500/10 disabled:opacity-50"><div className="flex items-center gap-2 font-semibold text-amber-100"><Trash2 size={17} />Delete affiliate only</div><p className="mt-2 text-xs leading-5 text-slate-300">Deletes the connection and API key but keeps every existing lead record in the Lead Inbox.</p></button>
            <button type="button" onClick={() => deleteAffiliateSource(true)} disabled={!!busy} className="rounded-xl border border-red-400/30 bg-red-500/[0.08] p-4 text-left transition hover:bg-red-500/15 disabled:opacity-50"><div className="flex items-center gap-2 font-semibold text-red-100"><Trash2 size={17} />Delete affiliate and leads</div><p className="mt-2 text-xs leading-5 text-slate-300">Deletes the connection, API key, and all Lead Inbox records linked to this affiliate.</p></button>
          </div>
          <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3 text-xs leading-5 text-slate-400"><b className="text-slate-200">Client accounts are always preserved.</b> If a linked lead was already registered as a client, this deletion never removes that client’s login, wallet, funds, or trading data.</div>
          <div className="mt-5 flex justify-end"><button type="button" onClick={() => setDeleteAffiliate(null)} disabled={!!busy} className={`${button} border border-white/10 text-slate-300 hover:text-white`}>Cancel</button></div>
        </section>
      </div>}

      {showAffiliateDocs && <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/80 p-3 sm:p-6">
        <section role="dialog" aria-modal="true" aria-labelledby="affiliate-docs-title" className="mx-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-white/15 bg-[#171e2b] shadow-2xl">
          <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#171e2b]/95 px-5 py-4 backdrop-blur sm:px-7">
            <div><div className="flex items-center gap-2 text-violet-300"><BookOpen size={19} /><span className="text-xs font-semibold uppercase tracking-wider">Technical documentation</span></div><h2 id="affiliate-docs-title" className="mt-1 text-xl font-bold text-white">Affiliate Lead API integration guide</h2><p className="mt-1 text-sm text-slate-400">Everything an affiliate needs to securely deliver leads into the CRM.</p></div>
            <button type="button" onClick={() => setShowAffiliateDocs(false)} aria-label="Close documentation" className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"><X size={20} /></button>
          </header>
          <div className="space-y-7 px-5 py-6 text-sm text-slate-300 sm:px-7">
            {secret ? <section className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4"><h3 className="flex items-center gap-2 font-semibold text-emerald-100"><Send size={17} />Ready to send to {secret.name}</h3><p className="mt-2 text-xs leading-5 text-emerald-50/80">This guide contains the real private key. Click <b>Download file to send to affiliate</b> at the bottom and send that one file to the affiliate through a secure channel. They do not need a screenshot or anything else from this CRM page.</p></section> : <section className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4"><h3 className="flex items-center gap-2 font-semibold text-amber-100"><KeyRound size={17} />Documentation preview only — do not send yet</h3><p className="mt-2 text-xs leading-5 text-amber-50/80">The value <span className="font-mono">YOUR_AFFILIATE_KEY</span> is only a placeholder. Close this guide, create a private key using the affiliate’s name, and then download the package from the key window.</p></section>}
            <section><h3 className="font-semibold text-white">What this API does</h3><p className="mt-2 max-w-4xl leading-6 text-slate-400">This is a server-to-server lead intake API. An affiliate sends prospective client details, and valid submissions appear in the selected company’s CRM Lead inbox. It does not give the affiliate CRM access and does not automatically create a client account, deposit, or trade. CRM staff review and register each lead separately.</p></section>

            <section className="grid gap-3 md:grid-cols-3">
              {[['1', 'Create a connection', 'Enter the affiliate name and generate a private key. Use a separate key for every partner.'], ['2', 'Send the documentation', 'Give the affiliate this guide, endpoint, and their key through a secure channel.'], ['3', 'Receive CRM leads', 'Accepted submissions appear in this company’s Lead inbox with the affiliate as their source.']].map(([number, title, description]) => <div key={number} className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><div className="mb-3 flex h-7 w-7 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-200">{number}</div><h4 className="font-semibold text-white">{title}</h4><p className="mt-1 text-xs leading-5 text-slate-400">{description}</p></div>)}
            </section>

            <section><h3 className="font-semibold text-white">Endpoint and authentication</h3><div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-[#0d1118] p-4 font-mono text-xs"><div><span className="mr-3 rounded bg-emerald-500/15 px-2 py-1 font-sans font-bold text-emerald-300">POST</span><span className="break-all text-slate-200">{apiUrl}</span></div><div className="border-t border-white/10 pt-3 text-slate-300">Content-Type: application/json</div><div className="break-all text-slate-300">x-affiliate-key: {secret?.key || 'YOUR_AFFILIATE_KEY'}</div></div>{secret && <p className="mt-2 text-xs text-amber-200">This guide currently contains the newly generated key. Copy or download it before closing the key window.</p>}</section>

            <section><h3 className="font-semibold text-white">Request fields</h3><div className="mt-3 overflow-x-auto rounded-xl border border-white/10"><table className="w-full min-w-[680px] text-left text-xs"><thead className="bg-white/[0.04] text-slate-400"><tr><th className="px-4 py-3">Field</th><th className="px-4 py-3">Required</th><th className="px-4 py-3">Limit</th><th className="px-4 py-3">Meaning</th></tr></thead><tbody className="divide-y divide-white/[0.07]">{[
                ['email', 'Yes', '254', 'Valid email address; converted to lowercase and used for duplicate detection.'],
                ['first_name', 'No', '100', 'Lead’s first name.'], ['last_name', 'No', '100', 'Lead’s last name.'],
                ['full_name', 'No', '200', 'Alternative to first_name and last_name.'], ['phone', 'No', '60', 'International number beginning with + or 00; validated and routed by detected country.'],
                ['country', 'No', '100', 'Affiliate-provided country metadata; the detected phone country controls routing.'], ['office', 'No', '100', 'Affiliate-provided Office metadata; it does not override phone routing.'],
                ['campaign', 'No', '120', 'Campaign or marketing source label.'], ['notes', 'No', '2,000', 'Additional lead information.'],
                ['external_id', 'No', '120', 'Affiliate’s own reference; it is not used for duplicate detection.']
              ].map(row => <tr key={row[0]}><td className="px-4 py-3 font-mono text-violet-200">{row[0]}</td><td className="px-4 py-3">{row[1]}</td><td className="px-4 py-3">{row[2]}</td><td className="px-4 py-3 text-slate-400">{row[3]}</td></tr>)}</tbody></table></div><p className="mt-2 text-xs leading-5 text-slate-400">The validated phone country controls Office routing: +49 → DE, +33 → FR, +34 → ES and +39 → IT when those active Office codes exist. Invalid or missing numbers go to <b>Incorrect numbers</b>. Valid countries without an Office or Desk Manager go to <b>Routing review</b>. Submitted country or office text cannot override the detected number.</p></section>

            <section className="grid gap-5 lg:grid-cols-2">
              <div><h3 className="font-semibold text-white">Single-lead JSON</h3><pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-[#0d1118] p-4 text-xs leading-5 text-slate-300"><code>{`{
  "email": "jane@example.com",
  "first_name": "Jane",
  "last_name": "Doe",
  "phone": "+49 30 901820",
  "country": "DE",
  "campaign": "Spring campaign",
  "notes": "Requested a callback",
  "external_id": "partner-123"
}`}</code></pre></div>
              <div><h3 className="font-semibold text-white">Batch JSON (1–100 leads)</h3><pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-[#0d1118] p-4 text-xs leading-5 text-slate-300"><code>{`{
  "leads": [
    {
      "email": "jane@example.com",
      "first_name": "Jane",
      "last_name": "Doe"
    },
    {
      "email": "john@example.com",
      "first_name": "John"
    }
  ]
}`}</code></pre></div>
            </section>

            <section><h3 className="font-semibold text-white">cURL example</h3><pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-[#0d1118] p-4 text-xs leading-5 text-slate-300"><code>{`curl --request POST '${apiUrl}' \\
  --header 'Content-Type: application/json' \\
  --header 'x-affiliate-key: ${secret?.key || 'YOUR_AFFILIATE_KEY'}' \\
  --data '{"email":"jane@example.com","first_name":"Jane","last_name":"Doe","phone":"+49 30 901820","country":"DE","campaign":"Spring campaign","external_id":"partner-123"}'`}</code></pre></section>

            <section><h3 className="font-semibold text-white">JavaScript / Node.js example</h3><pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-[#0d1118] p-4 text-xs leading-5 text-slate-300"><code>{`const response = await fetch('${apiUrl}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-affiliate-key': process.env.AFFILIATE_API_KEY
  },
  body: JSON.stringify({
    email: 'jane@example.com',
    first_name: 'Jane',
    last_name: 'Doe',
    phone: '+49 30 901820',
    country: 'DE',
    campaign: 'Spring campaign',
    external_id: 'partner-123'
  })
});

const result = await response.json();
if (!response.ok) throw new Error(result.error || 'Lead submission failed');`}</code></pre></section>

            <section className="grid gap-5 lg:grid-cols-2"><div><h3 className="font-semibold text-white">Successful response</h3><pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-[#0d1118] p-4 text-xs leading-5 text-slate-300"><code>{`HTTP 200
{
  "accepted": 1,
  "duplicates": 0,
  "invalid": 0
}`}</code></pre><ul className="mt-3 space-y-1 text-xs leading-5 text-slate-400"><li><span className="font-mono text-slate-300">accepted</span>: new leads saved</li><li><span className="font-mono text-slate-300">duplicates</span>: valid emails already present or repeated in the request</li><li><span className="font-mono text-slate-300">invalid</span>: entries without a valid email</li></ul></div><div><h3 className="font-semibold text-white">HTTP errors</h3><div className="mt-3 overflow-hidden rounded-xl border border-white/10 text-xs"><div className="grid grid-cols-[60px_1fr] gap-3 border-b border-white/[0.07] px-4 py-3"><b className="text-amber-200">400</b><span className="text-slate-400">Malformed JSON, empty batch, or over 100 leads</span></div><div className="grid grid-cols-[60px_1fr] gap-3 border-b border-white/[0.07] px-4 py-3"><b className="text-amber-200">401</b><span className="text-slate-400">Missing, invalid, paused, rotated, or unknown key</span></div><div className="grid grid-cols-[60px_1fr] gap-3 border-b border-white/[0.07] px-4 py-3"><b className="text-amber-200">405</b><span className="text-slate-400">A method other than POST was used</span></div><div className="grid grid-cols-[60px_1fr] gap-3 border-b border-white/[0.07] px-4 py-3"><b className="text-amber-200">413</b><span className="text-slate-400">Request body is larger than 500,000 characters</span></div><div className="grid grid-cols-[60px_1fr] gap-3 px-4 py-3"><b className="text-amber-200">500</b><span className="text-slate-400">Temporary server error; retry later</span></div></div></div></section>

            <section className="rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-4"><h3 className="flex items-center gap-2 font-semibold text-amber-100"><ShieldCheck size={17} />Security and delivery rules</h3><ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs leading-5 text-slate-300"><li>Call the endpoint from the affiliate’s backend/server, not from browser JavaScript.</li><li>Never expose the key in a website, mobile app, URL, query string, log, or public repository.</li><li>The key is shown only once and should be stored as a secret environment variable.</li><li>Email is the duplicate key within the destination company. <span className="font-mono">external_id</span> is only a reference.</li><li>Pausing a connection or rotating its key stops the previous access immediately.</li><li>A 500 response may be retried. If the original request was saved, the retry is safely reported as a duplicate.</li></ul></section>
          </div>
          <footer className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-white/10 bg-[#171e2b]/95 px-5 py-4 backdrop-blur sm:px-7"><button type="button" onClick={() => void copyToClipboard(affiliateDocumentation(apiUrl, secret?.key), secret ? 'Complete affiliate package copied.' : 'Documentation template copied. Create a key before sending it.')} className={`${button} border border-white/15 text-slate-200 hover:bg-white/5`}><Copy size={15} />{secret ? 'Copy package' : 'Copy template'}</button>{secret && <button type="button" onClick={downloadAffiliateDocs} className={`${button} bg-emerald-600 text-white hover:bg-emerald-500`}><Download size={15} />Download file to send to affiliate</button>}<button type="button" onClick={() => setShowAffiliateDocs(false)} className={`${button} ${secret ? 'border border-white/15 text-slate-200' : 'bg-violet-600 text-white hover:bg-violet-500'}`}>Done</button></footer>
        </section>
      </div>}

      {secret && !showAffiliateDocs && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"><section role="dialog" aria-modal="true" aria-labelledby="affiliate-key-title" className="w-full max-w-xl rounded-2xl border border-white/15 bg-[#171e2b] p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 id="affiliate-key-title" className="text-lg font-semibold">{secret.name} affiliate package</h2><p className="mt-1 text-sm text-amber-200">The private key is shown only now. Download the package before closing.</p></div><button type="button" onClick={() => setSecret(null)} aria-label="Close" className="text-slate-400 hover:text-white"><X size={20} /></button></div><div className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4"><div className="flex items-center gap-2 font-semibold text-emerald-100"><Send size={17} />This is what you send to the affiliate</div><p className="mt-2 text-xs leading-5 text-emerald-50/80">Download the file below and send that one file securely. It contains the endpoint, this affiliate’s key, all fields, examples, responses, errors, and security instructions.</p></div><button type="button" onClick={downloadAffiliateDocs} className={`${button} mt-4 w-full bg-emerald-600 py-3 text-white hover:bg-emerald-500`}><Download size={17} />Download file to send to affiliate</button><button type="button" onClick={() => setShowAffiliateDocs(true)} className={`${button} mt-2 w-full border border-violet-400/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20`}><BookOpen size={16} />Review package before sending</button><details className="mt-4 rounded-lg border border-white/10 bg-[#0d1118] p-3"><summary className="cursor-pointer text-xs font-medium text-slate-300">Show or copy private key separately</summary><div className="mt-3 break-all rounded-lg bg-black/20 p-3 font-mono text-xs text-white">{secret.key}</div><button type="button" onClick={() => void copyToClipboard(secret.key, 'Affiliate key copied.')} className={`${button} mt-2 w-full border border-white/10 text-slate-200 hover:bg-white/5`}><Clipboard size={16} />Copy key only</button></details><p className="mt-3 text-center text-[11px] leading-4 text-slate-500">Do not send a screenshot. The downloaded package is the complete handoff.</p></section></div>}

      {selectedLead && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"><section role="dialog" aria-modal="true" aria-labelledby="register-lead-title" className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#171e2b] p-6 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h2 id="register-lead-title" className="text-lg font-semibold">Create client account</h2><p className="mt-1 text-sm text-slate-400">{nameOf(selectedLead)} · {selectedLead.email}</p></div><button type="button" onClick={() => setSelectedLead(null)} disabled={!!busy} aria-label="Close" className="text-slate-400 hover:text-white"><X size={20} /></button></div><div className="mt-5 rounded-lg border border-violet-400/20 bg-violet-500/10 p-4 text-sm text-slate-200"><ShieldCheck size={18} className="mb-2 text-violet-300" />Creates an unpromoted Sales client in {dashboard.offices.find(item => item.id === selectedLead.office_id)?.code || 'No office'}. Retention assignment becomes available only after promotion.</div>{error && <div role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}<label className="mt-5 block text-xs font-medium text-slate-300">Assign same-Office sales agent <span className="font-normal text-slate-500">(optional)</span><AppSelect value={owner} onChange={event => setOwner(event.target.value)} className={`mt-1.5 ${input}`}><option value="">Unassigned</option>{dashboard.owners.filter(item => { const user = Array.isArray(item.users) ? item.users[0] : item.users; return (user?.office_id || '') === (selectedLead.office_id || ''); }).map(item => <option key={item.user_id} value={`agent:${item.user_id}`}>{ownerName(item)}</option>)}</AppSelect></label><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setSelectedLead(null)} disabled={!!busy} className={`${button} border border-white/10 text-slate-300`}>Cancel</button><button type="button" onClick={registerLead} disabled={!!busy} className={`${button} bg-violet-600 text-white hover:bg-violet-500`}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}Create client</button></div></section></div>}
    </div>
  </main>;
}
