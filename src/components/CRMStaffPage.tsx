import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bot, ExternalLink, Loader2, RefreshCw, Search, ShieldCheck, TrendingUp, UserCheck, Users, Wallet } from 'lucide-react';
import AppSelect from './AppSelect';
import { supabase } from '../lib/supabaseClient';
import { useFiatCurrency } from '../hooks/useFiatCurrency';
import { openClientDashboard } from '../lib/clientAccess';

type Row = Record<string, unknown>;
type StaffRole = 'workflow_manager' | 'desk_manager' | 'agent' | 'retention_manager' | 'retention';

interface StaffClient {
  id: string; email: string; first_name: string | null; last_name: string | null;
  country: string | null; kyc_status: string; created_at: string; is_promoted: boolean;
  office_id: string | null; office_name: string | null; office_code: string | null;
  owner_id: string | null; owner_role: 'agent' | 'retention'; owner_name: string | null;
  usdt_balance: number; usd_balance: number; btc_balance: number;
}
interface Office { id: string; name: string; code: string; status: 'active' | 'inactive' }
interface TeamMember { id: string; email: string; first_name: string | null; last_name: string | null; role: StaffRole; manager_id: string | null; office_id: string | null; office_name: string | null; office_code: string | null }
interface StaffScope { role: StaffRole; office: { id: string; name: string; code: string } | null; offices: Office[]; team_members: TeamMember[]; clients: StaffClient[] }
interface ClientWorkspace { profile: StaffClient & { phone_number: string | null }; balance: Row; robot: Row; assets: Row[]; transactions: Row[]; positions: Row[]; orders: Row[]; stakes: Row[]; deposits: Row[] }

const panel = 'rounded-xl border border-white/[0.1] bg-[#151b26]';
const input = 'w-full rounded-lg border border-white/[0.13] bg-[#0f1520] px-3 py-2 text-sm text-white outline-none focus:border-violet-400';
const nameOf = (person: { first_name: string | null; last_name: string | null; email: string }) => `${person.first_name || ''} ${person.last_name || ''}`.trim() || person.email;
const valueOf = (value: unknown) => value === null || value === undefined || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const roleLabels: Record<StaffRole, string> = { workflow_manager: 'Workflow Manager', desk_manager: 'Desk Manager', agent: 'Agent', retention_manager: 'Retention Manager', retention: 'Retention' };
const emptyScope = (role: StaffRole): StaffScope => ({ role, office: null, offices: [], team_members: [], clients: [] });

function DataTable({ title, rows, columns }: { title: string; rows: Row[]; columns: string[] }) {
  return <section className={`${panel} overflow-hidden`}><div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3"><h3 className="font-semibold">{title}</h3><span className="rounded-md bg-white/[0.05] px-2 py-1 text-xs text-slate-400">{rows.length}</span></div>{rows.length === 0 ? <div className="p-6 text-sm text-slate-500">No records</div> : <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-white/[0.025] text-xs uppercase text-slate-500"><tr>{columns.map(column => <th key={column} className="px-4 py-2.5">{column.replace(/_/g, ' ')}</th>)}</tr></thead><tbody className="divide-y divide-white/[0.06]">{rows.slice(0, 25).map((row, index) => <tr key={String(row.id || index)}>{columns.map(column => <td key={column} className="max-w-[220px] truncate px-4 py-3 font-mono text-xs text-slate-300">{column.endsWith('_at') && row[column] ? new Date(String(row[column])).toLocaleString() : valueOf(row[column])}</td>)}</tr>)}</tbody></table></div>}</section>;
}

