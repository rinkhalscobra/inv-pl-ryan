import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bot, ExternalLink, Loader2, RefreshCw, Search, ShieldCheck, TrendingUp, Users, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useFiatCurrency } from '../hooks/useFiatCurrency';
import { openClientDashboard } from '../lib/clientAccess';

type Row = Record<string, unknown>;

interface StaffClient {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  country: string | null;
  kyc_status: string;
  created_at: string;
  agent_id: string | null;
  agent_name: string | null;
  direct_retention_id: string | null;
  assignment_type: 'agent' | 'retention';
  usdt_balance: number;
  btc_balance: number;
}

interface StaffAgent {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  client_count: number;
}

interface StaffScope { role: 'agent' | 'retention'; agents: StaffAgent[]; clients: StaffClient[] }
interface ClientWorkspace {
  profile: StaffClient & { phone_number: string | null };
  balance: Row;
  robot: Row;
  assets: Row[];
  transactions: Row[];
  positions: Row[];
  orders: Row[];
  stakes: Row[];
  deposits: Row[];
}

const panel = 'rounded-xl border border-white/[0.1] bg-[#151b26]';
const nameOf = (person: { first_name: string | null; last_name: string | null; email: string }) => `${person.first_name || ''} ${person.last_name || ''}`.trim() || person.email;
const valueOf = (value: unknown) => value === null || value === undefined || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);

