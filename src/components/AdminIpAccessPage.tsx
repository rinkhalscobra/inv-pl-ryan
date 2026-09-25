import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, CheckCircle2, Copy, Globe2, Pencil, Plus, RefreshCw, Save, ShieldCheck, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { getSelectedCrmCompanyId, setSelectedCrmCompanyId, type CrmCompany } from '../lib/crmCompany';

interface AllowedIp {
  ip_address: string;
  label: string;
  created_at: string;
  created_by: string | null;
  is_current: boolean;
  access_scope: 'platform' | 'company';
  company_id: string | null;
  company_name: string | null;
}

export default function AdminIpAccessPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<AllowedIp[]>([]);
  const [companies, setCompanies] = useState<CrmCompany[]>([]);
  const [isPlatform, setIsPlatform] = useState(false);
  const [selectedCompanyId, setSelectedCompanyIdState] = useState(getSelectedCrmCompanyId() || '');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ip, setIp] = useState('');
  const [label, setLabel] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newCompany, setNewCompany] = useState({ name: '', primaryIp: '' });
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [editingCompanyName, setEditingCompanyName] = useState('');
  const [deleteCompany, setDeleteCompany] = useState<CrmCompany | null>(null);
  const [deleteCompanyConfirmation, setDeleteCompanyConfirmation] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    const [{ data, error: requestError }, { data: companyData, error: companyError }, { data: contextData, error: contextError }] = await Promise.all([
      supabase.rpc('crm_admin_list_ips'),
      supabase.rpc('crm_admin_list_companies'),
      supabase.rpc('crm_admin_network_context'),
    ]);
    if (requestError || companyError || contextError) setError(requestError?.message || companyError?.message || contextError?.message || 'Company access could not load.');
    else {
      setEntries((data as AllowedIp[] | null) || []);
      const nextCompanies = (companyData as CrmCompany[] | null) || [];
      setCompanies(nextCompanies);
      const context = contextData as { is_platform?: boolean; company_id?: string | null } | null;
      setIsPlatform(context?.is_platform === true);
      const availableSelection = nextCompanies.some(company => company.id === selectedCompanyId)
        ? selectedCompanyId : context?.company_id || nextCompanies[0]?.id || '';
      if (availableSelection) {
        setSelectedCompanyIdState(availableSelection);
        setSelectedCrmCompanyId(availableSelection);
      }
      setError(null);
    }
    setLoading(false);
  }, [selectedCompanyId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const addIp = async (event: FormEvent) => {
    event.preventDefault();
    if (!ip.trim() || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const value = ip.trim();
    const { error: requestError } = await supabase.rpc('crm_admin_add_ip', { p_ip: value, p_label: label.trim(), p_company_id: selectedCompanyId || null });
    if (requestError) setError(requestError.code === '23505' ? 'This IP address is already approved.' : requestError.message);
    else {
      setIp('');
      setLabel('');
      await refresh();
      setNotice(`${value} can now access the administrator CRM after signing in.`);
    }
    setBusy(false);
  };

  const chooseCompany = (companyId: string) => {
    setSelectedCompanyIdState(companyId);
    setSelectedCrmCompanyId(companyId);
  };

  const copySecurityCode = async (company: CrmCompany) => {
    try {
      await navigator.clipboard.writeText(company.client_registration_code);
      setError(null);
      setNotice(`${company.name} registration security code copied: ${company.client_registration_code}`);
    } catch {
      setError('Could not copy the registration security code. Select and copy it manually.');
    }
  };

  const copyRegistrationLink = async (company: CrmCompany) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${company.registration_path}`);
      setError(null);
      setNotice(`${company.name} registration link copied.`);
    } catch {
      setError('Could not copy the registration link. Select and copy it manually.');
    }
  };

  const createCompany = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !newCompany.name.trim() || !newCompany.primaryIp.trim()) return;
    setBusy(true); setError(null); setNotice(null);
    const internalCode = `CMP_${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
    const { data, error: requestError } = await supabase.rpc('crm_admin_create_company', {
      p_name: newCompany.name.trim(), p_code: internalCode, p_primary_ip: newCompany.primaryIp.trim(),
    });
    if (requestError) setError(requestError.message);
    else {
      const created = data as { id: string; name: string };
      chooseCompany(created.id);
      setNewCompany({ name: '', primaryIp: '' });
      setNotice(`${created.name} was created with zero clients and its primary IP is approved.`);
      await refresh();
    }
    setBusy(false);
  };

  const saveCompanyName = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !editingCompanyId || !editingCompanyName.trim()) return;
    setBusy(true); setError(null); setNotice(null);
    const { error: requestError } = await supabase.rpc('crm_admin_update_company_name', {
      p_company_id: editingCompanyId,
      p_name: editingCompanyName.trim(),
    });
    if (requestError) setError(requestError.code === '23505' ? 'A company with this name already exists.' : requestError.message);
    else {
      setEditingCompanyId(null);
      setEditingCompanyName('');
      setNotice('Company name updated.');
      await refresh();
    }
    setBusy(false);
  };

  const deleteCompanyPermanently = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !deleteCompany || deleteCompanyConfirmation !== deleteCompany.name) return;
    setBusy(true); setError(null); setNotice(null);
    const { data, error: requestError } = await supabase.functions.invoke('admin-user-management', {
      body: {
        action: 'delete_company',
        company_id: deleteCompany.id,
        confirmation_company_name: deleteCompanyConfirmation,
      },
    });
    if (requestError || data?.error) setError(data?.error || requestError?.message || 'Company deletion failed.');
    else {
      const deletedName = deleteCompany.name;
      setDeleteCompany(null);
      setDeleteCompanyConfirmation('');
      await refresh();
      setNotice(`${deletedName} and all of its users, clients, leads, offices and approved IPs were permanently deleted.`);
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

      {!isPlatform && companies[0] && <section className="mb-5 rounded-xl border border-violet-400/20 bg-violet-500/[0.06] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><h2 className="font-semibold text-white">Client registration details</h2><p className="mt-1 text-xs text-slate-400">Give clients this private security code when they use the public Create account page. The company link fills it automatically.</p><div className="mt-4 flex flex-wrap items-center gap-3"><div className="rounded-lg border border-emerald-400/30 bg-[#0e1420] px-4 py-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Registration security code</div><div className="mt-1 font-mono text-lg font-bold tracking-[0.18em] text-emerald-200">{companies[0].client_registration_code}</div></div><div className="min-w-0 break-all font-mono text-xs text-violet-200">{window.location.origin}{companies[0].registration_path}</div></div></div><div className="flex shrink-0 flex-wrap gap-2"><button type="button" onClick={() => void copySecurityCode(companies[0])} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"><Copy size={16} />Copy security code</button><button type="button" onClick={() => void copyRegistrationLink(companies[0])} className="inline-flex items-center justify-center gap-2 rounded-lg border border-violet-400/30 bg-violet-500/10 px-4 py-2.5 text-sm font-semibold text-violet-100 hover:bg-violet-500/20"><Copy size={16} />Copy link</button></div></div>
      </section>}

      {isPlatform && <section className="mb-5 rounded-xl border border-white/10 bg-[#151b26] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><h2 className="flex items-center gap-2 font-semibold"><Building2 size={18} className="text-violet-300" />Company workspace</h2><p className="mt-1 text-xs text-slate-400">The selected company controls the Clients, hierarchy and Lead inbox shown to platform administrators.</p></div>
          <label className="min-w-[280px] text-xs text-slate-400">Active company<select value={selectedCompanyId} onChange={event => chooseCompany(event.target.value)} className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0e1420] px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400">{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{companies.map(company => <article key={company.id} className={`rounded-lg border p-4 ${company.id === selectedCompanyId ? 'border-violet-400/40 bg-violet-500/[0.07]' : 'border-white/10 bg-black/10'}`}>
          {editingCompanyId === company.id ? <form onSubmit={saveCompanyName} className="mb-3 flex items-center gap-2"><input autoFocus value={editingCompanyName} onChange={event => setEditingCompanyName(event.target.value)} maxLength={100} required className="min-w-0 flex-1 rounded-lg border border-violet-400/30 bg-[#0e1420] px-3 py-2 text-sm text-white outline-none focus:border-violet-400" aria-label="Company name" /><button type="submit" disabled={busy || !editingCompanyName.trim()} className="rounded-lg border border-emerald-400/30 p-2 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50" aria-label="Save company name"><Save size={15} /></button><button type="button" onClick={() => { setEditingCompanyId(null); setEditingCompanyName(''); }} disabled={busy} className="rounded-lg border border-white/10 p-2 text-slate-400 hover:text-white" aria-label="Cancel editing"><X size={15} /></button></form> : <div className="flex items-start justify-between gap-3"><div className="font-semibold text-white">{company.name}</div><div className="flex items-center gap-1"><button type="button" onClick={() => { setEditingCompanyId(company.id); setEditingCompanyName(company.name); setError(null); setNotice(null); }} className="rounded-lg border border-white/10 p-2 text-slate-400 hover:text-white" aria-label={`Edit ${company.name}`}><Pencil size={15} /></button><button type="button" onClick={() => void copyRegistrationLink(company)} className="rounded-lg border border-white/10 p-2 text-slate-400 hover:text-white" aria-label={`Copy ${company.name} registration link`} title="Copy registration link"><Copy size={15} /></button>{company.code !== 'PRIMARY' && <button type="button" onClick={() => { setDeleteCompany(company); setDeleteCompanyConfirmation(''); setError(null); setNotice(null); }} className="rounded-lg border border-red-400/20 p-2 text-red-300 hover:bg-red-500/10" aria-label={`Delete ${company.name}`}><Trash2 size={15} /></button>}</div></div>}
          <div className="mt-3 rounded-lg border border-emerald-400/25 bg-[#0e1420] p-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Registration security code</div><div className="mt-1 flex items-center justify-between gap-3"><span className="break-all font-mono text-lg font-bold tracking-[0.18em] text-emerald-200">{company.client_registration_code}</span><button type="button" onClick={() => void copySecurityCode(company)} className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500" aria-label={`Copy ${company.name} registration security code`}><Copy size={13} />Copy code</button></div><p className="mt-1.5 text-[10px] leading-4 text-slate-500">Private client verification code. Share it only with clients registering for this company.</p></div>
          <div className="mt-3 text-xs text-slate-400">{company.user_count} users · {company.lead_count} leads · {company.office_count} offices</div>
          <div className="mt-2 break-all text-[11px] text-slate-500">{company.registration_path}</div>
        </article>)}</div>
      </section>}

      <div className={`grid items-start gap-5 ${isPlatform ? '' : 'lg:grid-cols-[minmax(0,1fr)_360px]'}`}>
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
                  <div className="mt-1 text-xs text-slate-400">{entry.label || 'No label'} · {entry.access_scope === 'platform' ? 'Platform access' : entry.company_name} · Added {new Date(entry.created_at).toLocaleDateString()}</div>
                </div>
                {entry.is_current ? <span className="text-xs text-slate-500">Protected while in use</span> : confirmRemove === entry.ip_address ?
                  <div className="flex items-center gap-2"><button type="button" onClick={() => setConfirmRemove(null)} disabled={busy} className="rounded-lg px-3 py-2 text-xs text-slate-300 hover:text-white">Cancel</button><button type="button" onClick={() => void removeIp(entry.ip_address)} disabled={busy} className="rounded-lg bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/25 disabled:opacity-50">Confirm removal</button></div> :
                  <button type="button" onClick={() => setConfirmRemove(entry.ip_address)} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:border-red-400/40 hover:text-red-200 disabled:opacity-50"><Trash2 size={14} />Remove</button>}
              </div>)}
            </div>}
        </section>

        {!isPlatform && <section className="rounded-xl border border-white/10 bg-[#151b26] p-5">
          <div className="mb-5 flex items-center gap-2"><Globe2 size={19} className="text-violet-300" /><h2 className="font-semibold">Add an approved network</h2></div>
          <form onSubmit={addIp} className="space-y-4">
            {isPlatform && <label className="block text-xs font-medium text-slate-300">Company<select value={selectedCompanyId} onChange={event => chooseCompany(event.target.value)} required className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0e1420] px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400">{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>}
            <label className="block text-xs font-medium text-slate-300">IP address<input type="text" value={ip} onChange={event => setIp(event.target.value)} required maxLength={45} autoComplete="off" spellCheck={false} placeholder="203.0.113.10" className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0e1420] px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-violet-400" /></label>
            <label className="block text-xs font-medium text-slate-300">Label <span className="font-normal text-slate-500">(optional)</span><input type="text" value={label} onChange={event => setLabel(event.target.value)} maxLength={80} placeholder="Office, VPN, or location" className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0e1420] px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400" /></label>
            <button type="submit" disabled={busy || !ip.trim()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"><Plus size={17} />Approve IP address</button>
          </form>
          <p className="mt-4 border-t border-white/10 pt-4 text-xs leading-5 text-slate-400">Enter one IPv4 or IPv6 address. Network ranges are not accepted. The person connecting from that address must still sign in with an administrator account.</p>
          {currentIp && <p className="mt-3 text-xs text-slate-500">Your current network: <span className="font-mono text-slate-300">{currentIp}</span></p>}
        </section>}
      </div>

      {isPlatform && <section className="mt-5 rounded-xl border border-white/10 bg-[#151b26] p-5">
        <div className="mb-5 flex items-center gap-2"><Building2 size={19} className="text-violet-300" /><div><h2 className="font-semibold">Create an isolated company</h2><p className="mt-1 text-xs text-slate-400">The company starts with zero clients, leads, users and offices.</p></div></div>
        <form onSubmit={createCompany} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="text-xs text-slate-300">Company name<input value={newCompany.name} onChange={event => setNewCompany(current => ({ ...current, name: event.target.value }))} required maxLength={100} className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0e1420] px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400" /></label>
          <label className="text-xs text-slate-300">Primary IP<input value={newCompany.primaryIp} onChange={event => setNewCompany(current => ({ ...current, primaryIp: event.target.value }))} required maxLength={45} placeholder="203.0.113.10" className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0e1420] px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-violet-400" /></label>
          <button type="submit" disabled={busy} className="mt-5 inline-flex h-[42px] items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-semibold hover:bg-violet-500 disabled:opacity-50"><Plus size={16} />Create company</button>
        </form>
      </section>}

      {deleteCompany && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-company-title"><form onSubmit={deleteCompanyPermanently} className="w-full max-w-lg rounded-2xl border border-red-400/30 bg-[#151b26] p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 id="delete-company-title" className="text-xl font-bold text-red-200">Permanently delete {deleteCompany.name}?</h2><p className="mt-2 text-sm leading-6 text-slate-300">This permanently deletes the company, its approved IPs, authentication accounts, users, clients, leads, offices, lead sources, wallets, transactions, positions and related account data.</p></div><button type="button" onClick={() => { setDeleteCompany(null); setDeleteCompanyConfirmation(''); }} disabled={busy} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Cancel company deletion"><X size={19} /></button></div><div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-lg bg-black/20 p-3"><div className="text-lg font-bold text-white">{deleteCompany.user_count}</div><div className="text-slate-500">users</div></div><div className="rounded-lg bg-black/20 p-3"><div className="text-lg font-bold text-white">{deleteCompany.lead_count}</div><div className="text-slate-500">leads</div></div><div className="rounded-lg bg-black/20 p-3"><div className="text-lg font-bold text-white">{deleteCompany.office_count}</div><div className="text-slate-500">offices</div></div></div><label className="mt-5 block text-xs text-slate-300">Type <span className="font-semibold text-red-200">{deleteCompany.name}</span> to confirm<input autoFocus value={deleteCompanyConfirmation} onChange={event => setDeleteCompanyConfirmation(event.target.value)} autoComplete="off" className="mt-2 w-full rounded-lg border border-red-400/30 bg-[#0e1420] px-3 py-2.5 text-sm text-white outline-none focus:border-red-400" /></label><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => { setDeleteCompany(null); setDeleteCompanyConfirmation(''); }} disabled={busy} className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:text-white disabled:opacity-50">Cancel</button><button type="submit" disabled={busy || deleteCompanyConfirmation !== deleteCompany.name} className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40">{busy ? 'Deleting company...' : 'Delete company permanently'}</button></div></form></div>}
    </div>
  </main>;
}
