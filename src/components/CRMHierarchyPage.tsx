import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, RefreshCw, Search, ShieldCheck, Users } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

type CRMRole = 'client' | 'agent' | 'retention' | 'admin';

interface Person {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: CRMRole;
}

interface Hierarchy {
  people: Person[];
  agent_assignments: { agent_id: string; retention_id: string }[];
  client_assignments: { client_id: string; agent_id: string }[];
  retention_client_assignments: { client_id: string; retention_id: string }[];
}

const emptyHierarchy: Hierarchy = { people: [], agent_assignments: [], client_assignments: [], retention_client_assignments: [] };
const panel = 'rounded-xl border border-white/[0.1] bg-[#151b26]';
const selectClass = 'rounded-lg border border-white/[0.13] bg-[#0f1520] px-3 py-2 text-sm text-slate-200 outline-none focus:border-violet-400 disabled:opacity-50';
const nameOf = (person: Person) => `${person.first_name || ''} ${person.last_name || ''}`.trim() || person.email;

export default function CRMHierarchyPage() {
  const navigate = useNavigate();
  const [hierarchy, setHierarchy] = useState<Hierarchy>(emptyHierarchy);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [setupRole, setSetupRole] = useState<'agent' | 'retention' | null>(null);
  const [staffCandidateId, setStaffCandidateId] = useState('');
  const [staffManagerId, setStaffManagerId] = useState('');

  const refresh = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    const { data, error: requestError } = await supabase.rpc('crm_admin_get_hierarchy');
    if (requestError) {
      setError(requestError.message);
      setHierarchy(emptyHierarchy);
      setLoading(false);
      return false;
    } else {
      setHierarchy((data as Hierarchy) || emptyHierarchy);
      setError(null);
    }
    setLoading(false);
    return true;
  }, []);

  useEffect(() => {
    void refresh();
    void supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || ''));
  }, [refresh]);

  const run = async (key: string, action: () => Promise<{ error: { message: string } | null }>, success: string): Promise<boolean> => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      if (result.error) throw new Error(result.error.message);
      if (!await refresh()) return false;
      setNotice(success);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The hierarchy update failed');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const changeRole = (person: Person, role: CRMRole) => {
    if (role === 'admin' && !window.confirm(`Give ${person.email} full administrator access?`)) return;
    void run(`role-${person.id}`, async () => {
      const { error } = await supabase.rpc('crm_admin_set_role', { p_user_id: person.id, p_role: role });
      return { error };
    }, `${nameOf(person)} is now ${role}.`);
  };

  const retention = hierarchy.people.filter(person => person.role === 'retention');
  const agents = hierarchy.people.filter(person => person.role === 'agent');
  const clients = hierarchy.people.filter(person => person.role === 'client');
  const agentManager = new Map(hierarchy.agent_assignments.map(item => [item.agent_id, item.retention_id]));
  const clientAgent = new Map(hierarchy.client_assignments.map(item => [item.client_id, item.agent_id]));
  const clientRetention = new Map(hierarchy.retention_client_assignments.map(item => [item.client_id, item.retention_id]));
  const visiblePeople = useMemo(() => hierarchy.people.filter(person =>
    `${nameOf(person)} ${person.email} ${person.id}`.toLowerCase().includes(search.toLowerCase().trim())
  ), [hierarchy.people, search]);

  const openStaffSetup = (role: 'agent' | 'retention') => {
    setSetupRole(role);
    setStaffCandidateId('');
    setStaffManagerId('');
  };

  const createStaffRole = () => {
    const candidate = clients.find(person => person.id === staffCandidateId);
    if (!candidate || !setupRole) return;
    const role = setupRole;
    void run(`setup-${candidate.id}`, async () => {
      const { error } = role === 'agent'
        ? await supabase.rpc('crm_admin_promote_agent', { p_user_id: candidate.id, p_retention_id: staffManagerId || null })
        : await supabase.rpc('crm_admin_set_role', { p_user_id: candidate.id, p_role: 'retention' });
      return { error };
    }, `${nameOf(candidate)} is now ${role}.`).then(success => {
      if (success) setSetupRole(null);
    });
  };

  const assignClientOwner = (client: Person, value: string) => {
    const [ownerRole, ownerId] = value ? value.split(':') : ['unassigned', ''];
    void run(`client-${client.id}`, async () => {
      const { error } = await supabase.rpc('crm_admin_set_client_owner', {
        p_client_id: client.id,
        p_owner_role: ownerRole,
        p_owner_id: ownerId || null
      });
      return { error };
    }, 'Client assignment updated.');
  };

  return (
    <div className="min-h-screen bg-[#0d1118] px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1700px]">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.09] pb-5">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/admin')} className="rounded-lg border border-white/[0.12] p-2.5 text-slate-300 hover:text-white" aria-label="Back to CRM"><ArrowLeft size={19} /></button>
            <div className="rounded-lg bg-violet-500/15 p-2.5 text-violet-300"><ShieldCheck size={21} /></div>
            <div><h1 className="text-2xl font-bold">CRM hierarchy</h1><p className="text-sm text-slate-400">Assign clients to agents and agents to retention.</p></div>
          </div>
          <button onClick={() => void refresh()} disabled={loading || busy !== null} className="flex items-center gap-2 rounded-lg border border-white/[0.12] px-3 py-2 text-sm text-slate-300 hover:text-white disabled:opacity-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</button>
        </div>

        {error && <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
        {notice && <div role="status" className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{notice}</div>}

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          {[["Retention", retention.length], ["Agents", agents.length], ["Clients", clients.length]].map(([label, count]) => (
            <div key={label} className={`${panel} p-4`}><div className="text-xs uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 text-2xl font-bold">{count}</div></div>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <section className={`${panel} min-w-0 overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] p-4">
              <div><h2 className="font-semibold">Accounts and roles</h2><p className="text-xs text-slate-400">Only administrators can change access levels.</p></div>
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search accounts" className={`${selectClass} w-60 pl-9`} /></div>
            </div>
            <div className="max-h-[680px] divide-y divide-white/[0.06] overflow-y-auto">
              {loading ? <div className="p-8 text-center text-sm text-slate-400">Loading hierarchy...</div> : visiblePeople.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">No accounts found.</div> : visiblePeople.map(person => (
                <div key={person.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0"><div className="truncate text-sm font-semibold">{nameOf(person)}</div><div className="truncate text-xs text-slate-400">{person.email}</div></div>
                  <select aria-label={`Role for ${person.email}`} value={person.role} onChange={event => changeRole(person, event.target.value as CRMRole)} disabled={busy !== null || person.id === currentUserId} className={selectClass}>
                    <option value="client">Client</option><option value="agent">Agent</option><option value="retention">Retention</option><option value="admin">Admin</option>
                  </select>
                </div>
              ))}
            </div>
          </section>

          <div className="min-w-0 space-y-5">
            <section className={`${panel} overflow-hidden`}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] p-4">
                <div><h2 className="font-semibold">Retention → agents</h2><p className="text-xs text-slate-400">Each agent can belong to one retention manager.</p></div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => openStaffSetup('retention')} disabled={busy !== null || clients.length === 0} className="flex items-center gap-1.5 rounded-lg border border-white/[0.12] px-3 py-2 text-xs font-semibold text-slate-200 hover:border-violet-400/50 disabled:opacity-50"><Plus size={14} />Add retention</button>
                  <button type="button" onClick={() => openStaffSetup('agent')} disabled={busy !== null || clients.length === 0} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"><Plus size={14} />Add agent</button>
                </div>
              </div>
              {setupRole && (
                <div className="border-b border-white/[0.08] bg-violet-500/[0.05] p-4">
                  <h3 className="text-sm font-semibold">Make an existing account {setupRole === 'agent' ? 'an agent' : 'a retention manager'}</h3>
                  <p className="mt-1 text-xs text-slate-400">Choose a client account. Any current client assignment will be removed when its role changes.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <select aria-label="Account to promote" value={staffCandidateId} onChange={event => setStaffCandidateId(event.target.value)} className={selectClass}>
                      <option value="">Select client account</option>{clients.map(client => <option key={client.id} value={client.id}>{nameOf(client)} · {client.email}</option>)}
                    </select>
                    {setupRole === 'agent' && <select aria-label="Retention manager for new agent" value={staffManagerId} onChange={event => setStaffManagerId(event.target.value)} className={selectClass}>
                      <option value="">No retention manager yet</option>{retention.map(manager => <option key={manager.id} value={manager.id}>{nameOf(manager)}</option>)}
                    </select>}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={createStaffRole} disabled={busy !== null || !staffCandidateId} className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50">Create {setupRole} role</button>
                    <button type="button" onClick={() => setSetupRole(null)} disabled={busy !== null} className="rounded-lg border border-white/[0.12] px-4 py-2 text-xs text-slate-300 hover:text-white disabled:opacity-50">Cancel</button>
                  </div>
                </div>
              )}
              <div className="max-h-[320px] divide-y divide-white/[0.06] overflow-y-auto">
                {agents.length === 0 ? <div className="p-5 text-sm text-slate-400">No agents yet. Use <span className="font-semibold text-violet-200">Add agent</span> above to promote an existing account.</div> : agents.map(agent => (
                  <div key={agent.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0"><div className="truncate text-sm font-semibold">{nameOf(agent)}</div><div className="text-xs text-slate-400">{hierarchy.client_assignments.filter(item => item.agent_id === agent.id).length} clients</div></div>
                    <select aria-label={`Retention manager for ${agent.email}`} value={agentManager.get(agent.id) || ''} disabled={busy !== null} onChange={event => void run(`agent-${agent.id}`, async () => {
                      const { error } = await supabase.rpc('crm_admin_assign_agent', { p_agent_id: agent.id, p_retention_id: event.target.value || null }); return { error };
                    }, 'Agent assignment updated.')} className={selectClass}>
                      <option value="">Unassigned</option>{retention.map(manager => <option key={manager.id} value={manager.id}>{nameOf(manager)}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </section>

            <section className={`${panel} overflow-hidden`}>
              <div className="flex items-center gap-2 border-b border-white/[0.08] p-4"><Users size={18} className="text-violet-300" /><div><h2 className="font-semibold">Client ownership</h2><p className="text-xs text-slate-400">Assign each client to an agent or directly to retention.</p></div></div>
              <div className="max-h-[420px] divide-y divide-white/[0.06] overflow-y-auto">
                {clients.length === 0 ? <div className="p-5 text-sm text-slate-400">No client accounts found.</div> : clients.map(client => (
                  <div key={client.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0"><div className="truncate text-sm font-semibold">{nameOf(client)}</div><div className="truncate text-xs text-slate-400">{client.email}</div></div>
                    <select aria-label={`Owner for ${client.email}`} value={clientAgent.has(client.id) ? `agent:${clientAgent.get(client.id)}` : clientRetention.has(client.id) ? `retention:${clientRetention.get(client.id)}` : ''} disabled={busy !== null} onChange={event => assignClientOwner(client, event.target.value)} className={selectClass}>
                      <option value="">Unassigned</option>
                      {agents.length > 0 && <optgroup label="Agents">{agents.map(agent => <option key={agent.id} value={`agent:${agent.id}`}>{nameOf(agent)}</option>)}</optgroup>}
                      {retention.length > 0 && <optgroup label="Retention only">{retention.map(manager => <option key={manager.id} value={`retention:${manager.id}`}>{nameOf(manager)}</option>)}</optgroup>}
                    </select>
                  </div>
                ))}
              </div>
              {agents.length === 0 && retention.length === 0 && <div className="border-t border-white/[0.08] p-4 text-xs text-slate-400">Add an agent or retention account above to make client assignments.</div>}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
