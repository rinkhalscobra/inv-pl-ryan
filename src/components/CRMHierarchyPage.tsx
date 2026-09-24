import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ExternalLink, Loader2, Plus, RefreshCw, Search, ShieldCheck, UserCog, Users, X } from 'lucide-react';
import AppSelect from './AppSelect';
import { supabase } from '../lib/supabaseClient';
import { openClientDashboard } from '../lib/clientAccess';

type CRMRole = 'client' | 'workflow_manager' | 'desk_manager' | 'agent' | 'retention_manager' | 'retention' | 'admin';
type StaffRole = Exclude<CRMRole, 'client' | 'admin'>;
interface Person { id: string; email: string; first_name: string | null; last_name: string | null; role: CRMRole; is_promoted: boolean }
interface Pair { [key: string]: string }
interface Hierarchy {
  people: Person[];
  workflow_desk_assignments: Pair[];
  agent_desk_assignments: Pair[];
  retention_assignments: Pair[];
  client_assignments: Pair[];
  retention_client_assignments: Pair[];
}

const emptyHierarchy: Hierarchy = { people: [], workflow_desk_assignments: [], agent_desk_assignments: [], retention_assignments: [], client_assignments: [], retention_client_assignments: [] };
const panel = 'rounded-xl border border-white/[0.1] bg-[#151b26]';
const field = 'w-full rounded-lg border border-white/[0.13] bg-[#0f1520] px-3 py-2 text-sm text-slate-200 outline-none focus:border-violet-400 disabled:opacity-50';
const roles: CRMRole[] = ['client', 'workflow_manager', 'desk_manager', 'agent', 'retention_manager', 'retention', 'admin'];
const roleLabels: Record<CRMRole, string> = { client: 'Client', workflow_manager: 'Workflow Manager', desk_manager: 'Desk Manager', agent: 'Agent', retention_manager: 'Retention Manager', retention: 'Retention', admin: 'Admin' };
const nameOf = (person: Person) => `${person.first_name || ''} ${person.last_name || ''}`.trim() || person.email;
const emptyNewUser = { email: '', firstName: '', lastName: '', country: '', password: '', confirmPassword: '', role: 'client' as CRMRole, owner: '' };