function DataTable({ title, rows, columns }: { title: string; rows: Row[]; columns: string[] }) {
  return <section className={`${panel} overflow-hidden`}>
    <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3"><h3 className="font-semibold">{title}</h3><span className="rounded-md bg-white/[0.05] px-2 py-1 text-xs text-slate-400">{rows.length}</span></div>
    {rows.length === 0 ? <div className="p-6 text-sm text-slate-500">No records</div> : <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-white/[0.025] text-xs uppercase text-slate-500"><tr>{columns.map(column => <th key={column} className="px-4 py-2.5">{column.replace(/_/g, ' ')}</th>)}</tr></thead><tbody className="divide-y divide-white/[0.06]">{rows.slice(0, 25).map((row, index) => <tr key={String(row.id || index)}>{columns.map(column => <td key={column} className="max-w-[220px] truncate px-4 py-3 font-mono text-xs text-slate-300">{column.endsWith('_at') && row[column] ? new Date(String(row[column])).toLocaleString() : valueOf(row[column])}</td>)}</tr>)}</tbody></table></div>}
  </section>;
}

export default function CRMStaffPage({ role }: { role: 'agent' | 'retention' }) {
  const navigate = useNavigate();
  const { formatFiat } = useFiatCurrency();
  const [scope, setScope] = useState<StaffScope>({ role, agents: [], clients: [] });
  const [workspace, setWorkspace] = useState<ClientWorkspace | null>(null);
  const [search, setSearch] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [loadingScope, setLoadingScope] = useState(true);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [openingClientId, setOpeningClientId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scopeRequest = useRef(0);
  const workspaceRequest = useRef(0);

  const loadScope = useCallback(async (query: string) => {
    const requestId = ++scopeRequest.current;
    setLoadingScope(true);
    const { data, error: requestError } = await supabase.rpc('crm_staff_get_scope', { p_search: query.trim() || null });
    if (requestId !== scopeRequest.current) return;
    if (requestError) {
      setError(requestError.message);
      setScope({ role, agents: [], clients: [] });
      setSelectedClientId('');
      setWorkspace(null);
    } else {
      const next = (data as StaffScope) || { role, agents: [], clients: [] };
      setScope(next);
      setError(null);
    }
    setLoadingScope(false);
  }, [role]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadScope(search), 250);
    return () => window.clearTimeout(timer);
  }, [loadScope, search]);

  const visibleClients = useMemo(() => scope.clients.filter(client => !selectedAgentId || (selectedAgentId === 'direct' ? client.assignment_type === 'retention' : client.agent_id === selectedAgentId)), [scope.clients, selectedAgentId]);
  useEffect(() => {
    if (selectedAgentId && selectedAgentId !== 'direct' && !scope.agents.some(agent => agent.id === selectedAgentId)) setSelectedAgentId('');
  }, [scope.agents, selectedAgentId]);
  useEffect(() => {
    setSelectedClientId(current => visibleClients.some(client => client.id === current) ? current : visibleClients[0]?.id || '');
  }, [visibleClients]);

  useEffect(() => {
    const requestId = ++workspaceRequest.current;
    setWorkspace(null);
    if (!selectedClientId) { setLoadingWorkspace(false); return; }
    setLoadingWorkspace(true);
    void supabase.rpc('crm_staff_get_client_workspace', { p_client_id: selectedClientId }).then(({ data, error: requestError }) => {
      if (requestId !== workspaceRequest.current) return;
      if (requestError) {
        setError(requestError.message);
        setWorkspace(null);
      } else {
        setError(null);
        setWorkspace((data as ClientWorkspace) || null);
      }
      setLoadingWorkspace(false);
    });
  }, [selectedClientId]);

  const selectedClient = scope.clients.find(client => client.id === selectedClientId);

  const openClient = async (clientId: string) => {
    setOpeningClientId(clientId);
    setError(null);
    try {
      await openClientDashboard(clientId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The client dashboard could not be opened.');
    } finally {
      setOpeningClientId('');
    }
  };

  return <div className="min-h-screen bg-[#0d1118] px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1700px]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.09] pb-5">
        <div className="flex items-center gap-3"><button onClick={() => navigate('/dashboard')} className="rounded-lg border border-white/[0.12] p-2.5 text-slate-300 hover:text-white" aria-label="Back to platform"><ArrowLeft size={19} /></button><div className="rounded-lg bg-violet-500/15 p-2.5 text-violet-300"><ShieldCheck size={21} /></div><div><h1 className="text-2xl font-bold">{role === 'retention' ? 'Retention workspace' : 'Agent workspace'}</h1><p className="text-sm text-slate-400">{role === 'retention' ? 'Your agents, their clients, and clients assigned directly to you' : 'Your assigned clients'}</p></div></div>
        <button onClick={() => void loadScope(search)} disabled={loadingScope} className="flex items-center gap-2 rounded-lg border border-white/[0.12] px-3 py-2 text-sm text-slate-300 hover:text-white disabled:opacity-50"><RefreshCw size={16} className={loadingScope ? 'animate-spin' : ''} />Refresh</button>
      </div>

      {error && <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      {role === 'retention' && <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <button onClick={() => setSelectedAgentId('')} className={`${panel} p-4 text-left transition hover:border-violet-400/40 ${selectedAgentId === '' ? 'border-violet-400/50' : ''}`}><div className="text-xs text-slate-400">All clients</div><div className="mt-1 text-xl font-semibold">{scope.clients.length}</div></button>
        <button onClick={() => setSelectedAgentId('direct')} className={`${panel} p-4 text-left transition hover:border-violet-400/40 ${selectedAgentId === 'direct' ? 'border-violet-400/50' : ''}`}><div className="text-xs text-slate-400">Direct clients</div><div className="mt-1 text-xl font-semibold">{scope.clients.filter(client => client.assignment_type === 'retention').length}</div></button>
        {scope.agents.map(agent => <button key={agent.id} onClick={() => setSelectedAgentId(agent.id)} className={`${panel} min-w-0 p-4 text-left transition hover:border-violet-400/40 ${selectedAgentId === agent.id ? 'border-violet-400/50' : ''}`}><div className="truncate text-sm font-semibold">{nameOf(agent)}</div><div className="truncate text-xs text-slate-400">{agent.email}</div><div className="mt-2 text-xs text-violet-300">{agent.client_count} clients</div></button>)}
      </div>}

      <div className="grid gap-5 xl:grid-cols-[310px_minmax(0,1fr)]">
        <aside className={`${panel} h-fit overflow-hidden xl:sticky xl:top-4`}>
          <div className="border-b border-white/[0.08] p-4"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold"><Users size={17} />Clients</h2><span className="text-xs text-slate-400">{visibleClients.length}</span></div><div className="relative mt-3"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search assigned clients" className="w-full rounded-lg border border-white/[0.12] bg-[#0f1520] py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-violet-400" /></div></div>
          <div className="max-h-[70vh] overflow-y-auto p-2">{loadingScope ? <div className="p-6 text-center text-sm text-slate-400">Loading clients...</div> : visibleClients.length === 0 ? <div className="p-6 text-center text-sm text-slate-400">No assigned clients found.</div> : visibleClients.map(client => <div key={client.id} className={`mb-1 flex items-center gap-1 rounded-lg border pr-1 ${selectedClientId === client.id ? 'border-violet-400/40 bg-violet-500/10' : 'border-transparent hover:bg-white/[0.04]'}`}><button type="button" onClick={() => setSelectedClientId(client.id)} className="min-w-0 flex-1 px-3 py-3 text-left"><div className="truncate text-sm font-semibold">{nameOf(client)}</div><div className="truncate text-xs text-slate-400">{client.email}</div>{role === 'retention' && <div className="mt-1 truncate text-xs text-violet-300">{client.assignment_type === 'retention' ? 'Direct retention client' : `Agent: ${client.agent_name || '—'}`}</div>}</button><button type="button" onClick={() => void openClient(client.id)} disabled={!!openingClientId} title={`Open ${nameOf(client)} dashboard in a new tab`} aria-label={`Open ${nameOf(client)} dashboard`} className="rounded-md border border-white/[0.09] p-2 text-slate-400 hover:border-violet-400/40 hover:text-violet-200 disabled:opacity-50">{openingClientId === client.id ? <Loader2 size={15} className="animate-spin" /> : <ExternalLink size={15} />}</button></div>)}</div>
        </aside>

        <main className="min-w-0 space-y-5">
          {!selectedClientId ? <div className={`${panel} flex min-h-[330px] items-center justify-center p-8 text-center text-slate-400`}>Select an assigned client to view their account.</div> : loadingWorkspace ? <div className={`${panel} flex min-h-[330px] items-center justify-center text-slate-400`}>Loading client workspace...</div> : !workspace ? <div className={`${panel} flex min-h-[330px] items-center justify-center p-8 text-center text-slate-400`}>Client workspace unavailable. Refresh to try again.</div> : <>
            <section className={`${panel} p-5`}><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-bold">{nameOf(workspace.profile)}</h2><p className="mt-1 text-sm text-slate-400">{workspace.profile.email}</p><p className="mt-1 font-mono text-xs text-slate-500">{workspace.profile.id}</p></div><div className="flex flex-wrap items-center gap-2"><div className="rounded-lg border border-white/[0.1] px-3 py-2 text-xs text-slate-300">KYC: {workspace.profile.kyc_status?.replace(/_/g, ' ') || 'unknown'}</div><button type="button" onClick={() => void openClient(workspace.profile.id)} disabled={!!openingClientId} className="flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50">{openingClientId === workspace.profile.id ? <Loader2 size={15} className="animate-spin" /> : <ExternalLink size={15} />}Open client dashboard</button></div></div><div className="mt-4 grid gap-3 border-t border-white/[0.08] pt-4 text-sm sm:grid-cols-3"><div><div className="text-xs text-slate-500">Country</div><div>{workspace.profile.country || '—'}</div></div><div><div className="text-xs text-slate-500">Phone</div><div>{workspace.profile.phone_number || '—'}</div></div><div><div className="text-xs text-slate-500">Assigned to</div><div>{selectedClient?.assignment_type === 'retention' ? 'Direct retention' : selectedClient?.agent_name || '—'}</div></div></div></section>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Cash balance", formatFiat(Number(workspace.balance.usdt_balance || 0)), Wallet], ["BTC holdings", Number(workspace.balance.btc_balance || 0).toFixed(6), Wallet], ["Open positions", workspace.positions.length, TrendingUp], ["Robot", workspace.robot.is_active ? 'Active' : 'Inactive', Bot]].map(([label, value, Icon]) => { const CardIcon = Icon as typeof Wallet; return <div key={String(label)} className={`${panel} p-4`}><div className="flex items-center gap-2 text-xs text-slate-400"><CardIcon size={15} />{String(label)}</div><div className="mt-2 truncate font-mono text-lg font-semibold">{String(value)}</div></div>; })}</div>
            <div className="grid gap-5 2xl:grid-cols-2"><DataTable title="Assets" rows={workspace.assets || []} columns={['asset_symbol', 'balance']} /><DataTable title="Recent transactions" rows={workspace.transactions || []} columns={['type', 'amount', 'status', 'created_at']} /><DataTable title="Positions" rows={workspace.positions || []} columns={['symbol', 'side', 'status', 'created_at']} /><DataTable title="Orders" rows={workspace.orders || []} columns={['symbol', 'side', 'status', 'created_at']} /><DataTable title="Staking" rows={workspace.stakes || []} columns={['asset_symbol', 'staked_amount', 'status', 'created_at']} /><DataTable title="Deposits" rows={workspace.deposits || []} columns={['amount', 'status', 'created_at']} /></div>
          </>}
        </main>
      </div>
    </div>
  </div>;
}
