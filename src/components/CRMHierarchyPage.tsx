import AppSelect from './AppSelect';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  const [currentUserId, setCurrentUserId] = useState('');
  const [setupRole, setSetupRole] = useState<'agent' | 'retention' | null>(null);
  const [staffCandidateId, setStaffCandidateId] = useState('');
  const [staffManagerId, setStaffManagerId] = useState('');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState(emptyNewUser);
  const [createError, setCreateError] = useState<string | null>(null);

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
              {newUser.role === 'client' && <label className="block text-xs font-medium text-slate-300">Client owner <span className="text-slate-500">(optional)</span><AppSelect value={newUser.owner} onChange={event => setNewUser(value => ({ ...value, owner: event.target.value }))} className={`mt-1 ${fieldClass}`}><option value="">Unassigned</option>{agents.length > 0 && <optgroup label="Agents">{agents.map(agent => <option key={agent.id} value={`agent:${agent.id}`}>{nameOf(agent)} Â· {agent.email}</option>)}</optgroup>}{retention.length > 0 && <optgroup label="Direct retention">{retention.map(manager => <option key={manager.id} value={`retention:${manager.id}`}>{nameOf(manager)} Â· {manager.email}</option>)}</optgroup>}</AppSelect></label>}
              {newUser.role === 'agent' && <label className="block text-xs font-medium text-slate-300">Retention manager <span className="text-slate-500">(optional)</span><AppSelect value={newUser.owner} onChange={event => setNewUser(value => ({ ...value, owner: event.target.value }))} className={`mt-1 ${fieldClass}`}><option value="">Unassigned</option>{retention.map(manager => <option key={manager.id} value={`retention:${manager.id}`}>{nameOf(manager)} Â· {manager.email}</option>)}</AppSelect></label>}
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
                  <AppSelect aria-label={`Role for ${person.email}`} value={person.role} onChange={event => changeRole(person, event.target.value as CRMRole)} disabled={busy !== null || person.id === currentUserId} className={selectClass}>
                    <option value="client">Client</option><option value="agent">Agent</option><option value="retention">Retention</option><option value="admin">Admin</option>
                  </AppSelect>
                </div>
              ))}
            </div>
          </section>

          <div className="min-w-0 space-y-5">
            <section className={`${panel} overflow-hidden`}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] p-4">
                <div><h2 className="font-semibold">Retention â†’ agents</h2><p className="text-xs text-slate-400">Each agent can belong to one retention manager.</p></div>
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
                    <AppSelect aria-label="Account to promote" value={staffCandidateId} onChange={event => setStaffCandidateId(event.target.value)} className={selectClass}>
                      <option value="">Select client account</option>{clients.map(client => <option key={client.id} value={client.id}>{nameOf(client)} Â· {client.email}</option>)}
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
              <div className="max-h-[320px] divide-y divide-white/[0.06] overflow-y-auto">
                {agents.length === 0 ? <div className="p-5 text-sm text-slate-400">No agents yet. Use <span className="font-semibold text-violet-200">Add agent</span> above to promote an existing account.</div> : agents.map(agent => (
                  <div key={agent.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0"><div className="truncate text-sm font-semibold">{nameOf(agent)}</div><div className="text-xs text-slate-400">{hierarchy.client_assignments.filter(item => item.agent_id === agent.id).length} clients</div></div>
                    <AppSelect aria-label={`Retention manager for ${agent.email}`} value={agentManager.get(agent.id) || ''} disabled={busy !== null} onChange={event => void run(`agent-${agent.id}`, async () => {
                      const { error } = await supabase.rpc('crm_admin_assign_agent', { p_agent_id: agent.id, p_retention_id: event.target.value || null }); return { error };
                    }, 'Agent assignment updated.')} className={selectClass}>
                      <option value="">Unassigned</option>{retention.map(manager => <option key={manager.id} value={manager.id}>{nameOf(manager)}</option>)}
                    </AppSelect>
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
                    <AppSelect aria-label={`Owner for ${client.email}`} value={clientAgent.has(client.id) ? `agent:${clientAgent.get(client.id)}` : clientRetention.has(client.id) ? `retention:${clientRetention.get(client.id)}` : ''} disabled={busy !== null} onChange={event => assignClientOwner(client, event.target.value)} className={selectClass}>
                      <option value="">Unassigned</option>
                      {agents.length > 0 && <optgroup label="Agents">{agents.map(agent => <option key={agent.id} value={`agent:${agent.id}`}>{nameOf(agent)}</option>)}</optgroup>}
                      {retention.length > 0 && <optgroup label="Retention only">{retention.map(manager => <option key={manager.id} value={`retention:${manager.id}`}>{nameOf(manager)}</option>)}</optgroup>}
                    </AppSelect>
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