export default function CRMHierarchyPage() {
  const navigate = useNavigate();
  const [hierarchy, setHierarchy] = useState<Hierarchy>(emptyHierarchy);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState(emptyNewUser);
  const [openingClientId, setOpeningClientId] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: requestError } = await supabase.rpc('crm_admin_get_hierarchy');
    if (requestError) { setError(requestError.message); setHierarchy(emptyHierarchy); }
    else { setHierarchy((data as Hierarchy) || emptyHierarchy); setError(null); }
    setLoading(false);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const run = async (key: string, action: () => Promise<{ error: { message: string } | null }>, success: string) => {
    setBusy(key); setError(null); setNotice(null);
    try { const result = await action(); if (result.error) throw new Error(result.error.message); await refresh(); setNotice(success); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'CRM hierarchy update failed.'); }
    finally { setBusy(''); }
  };

  const peopleByRole = (role: CRMRole) => hierarchy.people.filter(person => person.role === role);
  const workflowManagers = peopleByRole('workflow_manager');
  const deskManagers = peopleByRole('desk_manager');
  const agents = peopleByRole('agent');
  const retentionManagers = peopleByRole('retention_manager');
  const retentionUsers = peopleByRole('retention');
  const clients = peopleByRole('client');
  const managerOf = (person: Person) => person.role === 'desk_manager'
    ? hierarchy.workflow_desk_assignments.find(item => item.desk_manager_id === person.id)?.workflow_manager_id || ''
    : person.role === 'agent' ? hierarchy.agent_desk_assignments.find(item => item.agent_id === person.id)?.desk_manager_id || ''
      : person.role === 'retention' ? hierarchy.retention_assignments.find(item => item.retention_id === person.id)?.retention_manager_id || '' : '';
  const ownerOf = (client: Person) => client.is_promoted
    ? hierarchy.retention_client_assignments.find(item => item.client_id === client.id)?.retention_id || ''
    : hierarchy.client_assignments.find(item => item.client_id === client.id)?.agent_id || '';
  const normalizedSearch = search.trim().toLowerCase();
  const visibleClients = useMemo(() => clients.filter(client => !normalizedSearch || `${nameOf(client)} ${client.email} ${client.id}`.toLowerCase().includes(normalizedSearch)), [clients, normalizedSearch]);

  const assignmentOptions = (role: CRMRole) => role === 'desk_manager' ? workflowManagers : role === 'agent' ? deskManagers : role === 'retention' ? retentionManagers : role === 'client' ? agents : [];
  const ownerRoleFor = (role: CRMRole) => role === 'desk_manager' ? 'workflow_manager' : role === 'agent' ? 'desk_manager' : role === 'retention' ? 'retention_manager' : role === 'client' ? 'agent' : null;
  const reportsLabel = (role: CRMRole) => role === 'desk_manager' ? 'Workflow Manager' : role === 'agent' ? 'Desk Manager' : role === 'retention' ? 'Retention Manager' : role === 'client' ? 'Sales Agent' : '';

  const changeRole = (person: Person, role: CRMRole) => {
    if (role === person.role) return;
    if (!window.confirm(`Change ${person.email} from ${roleLabels[person.role]} to ${roleLabels[role]}? Current assignments will be removed.`)) return;
    void run(`role-${person.id}`, async () => { const { error } = await supabase.rpc('crm_admin_set_role', { p_user_id: person.id, p_role: role }); return { error }; }, `${nameOf(person)} is now ${roleLabels[role]}.`);
  };
  const assignStaff = (person: Person, managerId: string) => void run(`assign-${person.id}`, async () => { const { error } = await supabase.rpc('crm_admin_assign_staff', { p_user_id: person.id, p_manager_id: managerId || null }); return { error }; }, `${nameOf(person)}'s reporting line was updated.`);
  const assignClient = (client: Person, ownerId: string) => void run(`client-${client.id}`, async () => { const { error } = await supabase.rpc('crm_admin_set_client_owner', { p_client_id: client.id, p_owner_role: ownerId ? (client.is_promoted ? 'retention' : 'agent') : 'unassigned', p_owner_id: ownerId || null }); return { error }; }, 'Client owner updated.');
  const promoteClient = (client: Person) => {
    if (!window.confirm(`Promote ${nameOf(client)} to Retention? All Sales access will end immediately.`)) return;
    void run(`promote-${client.id}`, async () => { const { error } = await supabase.rpc('crm_promote_client_to_retention', { p_client_id: client.id }); return { error }; }, 'Client promoted to Retention. Assign a Retention owner below.');
  };
  const openClient = async (client: Person) => { setOpeningClientId(client.id); setError(null); try { await openClientDashboard(client.id); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Client dashboard could not be opened.'); } finally { setOpeningClientId(''); } };

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null);
    if (!newUser.email.trim() || !newUser.firstName.trim() || !newUser.lastName.trim()) { setError('Email, first name and last name are required.'); return; }
    if (newUser.password.length < 8 || newUser.password !== newUser.confirmPassword) { setError('Use a matching password of at least 8 characters.'); return; }
    setBusy('create');
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) throw new Error('Administrator session expired.');
      const ownerRole = ownerRoleFor(newUser.role);
      const { data, error: requestError } = await supabase.functions.invoke('admin-user-management', { headers: { Authorization: `Bearer ${sessionData.session.access_token}` }, body: { action: 'create_user', email: newUser.email.trim().toLowerCase(), first_name: newUser.firstName.trim(), last_name: newUser.lastName.trim(), country: newUser.country.trim(), password: newUser.password, role: newUser.role, owner_role: newUser.owner ? ownerRole : null, owner_id: newUser.owner || null } });
      if (requestError || data?.error) throw new Error(data?.error || requestError?.message || 'Account creation failed.');
      setShowCreate(false); setNewUser(emptyNewUser); setNotice('CRM account created.'); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Account creation failed.'); }
    finally { setBusy(''); }
  };

  const StaffList = ({ title, role, people }: { title: string; role: StaffRole; people: Person[] }) => <section className={`${panel} overflow-hidden`}><div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3"><h3 className="font-semibold">{title}</h3><span className="text-xs text-slate-400">{people.length}</span></div><div className="divide-y divide-white/[0.06]">{people.length === 0 ? <div className="p-5 text-sm text-slate-500">No accounts</div> : people.map(person => <div key={person.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(180px,1fr)_220px_220px_auto]"><div className="min-w-0"><div className="truncate font-semibold">{nameOf(person)}</div><div className="truncate text-xs text-slate-400">{person.email}</div></div><AppSelect value={person.role} disabled={!!busy} onChange={event => changeRole(person, event.target.value as CRMRole)} className={field}>{roles.map(item => <option key={item} value={item}>{roleLabels[item]}</option>)}</AppSelect>{['desk_manager', 'agent', 'retention'].includes(role) ? <AppSelect value={managerOf(person)} disabled={!!busy} onChange={event => assignStaff(person, event.target.value)} className={field}><option value="">Unassigned {reportsLabel(role)}</option>{assignmentOptions(role).map(manager => <option key={manager.id} value={manager.id}>{nameOf(manager)}</option>)}</AppSelect> : <div className="flex items-center text-xs text-slate-500">Reports directly to Admin</div>}<button onClick={() => navigate(`/admin/accounts/${person.id}`)} className="rounded-lg border border-white/[0.12] p-2 text-slate-300 hover:text-white" aria-label={`Open ${nameOf(person)}`}><UserCog size={17} /></button></div>)}</div></section>;

  return <div className="min-h-screen bg-[#0d1118] px-4 py-5 text-slate-100 sm:px-6 lg:px-8"><div className="mx-auto max-w-[1700px]">
    <header className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.09] pb-5"><div className="flex items-center gap-3"><button onClick={() => navigate('/admin')} className="rounded-lg border border-white/[0.12] p-2.5 text-slate-300 hover:text-white"><ArrowLeft size={19} /></button><div className="rounded-lg bg-violet-500/15 p-2.5 text-violet-300"><ShieldCheck size={21} /></div><div><h1 className="text-2xl font-bold">CRM hierarchy</h1><p className="text-sm text-slate-400">Strict Sales and Retention workspaces</p></div></div><div className="flex gap-2"><button onClick={() => void refresh()} disabled={loading} className="flex items-center gap-2 rounded-lg border border-white/[0.12] px-3 py-2 text-sm"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</button><button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold hover:bg-violet-500"><Plus size={16} />Create account</button></div></header>
    {error && <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"><AlertCircle size={17} />{error}</div>}{notice && <div role="status" className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</div>}
    <div className="grid gap-5 2xl:grid-cols-2"><section className="space-y-4"><div className={`${panel} border-cyan-400/20 p-4`}><h2 className="text-lg font-bold text-cyan-200">Sales workspace</h2><p className="mt-1 text-sm text-slate-400">Admin → Workflow Manager → Desk Manager → Agent → unpromoted lead</p></div><StaffList title="Workflow Managers" role="workflow_manager" people={workflowManagers} /><StaffList title="Desk Managers" role="desk_manager" people={deskManagers} /><StaffList title="Agents" role="agent" people={agents} /></section><section className="space-y-4"><div className={`${panel} border-amber-400/20 p-4`}><h2 className="text-lg font-bold text-amber-200">Retention workspace</h2><p className="mt-1 text-sm text-slate-400">Admin → Retention Manager → Retention → promoted client</p></div><StaffList title="Retention Managers" role="retention_manager" people={retentionManagers} /><StaffList title="Retention" role="retention" people={retentionUsers} /></section></div>
    <section className={`${panel} mt-5 overflow-hidden`}><div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] p-4"><div><h2 className="flex items-center gap-2 font-semibold"><Users size={17} />Client workspace assignment</h2><p className="mt-1 text-xs text-slate-400">Unpromoted clients accept Agents only. Promoted clients accept Retention only.</p></div><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search clients" className={`${field} pl-9`} /></div></div><div className="overflow-x-auto"><table className="w-full min-w-[940px] text-left text-sm"><thead className="bg-white/[0.025] text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Client</th><th className="px-4 py-3">Workspace</th><th className="px-4 py-3">Owner</th><th className="px-4 py-3">Controls</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{visibleClients.map(client => <tr key={client.id}><td className="px-4 py-3"><div className="font-semibold">{nameOf(client)}</div><div className="text-xs text-slate-400">{client.email}</div></td><td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-xs ${client.is_promoted ? 'bg-amber-500/10 text-amber-200' : 'bg-cyan-500/10 text-cyan-200'}`}>{client.is_promoted ? 'Retention · promoted' : 'Sales · unpromoted'}</span></td><td className="px-4 py-3"><AppSelect value={ownerOf(client)} disabled={!!busy} onChange={event => assignClient(client, event.target.value)} className={field}><option value="">Unassigned</option>{(client.is_promoted ? retentionUsers : agents).map(owner => <option key={owner.id} value={owner.id}>{nameOf(owner)}</option>)}</AppSelect></td><td className="px-4 py-3"><div className="flex gap-2">{!client.is_promoted && <button onClick={() => promoteClient(client)} disabled={!!busy} className="rounded-lg border border-amber-400/30 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-400/10 disabled:opacity-50">Promote</button>}<button onClick={() => void openClient(client)} disabled={!!openingClientId} className="rounded-lg border border-white/[0.12] p-2 text-slate-300 hover:text-white">{openingClientId === client.id ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}</button></div></td></tr>)}{visibleClients.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-500">No clients found.</td></tr>}</tbody></table></div></section>
    {showCreate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"><form onSubmit={createUser} className="w-full max-w-xl rounded-2xl border border-white/15 bg-[#171e2b] p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-lg font-semibold">Create CRM account</h2><p className="mt-1 text-sm text-slate-400">Role and reporting line are validated by the server.</p></div><button type="button" onClick={() => setShowCreate(false)}><X size={20} /></button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><input value={newUser.firstName} onChange={event => setNewUser(value => ({ ...value, firstName: event.target.value }))} placeholder="First name" className={field} /><input value={newUser.lastName} onChange={event => setNewUser(value => ({ ...value, lastName: event.target.value }))} placeholder="Last name" className={field} /><input value={newUser.email} onChange={event => setNewUser(value => ({ ...value, email: event.target.value }))} placeholder="Email" type="email" className={`${field} sm:col-span-2`} /><input value={newUser.country} onChange={event => setNewUser(value => ({ ...value, country: event.target.value }))} placeholder="Country" className={`${field} sm:col-span-2`} /><AppSelect value={newUser.role} onChange={event => setNewUser(value => ({ ...value, role: event.target.value as CRMRole, owner: '' }))} className={field}>{roles.map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}</AppSelect>{ownerRoleFor(newUser.role) ? <AppSelect value={newUser.owner} onChange={event => setNewUser(value => ({ ...value, owner: event.target.value }))} className={field}><option value="">Unassigned {reportsLabel(newUser.role)}</option>{assignmentOptions(newUser.role).map(owner => <option key={owner.id} value={owner.id}>{nameOf(owner)}</option>)}</AppSelect> : <div className="flex items-center rounded-lg border border-white/[0.08] px-3 text-xs text-slate-500">Reports directly to Admin</div>}<input value={newUser.password} onChange={event => setNewUser(value => ({ ...value, password: event.target.value }))} placeholder="Password" type="password" className={field} /><input value={newUser.confirmPassword} onChange={event => setNewUser(value => ({ ...value, confirmPassword: event.target.value }))} placeholder="Confirm password" type="password" className={field} /></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-white/[0.12] px-4 py-2 text-sm">Cancel</button><button disabled={busy === 'create'} className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold disabled:opacity-50">{busy === 'create' && <Loader2 size={16} className="animate-spin" />}Create</button></div></form></div>}
  </div></div>;
}
