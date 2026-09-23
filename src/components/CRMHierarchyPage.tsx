import AppSelect from './AppSelect';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ChevronDown, ExternalLink, Loader2, Plus, RefreshCw, Search, ShieldCheck, UserCog, UserPlus, Users, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { openClientDashboard } from '../lib/clientAccess';

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
  const [activeSection, setActiveSection] = useState<'clients' | 'teams'>('teams');
  const [openingClientId, setOpeningClientId] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const [expandedAgentIds, setExpandedAgentIds] = useState<string[]>([]);
  const [expandedManagerIds, setExpandedManagerIds] = useState<string[]>([]);

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
    if (role === person.role) return;
    if (role === 'admin' && !window.confirm(`Give ${person.email} full administrator access?`)) return;
    if (role !== 'admin' && (person.role === 'agent' || person.role === 'retention') && !window.confirm(`Change ${person.email} from ${person.role} to ${role}? Their current team and client assignments will be removed.`)) return;
    void run(`role-${person.id}`, async () => {
      const { error } = await supabase.rpc('crm_admin_set_role', { p_user_id: person.id, p_role: role });
      return { error };
    }, `${nameOf(person)} is now ${role}.`);
  };

  const retention = hierarchy.people.filter(person => person.role === 'retention');
  const agents = hierarchy.people.filter(person => person.role === 'agent');
  const admins = hierarchy.people.filter(person => person.role === 'admin');
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
  const unassignedAgents = agents.filter(agent => !agentManager.has(agent.id));
  const normalizedTeamSearch = teamSearch.trim().toLowerCase();
  const personMatchesTeamSearch = (person: Person) => !normalizedTeamSearch || `${nameOf(person)} ${person.email} ${person.id}`.toLowerCase().includes(normalizedTeamSearch);
  const agentContainsSearch = (agent: Person) => personMatchesTeamSearch(agent) || clientsForAgent(agent.id).some(personMatchesTeamSearch);
  const managerContainsSearch = (manager: Person) => personMatchesTeamSearch(manager)
    || directClientsForRetention(manager.id).some(personMatchesTeamSearch)
    || agents.filter(agent => agentManager.get(agent.id) === manager.id).some(agentContainsSearch);
  const visibleUnassignedAgents = unassignedAgents.filter(agentContainsSearch);
  const visibleRetention = retention.filter(managerContainsSearch);
  const visibleAdmins = admins.filter(personMatchesTeamSearch);

  const openAccountDetails = (person: Person) => navigate(`/admin/accounts/${person.id}`);

  const toggleExpanded = (id: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  };

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

  const openClient = async (client: Person) => {
    setOpeningClientId(client.id);
    setError(null);
    try {
      await openClientDashboard(client.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The client dashboard could not be opened.');
    } finally {
      setOpeningClientId('');
    }
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

  const renderAssignedClient = (client: Person) => (
    <div key={client.id} className="grid gap-3 border-t border-white/[0.06] px-4 py-3 first:border-t-0 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,300px)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-slate-200">{nameOf(client)}</div>
        <div className="truncate text-xs text-slate-500">{client.email}</div>
      </div>
      <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Assigned owner
        <AppSelect aria-label={`Owner for ${client.email}`} value={ownerValueOf(client)} disabled={busy !== null} onChange={event => assignClientOwner(client, event.target.value)} className={`${selectClass} mt-1 w-full`}>
          <option value="">Unassigned</option>
          {agents.length > 0 && <optgroup label="Agents">{agents.map(item => <option key={item.id} value={`agent:${item.id}`}>{nameOf(item)}</option>)}</optgroup>}
          {retention.length > 0 && <optgroup label="Direct retention">{retention.map(item => <option key={item.id} value={`retention:${item.id}`}>{nameOf(item)}</option>)}</optgroup>}
        </AppSelect>
      </label>
      <button type="button" onClick={() => void openClient(client)} disabled={!!openingClientId} className="flex items-center justify-center gap-1.5 rounded-lg border border-violet-400/25 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-500/20 disabled:opacity-50">
        {openingClientId === client.id ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}Open as client
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0d1118] px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1700px]">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.09] pb-5">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/admin')} className="rounded-lg border border-white/[0.12] p-2.5 text-slate-300 hover:text-white" aria-label="Back to CRM"><ArrowLeft size={19} /></button>
            <div className="rounded-lg bg-violet-500/15 p-2.5 text-violet-300"><ShieldCheck size={21} /></div>
            <div><h1 className="text-2xl font-bold">Team & client management</h1><p className="text-sm text-slate-400">Define staff access, reporting lines, and client ownership.</p></div>
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

        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className={`${panel} p-4`}><div className="text-xs text-slate-400">Administrators</div><div className="mt-1 text-2xl font-bold">{admins.length}</div><div className="mt-1 text-[11px] text-slate-500">Full platform access</div></div>
          <div className={`${panel} p-4`}><div className="text-xs text-slate-400">Retention managers</div><div className="mt-1 text-2xl font-bold">{retention.length}</div><div className="mt-1 text-[11px] text-slate-500">Team supervisors</div></div>
          <div className={`${panel} p-4`}><div className="text-xs text-slate-400">Agents</div><div className="mt-1 text-2xl font-bold">{agents.length}</div><div className="mt-1 text-[11px] text-slate-500">Client managers</div></div>
          <div className={`${panel} p-4`}><div className="text-xs text-slate-400">Assigned clients</div><div className="mt-1 text-2xl font-bold">{assignedClientIds.size}</div><div className="mt-1 text-[11px] text-slate-500">Visible to CRM staff</div></div>
          <div className={`${panel} p-4`}><div className="text-xs text-slate-400">Setup required</div><div className={`mt-1 text-2xl font-bold ${unassignedClients.length + unassignedAgents.length > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>{unassignedClients.length + unassignedAgents.length}</div><div className="mt-1 text-[11px] text-slate-500">Unassigned clients and agents</div></div>
        </div>

        <div className="mb-5 flex items-center gap-6 border-b border-white/[0.09]" role="tablist" aria-label="Team management sections">
          <button type="button" role="tab" aria-selected={activeSection === 'teams'} onClick={() => setActiveSection('teams')} className={`flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-semibold transition ${activeSection === 'teams' ? 'border-violet-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}><Users size={16} />Organization <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px]">{admins.length + retention.length + agents.length}</span></button>
          <button type="button" role="tab" aria-selected={activeSection === 'clients'} onClick={() => setActiveSection('clients')} className={`flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-semibold transition ${activeSection === 'clients' ? 'border-violet-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}><AlertCircle size={16} />Account setup <span className={`rounded-full px-2 py-0.5 text-[11px] ${unassignedClients.length > 0 ? 'bg-amber-400/10 text-amber-300' : 'bg-white/[0.07]'}`}>{unassignedClients.length}</span></button>
        </div>

        {activeSection === 'clients' && (
          <section className={`${panel} min-w-0 overflow-hidden`} role="tabpanel">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] p-5">
              <div className="flex items-center gap-3"><div className="rounded-lg bg-sky-500/10 p-2.5 text-sky-300"><Users size={19} /></div><div><h2 className="font-semibold">Accounts awaiting setup</h2><p className="mt-0.5 text-xs text-slate-400">Every new account starts as a client. Assign an owner, or change the access role if this person is joining your staff.</p></div></div>
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search accounts" className={`${selectClass} w-64 pl-9`} /></div>
            </div>
            <div className="hidden grid-cols-[minmax(220px,1fr)_150px_minmax(240px,320px)] gap-4 border-b border-white/[0.06] bg-black/10 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 md:grid">
              <span>Account</span><span>Access role</span><span>Assign client owner</span>
            </div>
            <div className="max-h-[680px] divide-y divide-white/[0.06] overflow-y-auto">
              {loading ? <div className="p-10 text-center text-sm text-slate-400">Loading client accounts...</div> : visibleUnassignedClients.length === 0 ? (
                <div className="p-10 text-center"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300"><ShieldCheck size={20} /></div><p className="mt-3 text-sm font-semibold text-slate-200">Setup queue is clear</p><p className="mt-1 text-xs text-slate-500">Every client has an owner, or no account matches this search.</p></div>
              ) : visibleUnassignedClients.map(client => (
                <div key={client.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(220px,1fr)_150px_minmax(240px,320px)] md:items-center md:gap-4">
                  <div className="min-w-0"><div className="truncate text-sm font-semibold">{nameOf(client)}</div><div className="truncate text-xs text-slate-400">{client.email}</div><div className="mt-1 text-[11px] text-slate-600">Current role: Client</div></div>
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
                <div><h2 className="font-semibold">Staff roles</h2><p className="mt-0.5 text-xs text-slate-400">Promote an existing client account when that person should work as an agent or retention manager.</p></div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => openStaffSetup('retention')} disabled={busy !== null || clients.length === 0} className="flex items-center gap-1.5 rounded-lg border border-white/[0.12] px-3 py-2 text-xs font-semibold text-slate-200 hover:border-violet-400/50 disabled:opacity-50"><Plus size={14} />Create retention role</button>
                  <button type="button" onClick={() => openStaffSetup('agent')} disabled={busy !== null || clients.length === 0} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"><Plus size={14} />Create agent role</button>
                </div>
              </div>
              {setupRole && (
                <div className="border-b border-white/[0.08] bg-violet-500/[0.05] p-5">
                  <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">Create {setupRole === 'agent' ? 'agent' : 'retention manager'} access</h3><p className="mt-1 text-xs text-slate-400">Select the existing account that should receive this staff role. Any current client assignment for that account will be removed.</p></div><button type="button" onClick={() => setSetupRole(null)} aria-label="Close staff role setup" className="text-slate-500 hover:text-white"><X size={17} /></button></div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Account
                      <AppSelect aria-label="Account to promote" value={staffCandidateId} onChange={event => setStaffCandidateId(event.target.value)} className={`${selectClass} mt-1 w-full`}>
                        <option value="">Select client account</option>{clients.map(client => <option key={client.id} value={client.id}>{nameOf(client)} · {client.email}</option>)}
                      </AppSelect>
                    </label>
                    {setupRole === 'agent' && <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Reports to
                      <AppSelect aria-label="Retention manager for new agent" value={staffManagerId} onChange={event => setStaffManagerId(event.target.value)} className={`${selectClass} mt-1 w-full`}>
                        <option value="">Leave unassigned</option>{retention.map(manager => <option key={manager.id} value={manager.id}>{nameOf(manager)}</option>)}
                      </AppSelect>
                    </label>}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={createStaffRole} disabled={busy !== null || !staffCandidateId} className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50">Confirm staff role</button>
                  </div>
                </div>
              )}
            </section>

            {visibleAdmins.length > 0 && <section className={`${panel} overflow-hidden`}>
              <div className="border-b border-white/[0.08] px-5 py-4"><h2 className="font-semibold">Administrators</h2><p className="mt-1 text-xs text-slate-400">Accounts with full CRM and platform access.</p></div>
              <div className="divide-y divide-white/[0.07]">{visibleAdmins.map(admin => <div key={admin.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0"><div className="truncate text-sm font-semibold">{nameOf(admin)}</div><div className="truncate text-xs text-slate-500">{admin.email}</div></div>
                <div className="flex items-center gap-2">
                  <AppSelect aria-label={`Role for ${admin.email}`} value="admin" onChange={event => changeRole(admin, event.target.value as CRMRole)} disabled={busy !== null} className={`${selectClass} w-36`}><option value="client">Client</option><option value="agent">Agent</option><option value="retention">Retention</option><option value="admin">Admin</option></AppSelect>
                  <button type="button" onClick={() => openAccountDetails(admin)} className="flex items-center gap-1.5 rounded-lg border border-violet-400/25 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-500/20"><UserCog size={14} />Open details</button>
                </div>
              </div>)}</div>
            </section>}

            <section className={`${panel} flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between`}>
              <div>
                <h2 className="text-sm font-semibold text-slate-200">Search organization</h2>
                <p className="mt-1 text-xs text-slate-500">Find a retention manager, agent, or client by name, email, or account ID.</p>
              </div>
              <div className="relative w-full sm:w-[360px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
                <input
                  value={teamSearch}
                  onChange={event => setTeamSearch(event.target.value)}
                  placeholder="Search teams and clients"
                  aria-label="Search teams and clients"
                  className={`${selectClass} w-full pl-9 pr-9`}
                />
                {teamSearch && <button type="button" onClick={() => setTeamSearch('')} aria-label="Clear organization search" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"><X size={15} /></button>}
              </div>
            </section>

            {visibleUnassignedAgents.length > 0 && <section className="overflow-hidden rounded-xl border border-amber-400/20 bg-[#151b26]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-400/15 bg-amber-400/[0.04] px-5 py-4"><div className="flex items-start gap-3"><div className="rounded-lg bg-amber-400/10 p-2 text-amber-300"><AlertCircle size={18} /></div><div><h2 className="font-semibold">Action required: assign agent managers</h2><p className="mt-1 text-xs text-slate-400">These agents can manage their clients, but no retention manager currently supervises them.</p></div></div><span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-xs font-bold text-amber-300">{unassignedAgents.length} unassigned</span></div>
              <div className="divide-y divide-white/[0.07]">{visibleUnassignedAgents.map(agent => {
                const agentClients = clientsForAgent(agent.id);
                const agentMatches = personMatchesTeamSearch(agent);
                const visibleAgentClients = normalizedTeamSearch && !agentMatches ? agentClients.filter(personMatchesTeamSearch) : agentClients;
                const agentExpanded = expandedAgentIds.includes(agent.id) || (!!normalizedTeamSearch && !agentMatches);
                return <div key={agent.id}>
                  <div className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(240px,1fr)_130px_minmax(220px,280px)_150px_auto] lg:items-end">
                    <div className="min-w-0"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Agent account</div><div className="mt-1 truncate text-sm font-semibold">{nameOf(agent)}</div><div className="truncate text-xs text-slate-500">{agent.email}</div></div>
                    <div><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Assigned clients</div><div className="mt-1 text-lg font-semibold">{agentClients.length}</div></div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Retention manager
                      <AppSelect aria-label={`Retention manager for ${agent.email}`} value="" disabled={busy !== null} onChange={event => void run(`agent-${agent.id}`, async () => { const { error } = await supabase.rpc('crm_admin_assign_agent', { p_agent_id: agent.id, p_retention_id: event.target.value || null }); return { error }; }, 'Agent assignment updated.')} className={`${selectClass} mt-1 w-full`}><option value="">Select manager</option>{retention.map(item => <option key={item.id} value={item.id}>{nameOf(item)}</option>)}</AppSelect>
                    </label>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Access role
                      <AppSelect aria-label={`Role for ${agent.email}`} value="agent" onChange={event => changeRole(agent, event.target.value as CRMRole)} disabled={busy !== null} className={`${selectClass} mt-1 w-full`}><option value="client">Client</option><option value="agent">Agent</option><option value="retention">Retention</option><option value="admin">Admin</option></AppSelect>
                    </label>
                    <div className="flex gap-2"><button type="button" onClick={() => openAccountDetails(agent)} className="flex h-[38px] items-center justify-center gap-1.5 rounded-lg border border-violet-400/25 bg-violet-500/10 px-3 text-xs font-semibold text-violet-200 hover:bg-violet-500/20"><UserCog size={14} />Details</button><button type="button" onClick={() => toggleExpanded(agent.id, setExpandedAgentIds)} aria-expanded={agentExpanded} className="flex h-[38px] items-center justify-center gap-2 rounded-lg border border-white/[0.12] px-3 text-xs font-semibold text-slate-200 hover:border-violet-400/50 hover:text-white">
                      {agentExpanded ? 'Hide clients' : 'View clients'}<ChevronDown size={15} className={`transition-transform ${agentExpanded ? 'rotate-180' : ''}`} />
                    </button></div>
                  </div>
                  {agentExpanded && <div className="border-t border-white/[0.05] bg-black/10"><div className="flex items-center justify-between px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500"><span>Clients assigned to {nameOf(agent)}</span><span>{visibleAgentClients.length}</span></div>{visibleAgentClients.length === 0 ? <div className="px-4 py-5 text-center text-xs text-slate-500">No clients assigned to this agent.</div> : visibleAgentClients.map(renderAssignedClient)}</div>}
                </div>;
              })}</div>
            </section>}

            <div className="flex flex-wrap items-end justify-between gap-3 px-1"><div><h2 className="text-lg font-semibold">Retention teams</h2><p className="mt-1 text-xs text-slate-400">Each team shows its manager, assigned agents, and every client those staff members can access.</p></div>{unassignedAgents.length === 0 && agents.length > 0 && <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-1.5 text-xs text-emerald-300">All agents have a manager</span>}</div>

            {loading ? <div className={`${panel} p-10 text-center text-sm text-slate-400`}>Loading organization...</div> : retention.length === 0 ? (
              <div className={`${panel} p-10 text-center`}><Users size={24} className="mx-auto text-slate-500" /><p className="mt-3 text-sm font-semibold">No retention team exists yet</p><p className="mt-1 text-xs text-slate-500">Use Create retention role above, then assign agents to that manager.</p></div>
            ) : visibleRetention.length === 0 && visibleUnassignedAgents.length === 0 ? (
              <div className={`${panel} p-10 text-center`}><Search size={23} className="mx-auto text-slate-500" /><p className="mt-3 text-sm font-semibold">No organization matches found</p><p className="mt-1 text-xs text-slate-500">Try a different name, email, or account ID.</p></div>
            ) : <div className="space-y-5">{visibleRetention.map(manager => {
              const allManagerAgents = agents.filter(agent => agentManager.get(agent.id) === manager.id);
              const allDirectClients = directClientsForRetention(manager.id);
              const managerMatches = personMatchesTeamSearch(manager);
              const managerAgents = normalizedTeamSearch && !managerMatches ? allManagerAgents.filter(agentContainsSearch) : allManagerAgents;
              const directClients = normalizedTeamSearch && !managerMatches ? allDirectClients.filter(personMatchesTeamSearch) : allDirectClients;
              const teamClientCount = allDirectClients.length + allManagerAgents.reduce((total, agent) => total + clientsForAgent(agent.id).length, 0);
              const managerExpanded = expandedManagerIds.includes(manager.id) || (!!normalizedTeamSearch && !managerMatches);
              return <section key={manager.id} className={`${panel} overflow-hidden`}>
                <div className={`grid gap-4 bg-violet-500/[0.04] p-5 lg:grid-cols-[minmax(260px,1fr)_100px_100px_160px_auto] lg:items-end ${managerExpanded ? 'border-b border-white/[0.08]' : ''}`}>
                  <div className="min-w-0"><div className="text-[10px] font-bold uppercase tracking-wider text-violet-300">Retention manager</div><div className="mt-1 truncate text-base font-semibold">{nameOf(manager)}</div><div className="truncate text-xs text-slate-400">{manager.email}</div></div>
                  <div><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Agents</div><div className="mt-1 text-xl font-bold">{allManagerAgents.length}</div></div>
                  <div><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Clients</div><div className="mt-1 text-xl font-bold">{teamClientCount}</div></div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Access role
                    <AppSelect aria-label={`Role for ${manager.email}`} value="retention" onChange={event => changeRole(manager, event.target.value as CRMRole)} disabled={busy !== null} className={`${selectClass} mt-1 w-full`}><option value="client">Client</option><option value="agent">Agent</option><option value="retention">Retention</option><option value="admin">Admin</option></AppSelect>
                  </label>
                  <div className="flex gap-2"><button type="button" onClick={() => openAccountDetails(manager)} className="flex h-[38px] items-center justify-center gap-1.5 rounded-lg border border-violet-400/25 bg-violet-500/10 px-3 text-xs font-semibold text-violet-200 hover:bg-violet-500/20"><UserCog size={14} />Details</button><button type="button" onClick={() => toggleExpanded(manager.id, setExpandedManagerIds)} aria-expanded={managerExpanded} className="flex h-[38px] items-center justify-center gap-2 rounded-lg border border-violet-400/25 bg-violet-500/[0.06] px-3 text-xs font-semibold text-violet-200 hover:border-violet-400/50 hover:bg-violet-500/[0.1]">
                    {managerExpanded ? 'Hide team' : 'View team'}<ChevronDown size={15} className={`transition-transform ${managerExpanded ? 'rotate-180' : ''}`} />
                  </button></div>
                </div>

                {managerExpanded && <>
                  {directClients.length > 0 && <div className="border-b border-white/[0.07]"><div className="flex items-center justify-between bg-black/10 px-4 py-2.5"><div><div className="text-xs font-semibold text-slate-300">Direct clients</div><div className="text-[11px] text-slate-500">Managed directly by {nameOf(manager)}, without an agent.</div></div><span className="text-xs text-slate-500">{directClients.length}</span></div>{directClients.map(renderAssignedClient)}</div>}

                  <div className="bg-black/[0.06] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Agents reporting to {nameOf(manager)}</div>
                  {managerAgents.length === 0 ? <div className="m-4 rounded-lg border border-dashed border-white/[0.1] p-6 text-center"><p className="text-sm text-slate-400">No agents report to this manager.</p><p className="mt-1 text-xs text-slate-600">Assign an agent from the Action required section above.</p></div> : <div className="divide-y divide-white/[0.07]">{managerAgents.map(agent => {
                  const allAgentClients = clientsForAgent(agent.id);
                  const agentMatches = personMatchesTeamSearch(agent);
                  const agentClients = normalizedTeamSearch && !managerMatches && !agentMatches ? allAgentClients.filter(personMatchesTeamSearch) : allAgentClients;
                  const agentExpanded = expandedAgentIds.includes(agent.id) || (!!normalizedTeamSearch && !managerMatches && !agentMatches);
                  return <div key={agent.id} className="p-4 sm:p-5">
                    <div className="grid gap-4 lg:grid-cols-[minmax(240px,1fr)_minmax(220px,280px)_150px_auto] lg:items-end">
                      <div className="min-w-0"><div className="text-[10px] font-bold uppercase tracking-wider text-sky-300">Agent</div><div className="mt-1 truncate text-sm font-semibold">{nameOf(agent)}</div><div className="truncate text-xs text-slate-500">{agent.email} · {allAgentClients.length} assigned clients</div></div>
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Reports to
                        <AppSelect aria-label={`Retention manager for ${agent.email}`} value={manager.id} disabled={busy !== null} onChange={event => void run(`agent-${agent.id}`, async () => { const { error } = await supabase.rpc('crm_admin_assign_agent', { p_agent_id: agent.id, p_retention_id: event.target.value || null }); return { error }; }, 'Agent assignment updated.')} className={`${selectClass} mt-1 w-full`}><option value="">Unassigned</option>{retention.map(item => <option key={item.id} value={item.id}>{nameOf(item)}</option>)}</AppSelect>
                      </label>
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Access role
                        <AppSelect aria-label={`Role for ${agent.email}`} value="agent" onChange={event => changeRole(agent, event.target.value as CRMRole)} disabled={busy !== null} className={`${selectClass} mt-1 w-full`}><option value="client">Client</option><option value="agent">Agent</option><option value="retention">Retention</option><option value="admin">Admin</option></AppSelect>
                      </label>
                      <div className="flex gap-2"><button type="button" onClick={() => openAccountDetails(agent)} className="flex h-[38px] items-center justify-center gap-1.5 rounded-lg border border-violet-400/25 bg-violet-500/10 px-3 text-xs font-semibold text-violet-200 hover:bg-violet-500/20"><UserCog size={14} />Details</button><button type="button" onClick={() => toggleExpanded(agent.id, setExpandedAgentIds)} aria-expanded={agentExpanded} className="flex h-[38px] items-center justify-center gap-2 rounded-lg border border-white/[0.12] px-3 text-xs font-semibold text-slate-200 hover:border-violet-400/50 hover:text-white">
                        {agentExpanded ? 'Hide clients' : 'View clients'}<ChevronDown size={15} className={`transition-transform ${agentExpanded ? 'rotate-180' : ''}`} />
                      </button></div>
                    </div>
                    {agentExpanded && <div className="mt-4 overflow-hidden rounded-lg border border-white/[0.07] bg-[#101620]"><div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5"><div><div className="text-xs font-semibold text-slate-300">Assigned clients</div><div className="text-[11px] text-slate-500">Only this agent and the supervising retention manager can access them.</div></div><span className="text-xs text-slate-500">{agentClients.length}</span></div>{agentClients.length === 0 ? <div className="px-4 py-5 text-center text-xs text-slate-500">No clients assigned to this agent.</div> : agentClients.map(renderAssignedClient)}</div>}
                  </div>;
                  })}</div>}
                </>}
              </section>;
            })}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