export default function CRMStaffPage({ role }: { role: StaffRole }) {
  const navigate = useNavigate();
  const { convertUsdToEur, formatEur } = useFiatCurrency();
  const [scope, setScope] = useState<StaffScope>(emptyScope(role));
  const [workspace, setWorkspace] = useState<ClientWorkspace | null>(null);
  const [search, setSearch] = useState('');
  const [officeFilter, setOfficeFilter] = useState('all');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [loadingScope, setLoadingScope] = useState(true);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [openingClientId, setOpeningClientId] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deposit, setDeposit] = useState({ amount: '', currency: 'EUR', reference: '', reason: 'CRM lead deposit' });
  const [editingDepositId, setEditingDepositId] = useState('');
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const scopeRequest = useRef(0);
  const workspaceRequest = useRef(0);

  const loadScope = useCallback(async (query = search) => {
    const requestId = ++scopeRequest.current;
    setLoadingScope(true);
    const { data, error: requestError } = await supabase.rpc('crm_staff_get_scope', { p_search: query.trim() || null });
    if (requestId !== scopeRequest.current) return;
    if (requestError) { setError(requestError.message); setScope(emptyScope(role)); setWorkspace(null); }
    else { setScope((data as StaffScope) || emptyScope(role)); setError(null); }
    setLoadingScope(false);
  }, [role, search]);

  const isWorkspaceManager = role === 'workflow_manager' || role === 'retention_manager';
  const filteredTeamMembers = useMemo(() => officeFilter === 'all' ? scope.team_members : scope.team_members.filter(member => (member.office_id || 'unassigned') === officeFilter), [officeFilter, scope.team_members]);
  const filteredClients = useMemo(() => officeFilter === 'all' ? scope.clients : scope.clients.filter(client => (client.office_id || 'unassigned') === officeFilter), [officeFilter, scope.clients]);
  useEffect(() => { const timer = window.setTimeout(() => void loadScope(search), 250); return () => window.clearTimeout(timer); }, [loadScope, search]);
  useEffect(() => { setSelectedClientId(current => filteredClients.some(client => client.id === current) ? current : filteredClients[0]?.id || ''); }, [filteredClients]);
  useEffect(() => {
    const requestId = ++workspaceRequest.current;
    setWorkspace(null);
    if (!selectedClientId) { setLoadingWorkspace(false); return; }
    setLoadingWorkspace(true);
    void supabase.rpc('crm_staff_get_client_workspace', { p_client_id: selectedClientId }).then(({ data, error: requestError }) => {
      if (requestId !== workspaceRequest.current) return;
      if (requestError) { setError(requestError.message); setWorkspace(null); } else { setError(null); setWorkspace((data as ClientWorkspace) || null); }
      setLoadingWorkspace(false);
    });
  }, [selectedClientId, workspaceVersion]);
  useEffect(() => { setEditingDepositId(''); setDeposit({ amount: '', currency: 'EUR', reference: '', reason: 'CRM lead deposit' }); }, [selectedClientId]);

  const selectedClient = useMemo(() => scope.clients.find(client => client.id === selectedClientId), [scope.clients, selectedClientId]);
  const openClient = async (clientId: string) => { setOpeningClientId(clientId); setError(null); try { await openClientDashboard(clientId); } catch (cause) { setError(cause instanceof Error ? cause.message : 'The client dashboard could not be opened.'); } finally { setOpeningClientId(''); } };
  const promote = async () => {
    if (!selectedClient || !window.confirm(`Promote ${nameOf(selectedClient)} to Retention? Sales access will end immediately.`)) return;
    setBusy('promote'); setError(null); setNotice(null);
    const { error: requestError } = await supabase.rpc('crm_promote_client_to_retention', { p_client_id: selectedClient.id });
    if (requestError) setError(requestError.message); else { setNotice('Client promoted. Sales access has been removed and Admin can now assign a Retention owner.'); await loadScope(); }
    setBusy('');
  };
  const saveDeposit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selectedClient) return;
    const amount = Number(deposit.amount);
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a deposit amount greater than zero.'); return; }
    setBusy('deposit'); setError(null); setNotice(null);
    const { error: requestError } = editingDepositId
      ? await supabase.rpc('crm_workflow_update_lead_deposit', { p_transaction_id: editingDepositId, p_amount: amount, p_currency: deposit.currency, p_reference: deposit.reference.trim(), p_reason: deposit.reason.trim() })
      : await supabase.rpc('crm_workflow_add_lead_deposit', { p_client_id: selectedClient.id, p_amount: amount, p_currency: deposit.currency, p_reference: deposit.reference.trim(), p_reason: deposit.reason.trim() });
    if (requestError) setError(requestError.message); else { setNotice(editingDepositId ? 'Deposit corrected, with the original credit reversed for audit history.' : 'Deposit added and recorded in the audit log.'); setEditingDepositId(''); setDeposit({ amount: '', currency: 'EUR', reference: '', reason: 'CRM lead deposit' }); await loadScope(); setWorkspaceVersion(value => value + 1); }
    setBusy('');
  };

  return <div className="min-h-screen bg-[#0d1118] px-4 py-5 text-slate-100 sm:px-6 lg:px-8"><div className="mx-auto max-w-[1700px]">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.09] pb-5"><div className="flex items-center gap-3"><button onClick={() => navigate('/dashboard')} className="rounded-lg border border-white/[0.12] p-2.5 text-slate-300 hover:text-white" aria-label="Back to platform"><ArrowLeft size={19} /></button><div className="rounded-lg bg-violet-500/15 p-2.5 text-violet-300"><ShieldCheck size={21} /></div><div><h1 className="text-2xl font-bold">{roleLabels[role]} workspace</h1><p className="text-sm text-slate-400">{role.startsWith('retention') || role === 'retention' ? 'Retention' : 'Sales'} · {isWorkspaceManager ? 'All Offices · workspace-wide access' : `${scope.office ? `${scope.office.code} · ${scope.office.name}` : 'No office'} · hierarchy-scoped access`}</p></div></div><div className="flex flex-wrap gap-2">{isWorkspaceManager && <AppSelect value={officeFilter} onChange={event => setOfficeFilter(event.target.value)} className={`${input} w-48`} aria-label="Filter workspace by Office"><option value="all">All Offices</option><option value="unassigned">No Office</option>{scope.offices.map(office => <option key={office.id} value={office.id}>{office.code} · {office.name}{office.status === 'inactive' ? ' (inactive)' : ''}</option>)}</AppSelect>}{role === 'workflow_manager' && <button onClick={() => navigate('/crm/leads')} className="rounded-lg border border-violet-400/30 px-3 py-2 text-sm font-semibold text-violet-200 hover:bg-violet-500/10">Lead inbox</button>}<button onClick={() => void loadScope()} disabled={loadingScope} className="flex items-center gap-2 rounded-lg border border-white/[0.12] px-3 py-2 text-sm text-slate-300 hover:text-white disabled:opacity-50"><RefreshCw size={16} className={loadingScope ? 'animate-spin' : ''} />Refresh</button></div></div>
    {error && <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}{notice && <div role="status" className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</div>}
    {filteredTeamMembers.length > 0 && <section className={`${panel} mb-5 p-4`}><h2 className="flex items-center gap-2 font-semibold"><Users size={17} />{isWorkspaceManager ? 'Workspace team' : 'Your team'}</h2><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{filteredTeamMembers.map(member => <div key={member.id} className="rounded-lg border border-white/[0.08] bg-black/10 p-3"><div className="truncate font-semibold">{nameOf(member)}</div><div className="truncate text-xs text-slate-400">{member.email}</div><div className="mt-2 text-xs text-violet-300">{roleLabels[member.role]} · {member.office_code || 'No Office'}</div></div>)}</div></section>}
    <div className="grid gap-5 xl:grid-cols-[310px_minmax(0,1fr)]"><aside className={`${panel} h-fit overflow-hidden xl:sticky xl:top-4`}><div className="border-b border-white/[0.08] p-4"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold"><UserCheck size={17} />Accessible clients</h2><span className="text-xs text-slate-400">{filteredClients.length}</span></div><div className="relative mt-3"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search clients" className="w-full rounded-lg border border-white/[0.12] bg-[#0f1520] py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-violet-400" /></div></div><div className="max-h-[70vh] overflow-y-auto p-2">{loadingScope ? <div className="p-6 text-center text-sm text-slate-400">Loading clients...</div> : filteredClients.length === 0 ? <div className="p-6 text-center text-sm text-slate-400">No clients match this Office filter.</div> : filteredClients.map(client => <button key={client.id} type="button" onClick={() => setSelectedClientId(client.id)} className={`mb-1 w-full rounded-lg border px-3 py-3 text-left ${selectedClientId === client.id ? 'border-violet-400/40 bg-violet-500/10' : 'border-transparent hover:bg-white/[0.04]'}`}><div className="truncate text-sm font-semibold">{nameOf(client)}</div><div className="truncate text-xs text-slate-400">{client.email}</div><div className="mt-1 truncate text-xs text-violet-300">{client.is_promoted ? 'Promoted' : 'Sales lead'} · {client.office_code || 'No Office'} · {client.owner_name || 'Unassigned'}</div></button>)}</div></aside>
      <main className="min-w-0 space-y-5">{!selectedClientId ? <div className={`${panel} flex min-h-[330px] items-center justify-center p-8 text-center text-slate-400`}>Select an accessible client.</div> : loadingWorkspace ? <div className={`${panel} flex min-h-[330px] items-center justify-center text-slate-400`}>Loading client workspace...</div> : !workspace ? <div className={`${panel} flex min-h-[330px] items-center justify-center p-8 text-center text-slate-400`}>Client workspace unavailable.</div> : <>
        <section className={`${panel} p-5`}><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-bold">{nameOf(workspace.profile)}</h2><p className="mt-1 text-sm text-slate-400">{workspace.profile.email}</p><p className="mt-1 font-mono text-xs text-slate-500">{workspace.profile.id}</p></div><div className="flex flex-wrap gap-2"><span className={`rounded-lg border px-3 py-2 text-xs ${workspace.profile.is_promoted ? 'border-amber-400/30 text-amber-200' : 'border-cyan-400/30 text-cyan-200'}`}>{workspace.profile.is_promoted ? 'Retention client' : 'Sales lead'}</span><button onClick={() => void openClient(workspace.profile.id)} disabled={!!openingClientId} className="flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold hover:bg-violet-500 disabled:opacity-50">{openingClientId ? <Loader2 size={15} className="animate-spin" /> : <ExternalLink size={15} />}Open dashboard</button></div></div></section>
        {role === 'workflow_manager' && !workspace.profile.is_promoted && <section className={`${panel} p-5`}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">Sales controls</h3><p className="mt-1 text-xs text-slate-400">Add or correct a deposit, or promote this lead. Promotion immediately removes the complete Sales hierarchy's access.</p></div><button type="button" onClick={() => void promote()} disabled={!!busy} className="rounded-lg border border-amber-400/30 px-3 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-400/10 disabled:opacity-50">Promote to Retention</button></div><form onSubmit={saveDeposit} className="mt-4 grid gap-3 md:grid-cols-[140px_1fr_1fr_1fr_auto]"><AppSelect value={deposit.currency} onChange={event => setDeposit(value => ({ ...value, currency: event.target.value }))} className={input}><option>EUR</option><option>USD</option></AppSelect><input value={deposit.amount} onChange={event => setDeposit(value => ({ ...value, amount: event.target.value }))} placeholder="Amount" inputMode="decimal" className={input} /><input value={deposit.reference} onChange={event => setDeposit(value => ({ ...value, reference: event.target.value }))} placeholder="Reference (optional)" className={input} /><input value={deposit.reason} onChange={event => setDeposit(value => ({ ...value, reason: event.target.value }))} placeholder="Audit reason" className={input} /><button disabled={!!busy} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50">{editingDepositId ? 'Save correction' : 'Add deposit'}</button></form>{editingDepositId && <button type="button" onClick={() => { setEditingDepositId(''); setDeposit({ amount: '', currency: 'EUR', reference: '', reason: 'CRM lead deposit' }); }} className="mt-2 text-xs text-slate-400 hover:text-white">Cancel correction</button>}<div className="mt-4 space-y-2">{workspace.transactions.filter(row => row.type === 'deposit' && row.status === 'completed' && String(row.description || '').startsWith('Workflow Manager deposit')).map(row => <div key={String(row.id)} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.08] px-3 py-2 text-xs"><span>{String(row.currency || 'EUR')} {Number(row.amount || 0).toFixed(2)} · {new Date(String(row.created_at)).toLocaleString()}</span><button type="button" onClick={() => { setEditingDepositId(String(row.id)); setDeposit({ amount: String(row.amount || ''), currency: String(row.currency || 'EUR'), reference: '', reason: 'Correct CRM lead deposit' }); }} className="font-semibold text-violet-300 hover:text-violet-200">Correct deposit</button></div>)}</div></section>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[["EUR cash", formatEur(convertUsdToEur(Number(workspace.balance.usdt_balance || 0))), Wallet], ["USD cash", new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(workspace.balance.usd_balance || 0)), Wallet], ["BTC holdings", Number(workspace.balance.btc_balance || 0).toFixed(6), Wallet], ["Open positions", workspace.positions.length, TrendingUp], ["Robot", workspace.robot.is_active ? 'Active' : 'Inactive', Bot]].map(([label, value, Icon]) => { const CardIcon = Icon as typeof Wallet; return <div key={String(label)} className={`${panel} p-4`}><div className="flex items-center gap-2 text-xs text-slate-400"><CardIcon size={15} />{String(label)}</div><div className="mt-2 truncate font-mono text-lg font-semibold">{String(value)}</div></div>; })}</div>
        <div className="grid gap-5 2xl:grid-cols-2"><DataTable title="Assets" rows={workspace.assets || []} columns={['asset_symbol', 'balance']} /><DataTable title="Recent transactions" rows={workspace.transactions || []} columns={['type', 'amount', 'currency', 'status', 'created_at']} /><DataTable title="Positions" rows={workspace.positions || []} columns={['symbol', 'side', 'status', 'created_at']} /><DataTable title="Orders" rows={workspace.orders || []} columns={['symbol', 'side', 'status', 'created_at']} /><DataTable title="Staking" rows={workspace.stakes || []} columns={['asset_symbol', 'staked_amount', 'status', 'created_at']} /><DataTable title="Deposits" rows={workspace.deposits || []} columns={['amount', 'status', 'created_at']} /></div>
      </>}</main></div>
  </div></div>;
}
