import AppSelect from './AppSelect';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, RefreshCw, Search, ShieldCheck, UserPlus, Users, X } from 'lucide-react';
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
const fieldClass = `${selectClass} w-full`;
const nameOf = (person: Person) => `${person.first_name || ''} ${person.last_name || ''}`.trim() || person.email;
const emptyNewUser = { email: '', firstName: '', lastName: '', country: '', password: '', confirmPassword: '', role: 'client' as CRMRole, owner: '' };

export default function CRMHierarchyPage() {
  const navigate = useNavigate();
  const [hierarchy, setHierarchy] = useState<Hierarchy>(emptyHierarchy);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [setupRole, setSetupRole] = useState<'agent' | 'retention' | null>(null);
  const [staffCandidateId, setStaffCandidateId] = useState('');
  const [staffManagerId, setStaffManagerId] = useState('');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState(emptyNewUser);
  const [createError, setCreateError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'clients' | 'teams'>('clients');

  const closeCreateUser = () => {
    setShowCreateUser(false);
    setCreateError(null);
    setNewUser(emptyNewUser);
  };

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
  const assignedClientIds = new Set([...clientAgent.keys(), ...clientRetention.keys()]);
  const unassignedClients = clients.filter(client => !assignedClientIds.has(client.id));
  const visibleUnassignedClients = unassignedClients.filter(person =>
    `${nameOf(person)} ${person.email} ${person.id}`.toLowerCase().includes(search.toLowerCase().trim())
  );
  const ownerValueOf = (client: Person) => clientAgent.has(client.id)
    ? `agent:${clientAgent.get(client.id)}`
    : clientRetention.has(client.id) ? `retention:${clientRetention.get(client.id)}` : '';
  const clientsForAgent = (agentId: string) => clients.filter(client => clientAgent.get(client.id) === agentId);
  const directClientsForRetention = (retentionId: string) => clients.filter(client => clientRetention.get(client.id) === retentionId);

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

  const createUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError(null);
    const email = newUser.email.trim().toLowerCase();
    if (!email || !newUser.firstName.trim() || !newUser.lastName.trim()) {
      setCreateError('Email, first name and last name are required.');
      return;
    }
    if (newUser.password.length < 8 || newUser.password.length > 128) {
      setCreateError('Password must contain 8 to 128 characters.');
      return;
    }
    if (newUser.password !== newUser.confirmPassword) {
      setCreateError('Passwords do not match.');
      return;
    }
    if (newUser.role === 'admin' && !window.confirm(`Create ${email} with full administrator access?`)) return;

    setBusy('create-user');
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) throw new Error('Administrator session expired. Sign in again.');
      const [ownerRole, ownerId] = newUser.owner ? newUser.owner.split(':') : [null, null];
      const { data, error: requestError } = await supabase.functions.invoke('admin-user-management', {
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
        body: {
          action: 'create_user',
          email,
          first_name: newUser.firstName.trim(),
          last_name: newUser.lastName.trim(),
          country: newUser.country.trim(),
          password: newUser.password,
          role: newUser.role,
          owner_role: ownerRole,
          owner_id: ownerId
        }
      });
      if (requestError) {
        let detail = requestError.message;
        const response = (requestError as { context?: Response }).context;
        if (response instanceof Response) {
          const payload = await response.clone().json().catch(() => null) as { error?: string } | null;
          detail = payload?.error || detail;
        }
        throw new Error(detail);
      }
      const payload = data as { error?: string; user_id?: string } | null;
      if (payload?.error) throw new Error(payload.error);
      if (!payload?.user_id) throw new Error('The server did not confirm account creation. Refresh the list before trying again.');
      closeCreateUser();
      setNotice(`${email} was created as ${newUser.role}. The account can sign in with the password you set.`);
      await refresh();
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : 'Account creation failed.');
    } finally {
      setBusy(null);
    }
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
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setCreateError(null); setNewUser(emptyNewUser); setShowCreateUser(true); }} disabled={busy !== null} className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"><UserPlus size={16} />Create user</button>
            <button onClick={() => void refresh()} disabled={loading || busy !== null} className="flex items-center gap-2 rounded-lg border border-white/[0.12] px-3 py-2 text-sm text-slate-300 hover:text-white disabled:opacity-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</button>
          </div>
        </div>

        {showCreateUser && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={event => { if (event.target === event.currentTarget && busy === null) closeCreateUser(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="create-user-title" className="w-full max-w-xl rounded-2xl border border-white/[0.13] bg-[#171e2b] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.09] p-5">
              <div><h2 id="create-user-title" className="text-lg font-semibold">Create account</h2><p className="mt-1 text-sm text-slate-400">Set login details, access level and CRM ownership.</p></div>
              <button type="button" aria-label="Close" onClick={closeCreateUser} disabled={busy !== null} className="rounded-lg p-1 text-slate-400 hover:text-white disabled:opacity-50"><X size={19} /></button>
            </div>
            <form onSubmit={createUser} className="max-h-[min(75vh,740px)] space-y-4 overflow-y-auto p-5">
              {createError && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{createError}</div>}
              <label className="block text-xs font-medium text-slate-300">Email address<input autoFocus type="email" required maxLength={254} autoComplete="off" value={newUser.email} onChange={event => setNewUser(value => ({ ...value, email: event.target.value }))} className={`mt-1 ${fieldClass}`} placeholder="name@example.com" /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-300">First name<input required maxLength={100} value={newUser.firstName} onChange={event => setNewUser(value => ({ ...value, firstName: event.target.value }))} className={`mt-1 ${fieldClass}`} /></label>
                <label className="block text-xs font-medium text-slate-300">Last name<input required maxLength={100} value={newUser.lastName} onChange={event => setNewUser(value => ({ ...value, lastName: event.target.value }))} className={`mt-1 ${fieldClass}`} /></label>
              </div>
              <label className="block text-xs font-medium text-slate-300">Country <span className="text-slate-500">(optional)</span><input maxLength={100} value={newUser.country} onChange={event => setNewUser(value => ({ ...value, country: event.target.value }))} className={`mt-1 ${fieldClass}`} /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-300">Initial password<input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={newUser.password} onChange={event => setNewUser(value => ({ ...value, password: event.target.value }))} className={`mt-1 ${fieldClass}`} /></label>
                <label className="block text-xs font-medium text-slate-300">Confirm password<input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={newUser.confirmPassword} onChange={event => setNewUser(value => ({ ...value, confirmPassword: event.target.value }))} className={`mt-1 ${fieldClass}`} /></label>
              </div>
              <label className="block text-xs font-medium text-slate-300">Account role<AppSelect value={newUser.role} onChange={event => setNewUser(value => ({ ...value, role: event.target.value as CRMRole, owner: '' }))} className={`mt-1 ${fieldClass}`}><option value="client">Client</option><option value="agent">Agent</option><option value="retention">Retention</option><option value="admin">Administrator</option></AppSelect></label>
              {newUser.role === 'client' && <label className="block text-xs font-medium text-slate-300">Client owner <span className="text-slate-500">(optional)</span><AppSelect value={newUser.owner} onChange={event => setNewUser(value => ({ ...value, owner: event.target.value }))} className={`mt-1 ${fieldClass}`}><option value="">Unassigned</option>{agents.length > 0 && <optgroup label="Agents">{agents.map(agent => <option key={agent.id} value={`agent:${agent.id}`}>{nameOf(agent)} · {agent.email}</option>)}</optgroup>}{retention.length > 0 && <optgroup label="Direct retention">{retention.map(manager => <option key={manager.id} value={`retention:${manager.id}`}>{nameOf(manager)} · {manager.email}</option>)}</optgroup>}</AppSelect></label>}
              {newUser.role === 'agent' && <label className="block text-xs font-medium text-slate-300">Retention manager <span className="text-slate-500">(optional)</span><AppSelect value={newUser.owner} onChange={event => setNewUser(value => ({ ...value, owner: event.target.value }))} className={`mt-1 ${fieldClass}`}><option value="">Unassigned</option>{retention.map(manager => <option key={manager.id} value={`retention:${manager.id}`}>{nameOf(manager)} · {manager.email}</option>)}</AppSelect></label>}
              <p className="text-xs text-slate-400">The email is confirmed at creation so this account can sign in immediately. Share the initial password securely.</p>
              <div className="flex justify-end gap-2 border-t border-white/[0.09] pt-4"><button type="button" onClick={closeCreateUser} disabled={busy !== null} className="rounded-lg border border-white/[0.12] px-4 py-2 text-sm text-slate-300 disabled:opacity-50">Cancel</button><button type="submit" disabled={busy !== null} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">{busy === 'create-user' ? 'Creating account...' : 'Create account'}</button></div>
            </form>
          </section>
        </div>}

        {error && <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
        {notice && <div role="status" className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{notice}</div>}

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          {[["Retention", retention.length], ["Agents", agents.length], ["Clients", clients.length]].map(([label, count]) => (
            <div key={label} className={`${panel} p-4`}><div className="text-xs uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 text-2xl font-bold">{count}</div></div>
          ))}
        </div>

        <div className={`${panel} mb-5 flex flex-wrap items-center gap-2 p-2`} role="tablist" aria-label="Hierarchy sections">
          <button type="button" role="tab" aria-selected={activeSection === 'clients'} onClick={() => setActiveSection('clients')} className={`flex min-w-[220px] flex-1 items-center justify-between rounded-lg px-4 py-3 text-left transition ${activeSection === 'clients' ? 'bg-violet-600 text-white shadow-lg shadow-violet-950/30' : 'text-slate-300 hover:bg-white/[0.05]'}`}>
            <span><span className="block text-sm font-semibold">Unassigned clients</span><span className={`mt-0.5 block text-xs ${activeSection === 'clients' ? 'text-violet-100' : 'text-slate-500'}`}>Classify accounts and assign ownership</span></span>
            <span className="rounded-full bg-black/20 px-2.5 py-1 text-xs font-bold">{unassignedClients.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={activeSection === 'teams'} onClick={() => setActiveSection('teams')} className={`flex min-w-[220px] flex-1 items-center justify-between rounded-lg px-4 py-3 text-left transition ${activeSection === 'teams' ? 'bg-violet-600 text-white shadow-lg shadow-violet-950/30' : 'text-slate-300 hover:bg-white/[0.05]'}`}>
            <span><span className="block text-sm font-semibold">Managed teams</span><span className={`mt-0.5 block text-xs ${activeSection === 'teams' ? 'text-violet-100' : 'text-slate-500'}`}>Retention, agents and assigned clients</span></span>
            <span className="rounded-full bg-black/20 px-2.5 py-1 text-xs font-bold">{retention.length + agents.length}</span>
          </button>
        </div>

        {activeSection === 'clients' && (
          <section className={`${panel} min-w-0 overflow-hidden`} role="tabpanel">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] p-5">
              <div className="flex items-center gap-3"><div className="rounded-lg bg-sky-500/10 p-2.5 text-sky-300"><Users size={19} /></div><div><h2 className="font-semibold">Unassigned client accounts</h2><p className="mt-0.5 text-xs text-slate-400">Accounts without a staff role are clients by default. Change their role or assign them to an owner.</p></div></div>
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search unassigned clients" className={`${selectClass} w-64 pl-9`} /></div>
            </div>
            <div className="hidden grid-cols-[minmax(220px,1fr)_150px_minmax(240px,320px)] gap-4 border-b border-white/[0.06] bg-black/10 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 md:grid">
              <span>Client account</span><span>Access level</span><span>Ownership</span>
            </div>
            <div className="max-h-[680px] divide-y divide-white/[0.06] overflow-y-auto">
              {loading ? <div className="p-10 text-center text-sm text-slate-400">Loading client accounts...</div> : visibleUnassignedClients.length === 0 ? (
                <div className="p-10 text-center"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300"><ShieldCheck size={20} /></div><p className="mt-3 text-sm font-semibold text-slate-200">No unassigned clients</p><p className="mt-1 text-xs text-slate-500">Every client currently has an owner, or no account matches this search.</p></div>
              ) : visibleUnassignedClients.map(client => (
                <div key={client.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(220px,1fr)_150px_minmax(240px,320px)] md:items-center md:gap-4">
                  <div className="min-w-0"><div className="truncate text-sm font-semibold">{nameOf(client)}</div><div className="truncate text-xs text-slate-400">{client.email}</div><div className="mt-1 truncate font-mono text-[10px] text-slate-600">{client.id}</div></div>
                  <AppSelect aria-label={`Role for ${client.email}`} value="client" onChange={event => changeRole(client, event.target.value as CRMRole)} disabled={busy !== null} className={selectClass}>
                    <option value="client">Client</option><option value="agent">Agent</option><option value="retention">Retention</option><option value="admin">Admin</option>
                  </AppSelect>
                  <AppSelect aria-label={`Owner for ${client.email}`} value="" disabled={busy !== null} onChange={event => assignClientOwner(client, event.target.value)} className={selectClass}>
                    <option value="">Select an owner</option>
                    {agents.length > 0 && <optgroup label="Agents">{agents.map(agent => <option key={agent.id} value={`agent:${agent.id}`}>{nameOf(agent)}</option>)}</optgroup>}
                    {retention.length > 0 && <optgroup label="Direct retention">{retention.map(manager => <option key={manager.id} value={`retention:${manager.id}`}>{nameOf(manager)}</option>)}</optgroup>}
                  </AppSelect>
                </div>
              ))}
            </div>
            {unassignedClients.length > 0 && agents.length === 0 && retention.length === 0 && <div className="border-t border-amber-400/20 bg-amber-400/[0.06] px-5 py-3 text-xs text-amber-200">Create an agent or retention manager before assigning client ownership.</div>}
          </section>
        )}

        {activeSection === 'teams' && (
          <div className="space-y-5" role="tabpanel">
            <section className={`${panel} overflow-hidden`}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] p-5">
                <div><h2 className="font-semibold">Team administration</h2><p className="mt-0.5 text-xs text-slate-400">Create staff roles and place each agent under one retention manager.</p></div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => openStaffSetup('retention')} disabled={busy !== null || clients.length === 0} className="flex items-center gap-1.5 rounded-lg border border-white/[0.12] px-3 py-2 text-xs font-semibold text-slate-200 hover:border-violet-400/50 disabled:opacity-50"><Plus size={14} />Add retention</button>
                  <button type="button" onClick={() => openStaffSetup('agent')} disabled={busy !== null || clients.length === 0} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"><Plus size={14} />Add agent</button>
                </div>
              </div>
              {setupRole && (
                <div className="border-b border-white/[0.08] bg-violet-500/[0.05] p-4">
                  <h3 className="text-sm font-semibold">Make an existing client {setupRole === 'agent' ? 'an agent' : 'a retention manager'}</h3>
                  <p className="mt-1 text-xs text-slate-400">The client assignment is cleared when the access role changes.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <AppSelect aria-label="Account to promote" value={staffCandidateId} onChange={event => setStaffCandidateId(event.target.value)} className={selectClass}>
                      <option value="">Select client account</option>{clients.map(client => <option key={client.id} value={client.id}>{nameOf(client)} · {client.email}</option>)}
                    </AppSelect>
                    {setupRole === 'agent' && <AppSelect aria-label="Retention manager for new agent" value={staffManagerId} onChange={event => setStaffManagerId(event.target.value)} className={selectClass}>
                      <option value="">No retention manager yet</option>{retention.map(manager => <option key={manager.id} value={manager.id}>{nameOf(manager)}</option>)}
                    </AppSelect>}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={createStaffRole} disabled={busy !== null || !staffCandidateId} className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50">Create {setupRole} role</button>
                    <button type="button" onClick={() => setSetupRole(null)} disabled={busy !== null} className="rounded-lg border border-white/[0.12] px-4 py-2 text-xs text-slate-300 hover:text-white disabled:opacity-50">Cancel</button>
                  </div>
                </div>
              )}
            </section>

            {loading ? <div className={`${panel} p-10 text-center text-sm text-slate-400`}>Loading managed teams...</div> : retention.length === 0 && agents.length === 0 ? (
              <div className={`${panel} p-10 text-center`}><Users size={24} className="mx-auto text-slate-500" /><p className="mt-3 text-sm font-semibold">No managed teams yet</p><p className="mt-1 text-xs text-slate-500">Promote an existing client to create your first retention or agent account.</p></div>
            ) : (
              <div className="grid items-start gap-5 xl:grid-cols-2">
                {retention.map(manager => {
                  const managerAgents = agents.filter(agent => agentManager.get(agent.id) === manager.id);
                  const directClients = directClientsForRetention(manager.id);
                  const teamClientCount = directClients.length + managerAgents.reduce((total, agent) => total + clientsForAgent(agent.id).length, 0);
                  return (
                    <section key={manager.id} className={`${panel} overflow-hidden`}>
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-violet-500/[0.04] p-4">
                        <div className="min-w-0"><div className="flex items-center gap-2"><span className="rounded-md bg-violet-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-300">Retention</span><h3 className="truncate font-semibold">{nameOf(manager)}</h3></div><p className="mt-1 truncate text-xs text-slate-400">{manager.email}</p></div>
                        <div className="flex flex-wrap items-center gap-2 text-center"><div className="rounded-lg bg-black/20 px-3 py-2"><div className="text-sm font-bold">{managerAgents.length}</div><div className="text-[10px] uppercase text-slate-500">Agents</div></div><div className="rounded-lg bg-black/20 px-3 py-2"><div className="text-sm font-bold">{teamClientCount}</div><div className="text-[10px] uppercase text-slate-500">Clients</div></div><AppSelect aria-label={`Role for ${manager.email}`} value="retention" onChange={event => changeRole(manager, event.target.value as CRMRole)} disabled={busy !== null} className={selectClass}><option value="client">Client</option><option value="agent">Agent</option><option value="retention">Retention</option><option value="admin">Admin</option></AppSelect></div>
                      </div>
                      <div className="p-4">
                        {directClients.length > 0 && <div className="mb-4"><div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Direct clients</div><div className="space-y-2">{directClients.map(client => (
                          <div key={client.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.07] bg-[#101620] px-3 py-2.5"><div className="min-w-0"><div className="truncate text-sm font-medium">{nameOf(client)}</div><div className="truncate text-[11px] text-slate-500">{client.email}</div></div><AppSelect aria-label={`Owner for ${client.email}`} value={ownerValueOf(client)} disabled={busy !== null} onChange={event => assignClientOwner(client, event.target.value)} className={selectClass}><option value="">Unassigned</option><optgroup label="Agents">{agents.map(agent => <option key={agent.id} value={`agent:${agent.id}`}>{nameOf(agent)}</option>)}</optgroup><optgroup label="Direct retention">{retention.map(item => <option key={item.id} value={`retention:${item.id}`}>{nameOf(item)}</option>)}</optgroup></AppSelect></div>
                        ))}</div></div>}
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Assigned agents</div>
                        {managerAgents.length === 0 ? <p className="mt-2 rounded-lg border border-dashed border-white/[0.09] p-4 text-center text-xs text-slate-500">No agents assigned to this retention manager.</p> : <div className="mt-2 space-y-3">{managerAgents.map(agent => {
                          const agentClients = clientsForAgent(agent.id);
                          return <div key={agent.id} className="rounded-lg border border-white/[0.08] bg-[#101620]">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-3 py-3"><div className="min-w-0"><div className="flex items-center gap-2"><span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-sky-300">Agent</span><span className="truncate text-sm font-semibold">{nameOf(agent)}</span></div><div className="mt-1 truncate text-[11px] text-slate-500">{agent.email} · {agentClients.length} clients</div></div><div className="flex flex-wrap gap-2"><AppSelect aria-label={`Role for ${agent.email}`} value="agent" onChange={event => changeRole(agent, event.target.value as CRMRole)} disabled={busy !== null} className={selectClass}><option value="client">Client</option><option value="agent">Agent</option><option value="retention">Retention</option><option value="admin">Admin</option></AppSelect><AppSelect aria-label={`Retention manager for ${agent.email}`} value={manager.id} disabled={busy !== null} onChange={event => void run(`agent-${agent.id}`, async () => { const { error } = await supabase.rpc('crm_admin_assign_agent', { p_agent_id: agent.id, p_retention_id: event.target.value || null }); return { error }; }, 'Agent assignment updated.')} className={selectClass}><option value="">Unassigned</option>{retention.map(item => <option key={item.id} value={item.id}>{nameOf(item)}</option>)}</AppSelect></div></div>
                            {agentClients.length > 0 && <div className="divide-y divide-white/[0.05]">{agentClients.map(client => <div key={client.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"><div className="min-w-0"><div className="truncate text-xs font-medium text-slate-300">{nameOf(client)}</div><div className="truncate text-[10px] text-slate-600">{client.email}</div></div><AppSelect aria-label={`Owner for ${client.email}`} value={ownerValueOf(client)} disabled={busy !== null} onChange={event => assignClientOwner(client, event.target.value)} className={selectClass}><option value="">Unassigned</option><optgroup label="Agents">{agents.map(item => <option key={item.id} value={`agent:${item.id}`}>{nameOf(item)}</option>)}</optgroup><optgroup label="Direct retention">{retention.map(item => <option key={item.id} value={`retention:${item.id}`}>{nameOf(item)}</option>)}</optgroup></AppSelect></div>)}</div>}
                          </div>;
                        })}</div>}
                      </div>
                    </section>
                  );
                })}

                {agents.filter(agent => !agentManager.has(agent.id)).length > 0 && <section className={`${panel} overflow-hidden`}>
                  <div className="border-b border-amber-400/15 bg-amber-400/[0.04] p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Unassigned agents</h3><p className="mt-1 text-xs text-slate-400">Place these agents under a retention manager.</p></div><span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-xs font-bold text-amber-300">{agents.filter(agent => !agentManager.has(agent.id)).length}</span></div></div>
                  <div className="divide-y divide-white/[0.06]">{agents.filter(agent => !agentManager.has(agent.id)).map(agent => {
                    const agentClients = clientsForAgent(agent.id);
                    return <div key={agent.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-semibold">{nameOf(agent)}</div><div className="truncate text-xs text-slate-500">{agent.email} · {agentClients.length} clients</div></div><div className="flex flex-wrap gap-2"><AppSelect aria-label={`Role for ${agent.email}`} value="agent" onChange={event => changeRole(agent, event.target.value as CRMRole)} disabled={busy !== null} className={selectClass}><option value="client">Client</option><option value="agent">Agent</option><option value="retention">Retention</option><option value="admin">Admin</option></AppSelect><AppSelect aria-label={`Retention manager for ${agent.email}`} value="" disabled={busy !== null} onChange={event => void run(`agent-${agent.id}`, async () => { const { error } = await supabase.rpc('crm_admin_assign_agent', { p_agent_id: agent.id, p_retention_id: event.target.value || null }); return { error }; }, 'Agent assignment updated.')} className={selectClass}><option value="">Select retention</option>{retention.map(item => <option key={item.id} value={item.id}>{nameOf(item)}</option>)}</AppSelect></div></div>{agentClients.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{agentClients.map(client => <span key={client.id} className="rounded-md border border-white/[0.07] bg-black/10 px-2 py-1 text-[11px] text-slate-400">{nameOf(client)}</span>)}</div>}</div>;
                  })}</div>
                </section>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
