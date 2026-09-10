import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  Bell,
  Bot,
  Briefcase,
  CheckCircle2,
  Coins,
  CreditCard,
  Database,
  FileText,
  Gift,
  Headphones,
  Landmark,
  LayoutDashboard,
  Loader2,
  Pencil,
  ReceiptText,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
  XCircle
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useFiatCurrency } from '../hooks/useFiatCurrency';

type JsonRow = Record<string, unknown>;
type CRMTab = 'dashboard' | 'profile' | 'wallet' | 'swap' | 'futures' | 'cfd' | 'prop' | 'robot' | 'staking' | 'wheel' | 'deposits' | 'referrals' | 'support' | 'notifications' | 'audit';

interface AdminUser extends JsonRow {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  country?: string | null;
  phone_number?: string | null;
  kyc_status?: string;
  is_admin?: boolean;
  created_at?: string;
  usdt_balance?: number;
  btc_balance?: number;
  robot_allocated_balance?: number;
  robot_active?: boolean;
}

interface CRMStats {
  total_users: number;
  pending_kyc: number;
  active_robots: number;
  total_usdt: number;
  total_robot_allocated: number;
}

interface UserWorkspace {
  profile: AdminUser;
  balance: JsonRow;
  robot: JsonRow;
  bank_details: JsonRow;
  assets: JsonRow[];
  transactions: JsonRow[];
  portfolio_snapshots: JsonRow[];
  futures_positions: JsonRow[];
  futures_orders: JsonRow[];
  futures_history: JsonRow[];
  swap_charges: JsonRow[];
  spot_orders: JsonRow[];
  binary_trades: JsonRow[];
  stakes: JsonRow[];
  prop_positions: JsonRow[];
  prop_orders: JsonRow[];
  prop_history: JsonRow[];
  prop_accounts: JsonRow[];
  prop_logs: JsonRow[];
  trading_logs: JsonRow[];
  deposit_addresses: JsonRow[];
  deposits: JsonRow[];
  payment_requests: JsonRow[];
  sandbox_payments: JsonRow[];
  giveaway_tickets: JsonRow[];
  giveaway_entries: JsonRow[];
  giveaway_winners: JsonRow[];
  referral_earnings: JsonRow[];
  favorites: JsonRow[];
  notifications: JsonRow[];
  conversations: JsonRow[];
  support_messages: JsonRow[];
  notes: JsonRow[];
  audit_logs: JsonRow[];
}

interface AdminCRMPageProps {
  isAdmin: boolean;
}

const emptyStats: CRMStats = {
  total_users: 0,
  pending_kyc: 0,
  active_robots: 0,
  total_usdt: 0,
  total_robot_allocated: 0
};

const fieldClass = 'w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20';
const panelClass = 'rounded-2xl border border-slate-700/70 bg-slate-900/75 shadow-xl shadow-black/10';
const preferredRecordColumns = ['symbol', 'pair', 'subject', 'message', 'content', 'chain', 'address', 'txid', 'type', 'side', 'direction', 'outcome', 'asset_symbol', 'challenge_id', 'action', 'amount', 'staked_amount', 'current_balance', 'commission_amount', 'price_amount', 'ticket_count', 'total_tickets', 'rank', 'prize_amount', 'payment_status', 'status', 'claimed', 'paid_out', 'is_open', 'created_at'];
const immutableRecordFields = new Set(['id', 'user_id', 'referrer_id', 'referred_user_id', 'created_at', 'updated_at']);

const asNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const asText = (value: unknown): string => value === null || value === undefined ? '' : String(value);

const money = (value: unknown, digits = 2) => asNumber(value).toLocaleString('en-US', {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits
});

const dateTime = (value: unknown) => {
  if (!value) return '—';
  const valueDate = new Date(String(value));
  return Number.isNaN(valueDate.getTime()) ? '—' : valueDate.toLocaleString();
};

const displayName = (user: AdminUser) => {
  const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
  return name || user.email;
};

const compactValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const RecordSection: React.FC<{
  title: string;
  rows: JsonRow[];
  emptyText?: string;
  onEdit?: (row: JsonRow) => void;
  onDelete?: (row: JsonRow) => void;
}> = ({
  title,
  rows,
  emptyText = 'No records',
  onEdit,
  onDelete
}) => {
  const columns = useMemo(() => {
    const keys = new Set(rows.flatMap(row => Object.keys(row)));
    const selected = preferredRecordColumns.filter(column => keys.has(column));
    return selected.slice(0, 6);
  }, [rows]);

  return (
    <section className={`${panelClass} overflow-hidden`}>
      <div className="flex items-center justify-between border-b border-slate-700/70 px-4 py-3">
        <h3 className="font-semibold text-white">{title}</h3>
        <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-400">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-slate-500">{emptyText}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-slate-950/40 text-xs uppercase text-slate-500">
              <tr>
                {columns.map(column => <th key={column} className="px-4 py-3">{column.replaceAll('_', ' ')}</th>)}
                {(onEdit || onDelete) && <th className="px-4 py-3 text-right">Controls</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.slice(0, 25).map((row, index) => (
                <tr key={asText(row.id) || index} className="text-slate-300 hover:bg-white/[0.02]">
                  {columns.map(column => (
                    <td key={column} className="max-w-[240px] truncate px-4 py-3">
                      {column.endsWith('_at') ? dateTime(row[column]) : compactValue(row[column])}
                    </td>
                  ))}
                  {(onEdit || onDelete) && (
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {onEdit && <button onClick={() => onEdit(row)} className="mr-2 rounded-lg border border-slate-700 p-2 text-slate-300 hover:border-purple-500 hover:text-white" title="Edit record"><Pencil size={14} /></button>}
                      {onDelete && <button onClick={() => onDelete(row)} className="rounded-lg border border-red-500/30 p-2 text-red-300 hover:bg-red-500/10" title="Delete record"><Trash2 size={14} /></button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

const AdminCRMPage: React.FC<AdminCRMPageProps> = ({ isAdmin }) => {
  const navigate = useNavigate();
  const { convertEurToUsd, convertUsdToEur, formatFiat } = useFiatCurrency();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<CRMStats>(emptyStats);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<UserWorkspace | null>(null);
  const [tab, setTab] = useState<CRMTab>('dashboard');
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [reason, setReason] = useState('CRM account update');
  const [profileForm, setProfileForm] = useState<Record<string, string | boolean>>({});
  const [balanceForm, setBalanceForm] = useState({ usdt: '0', btc: '0' });
  const [robotForm, setRobotForm] = useState<Record<string, string | boolean>>({});
  const [assetForm, setAssetForm] = useState({ symbol: '', balance: '0' });
  const [manualProfit, setManualProfit] = useState('');
  const [note, setNote] = useState('');
  const [notification, setNotification] = useState('');
  const [supportConversationId, setSupportConversationId] = useState('');
  const [supportReply, setSupportReply] = useState('');
  const [editingRecord, setEditingRecord] = useState<{ table: string; title: string; row: JsonRow } | null>(null);
  const [recordForm, setRecordForm] = useState<Record<string, string | boolean>>({});
  const [currentAdminId, setCurrentAdminId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const showError = (error: unknown) => {
    const text = error instanceof Error ? error.message : 'The CRM request failed';
    setMessage({ type: 'error', text });
  };

  const loadUsers = useCallback(async (query = '') => {
    if (!isAdmin) return;
    setLoadingUsers(true);
    const { data, error } = await supabase.rpc('admin_get_users', {
      p_search: query.trim() || null,
      p_limit: 100,
      p_offset: 0
    });
    setLoadingUsers(false);
    if (error) {
      showError(error);
      return;
    }
    const payload = (data || {}) as { users?: AdminUser[]; stats?: CRMStats };
    const nextUsers = payload.users || [];
    setUsers(nextUsers);
    setStats(payload.stats || emptyStats);
    setSelectedUserId(current => current && nextUsers.some(user => user.id === current)
      ? current
      : nextUsers[0]?.id || null);
  }, [isAdmin]);

  const loadWorkspace = useCallback(async (userId: string) => {
    setLoadingWorkspace(true);
    const { data, error } = await supabase.rpc('admin_get_user_workspace', {
      p_target_user_id: userId
    });
    setLoadingWorkspace(false);
    if (error) {
      showError(error);
      return;
    }
    const next = data as UserWorkspace;
    setWorkspace(next);
    const profile = next.profile || ({} as AdminUser);
    const balance = next.balance || {};
    const robot = next.robot || {};
    setProfileForm({
      first_name: asText(profile.first_name),
      last_name: asText(profile.last_name),
      country: asText(profile.country),
      phone_number: asText(profile.phone_number),
      kyc_status: asText(profile.kyc_status || 'not_verified'),
      is_admin: Boolean(profile.is_admin),
      document_id_url: asText(profile.document_id_url),
      document_selfie_url: asText(profile.document_selfie_url),
      referral_code: asText(profile.referral_code),
      referred_by: asText(profile.referred_by),
      referral_count: asText(profile.referral_count || 0),
      total_referral_earnings: convertUsdToEur(asNumber(profile.total_referral_earnings)).toFixed(2),
      referral_commission_rate: asText(profile.referral_commission_rate || 0.01),
      two_factor_required: Boolean(profile.two_factor_required),
      min_leverage_forex: asText(profile.min_leverage_forex),
      max_leverage_forex: asText(profile.max_leverage_forex),
      min_leverage_commodities: asText(profile.min_leverage_commodities),
      max_leverage_commodities: asText(profile.max_leverage_commodities),
      min_leverage_stocks: asText(profile.min_leverage_stocks),
      max_leverage_stocks: asText(profile.max_leverage_stocks),
      min_leverage_futures: asText(profile.min_leverage_futures),
      max_leverage_futures: asText(profile.max_leverage_futures)
    });
    setBalanceForm({ usdt: convertUsdToEur(asNumber(balance.usdt_balance)).toFixed(2), btc: asText(balance.btc_balance || 0) });
    setRobotForm({
      is_active: Boolean(robot.is_active),
      strategy: asText(robot.strategy || 'triangular'),
      allocated_balance: convertUsdToEur(asNumber(robot.allocated_balance)).toFixed(2),
      todays_profit: convertUsdToEur(asNumber(robot.todays_profit)).toFixed(2),
      custom_daily_profit_percentage: asText(robot.custom_daily_profit_percentage),
      min_profit_threshold: asText(robot.min_profit_threshold || 0.5),
      max_trade_amount: convertUsdToEur(asNumber(robot.max_trade_amount || 1000)).toFixed(2)
    });
    setSupportConversationId(current => current && (next.conversations || []).some(item => asText(item.id) === current)
      ? current
      : asText(next.conversations?.[0]?.id));
  }, [convertUsdToEur]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadUsers(search), 250);
    return () => window.clearTimeout(timeout);
  }, [loadUsers, search]);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setCurrentAdminId(data.user?.id || ''));
  }, []);

  useEffect(() => {
    setNewPassword('');
    setDeleteConfirmation('');
    if (selectedUserId) void loadWorkspace(selectedUserId);
    else setWorkspace(null);
  }, [loadWorkspace, selectedUserId]);

  const refreshAll = async () => {
    await loadUsers(search);
    if (selectedUserId) await loadWorkspace(selectedUserId);
  };

  const runMutation = async (key: string, action: () => Promise<{ error: { message: string } | null }>, successText: string) => {
    setSaving(key);
    setMessage(null);
    try {
      const result = await action();
      if (result.error) throw new Error(result.error.message);
      setMessage({ type: 'success', text: successText });
      await refreshAll();
    } catch (error) {
      showError(error);
    } finally {
      setSaving(null);
    }
  };

  const saveProfile = () => runMutation('profile', async () => {
    const changes = {
      ...profileForm,
      total_referral_earnings: convertEurToUsd(Number(profileForm.total_referral_earnings || 0))
    };
    const { error } = await supabase.rpc('admin_update_user_profile', {
      p_target_user_id: selectedUserId,
      p_changes: changes,
      p_reason: reason
    });
    return { error };
  }, 'User profile updated');

  const saveBalances = () => runMutation('balances', async () => {
    const { error } = await supabase.rpc('admin_set_user_balances', {
      p_target_user_id: selectedUserId,
      p_usdt_balance: convertEurToUsd(Number(balanceForm.usdt)),
      p_btc_balance: Number(balanceForm.btc),
      p_reason: reason
    });
    return { error };
  }, 'Wallet balances updated');

  const saveRobot = () => runMutation('robot', async () => {
    const changes = {
      ...robotForm,
      allocated_balance: convertEurToUsd(Number(robotForm.allocated_balance || 0)),
      todays_profit: convertEurToUsd(Number(robotForm.todays_profit || 0)),
      max_trade_amount: convertEurToUsd(Number(robotForm.max_trade_amount || 0)),
      custom_daily_profit_percentage: robotForm.custom_daily_profit_percentage === ''
        ? null
        : Number(robotForm.custom_daily_profit_percentage)
    };
    const { error } = await supabase.rpc('admin_update_robot_state', {
      p_target_user_id: selectedUserId,
      p_changes: changes,
      p_reason: reason
    });
    return { error };
  }, 'Robot configuration updated');

  const saveAsset = () => runMutation('asset', async () => {
    const { error } = await supabase.rpc('admin_set_user_asset_balance', {
      p_target_user_id: selectedUserId,
      p_asset_symbol: assetForm.symbol,
      p_balance: Number(assetForm.balance),
      p_reason: reason
    });
    return { error };
  }, 'Asset balance updated');

  const creditProfit = () => runMutation('profit', async () => {
    const { error } = await supabase.rpc('admin_credit_robot_profit', {
      p_target_user_id: selectedUserId,
      p_amount: convertEurToUsd(Number(manualProfit)),
      p_reason: reason
    });
    return { error };
  }, 'Robot profit credited');

  const addNote = () => runMutation('note', async () => {
    const { error } = await supabase.rpc('admin_add_user_note', {
      p_target_user_id: selectedUserId,
      p_note: note
    });
    if (!error) setNote('');
    return { error };
  }, 'Internal note added');

  const sendNotification = () => runMutation('notification', async () => {
    const { error } = await supabase.rpc('admin_send_notification', {
      p_target_user_id: selectedUserId,
      p_message: notification,
      p_type: 'admin'
    });
    if (!error) setNotification('');
    return { error };
  }, 'Notification sent');

  const invokeAdminUserAction = async (body: Record<string, unknown>) => {
    const callWithToken = async (accessToken: string) => {
      const { data, error } = await supabase.functions.invoke('admin-user-management', {
        body,
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (error) {
        let detail = error.message.includes('Failed to send a request')
          ? 'The admin-user-management Supabase function is not deployed or cannot be reached.'
          : error.message;
        let status: number | undefined;
        const response = (error as { context?: Response }).context;
        if (response instanceof Response) {
          status = response.status;
          try {
            const payload = await response.clone().json() as { error?: string };
            detail = payload.error || detail;
          } catch {
            // Preserve the SDK error when the response has no JSON body.
          }
        }
        return { error: { message: detail }, status };
      }
      const payload = data as { error?: string } | null;
      return { error: payload?.error ? { message: payload.error } : null, status: 200 };
    };

    const { data: sessionResult } = await supabase.auth.getSession();
    if (!sessionResult.session) return { error: { message: 'Administrator session expired. Sign in again.' } };

    let result = await callWithToken(sessionResult.session.access_token);
    if (result.status === 401) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshed.session) {
        return { error: { message: 'Administrator session expired. Sign out and sign in again with the current password.' } };
      }
      result = await callWithToken(refreshed.session.access_token);
    }
    return { error: result.error };
  };

  const changeAuthPassword = async () => {
    if (!selectedUserId) return;
    const changingOwnPassword = selectedUserId === currentAdminId;
    setSaving('auth-password');
    setMessage(null);
    try {
      const result = await invokeAdminUserAction({
        action: 'set_password',
        target_user_id: selectedUserId,
        password: newPassword,
        reason
      });
      if (result.error) throw new Error(result.error.message);
      setNewPassword('');
      if (changingOwnPassword) {
        window.alert('Your administrator password was changed. Sign in again with the new password.');
        await supabase.auth.signOut({ scope: 'local' });
        navigate('/auth', { replace: true });
        return;
      }
      setMessage({ type: 'success', text: 'Supabase Auth password changed' });
    } catch (error) {
      showError(error);
    } finally {
      setSaving(null);
    }
  };

  const deleteUserPermanently = async () => {
    if (!selectedUserId || !workspace?.profile) return;
    const targetEmail = workspace.profile.email;
    if (deleteConfirmation.trim().toLowerCase() !== targetEmail.toLowerCase()) {
      setMessage({ type: 'error', text: `Enter ${targetEmail} exactly to confirm deletion.` });
      return;
    }
    if (!window.confirm(`Permanently delete ${targetEmail} and all associated account data? This cannot be undone.`)) return;

    setSaving('delete-user');
    setMessage(null);
    try {
      const result = await invokeAdminUserAction({
        action: 'delete_user',
        target_user_id: selectedUserId,
        confirmation_email: deleteConfirmation,
        reason
      });
      if (result.error) throw new Error(result.error.message);
      setWorkspace(null);
      setSelectedUserId(null);
      setDeleteConfirmation('');
      setMessage({ type: 'success', text: `${targetEmail} and all associated account data were deleted.` });
      await loadUsers(search);
    } catch (error) {
      showError(error);
    } finally {
      setSaving(null);
    }
  };

  const sendSupportReply = () => runMutation('support-reply', async () => {
    const { error } = await supabase.rpc('admin_send_support_message', {
      p_target_user_id: selectedUserId,
      p_conversation_id: supportConversationId,
      p_content: supportReply
    });
    if (!error) setSupportReply('');
    return { error };
  }, 'Support reply sent');

  const openRecordEditor = (table: string, title: string, row: JsonRow) => {
    const values = Object.fromEntries(Object.entries(row)
      .filter(([key]) => !immutableRecordFields.has(key))
      .map(([key, value]) => [key, typeof value === 'object' && value !== null ? JSON.stringify(value, null, 2) : (typeof value === 'boolean' ? value : asText(value))]));
    setRecordForm(values);
    setEditingRecord({ table, title, row });
  };

  const saveModuleRecord = () => {
    if (!editingRecord) return;
    const changes: JsonRow = {};
    try {
      for (const [key, value] of Object.entries(recordForm)) {
        const original = editingRecord.row[key];
        if (typeof original === 'number') changes[key] = value === '' ? null : Number(value);
        else if (typeof original === 'boolean') changes[key] = Boolean(value);
        else if (typeof original === 'object' && original !== null) changes[key] = value === '' ? null : JSON.parse(String(value));
        else changes[key] = value === '' && original === null ? null : value;
      }
    } catch {
      setMessage({ type: 'error', text: 'A JSON field is not valid. Correct it before saving.' });
      return;
    }
    void runMutation('record', async () => {
      const { error } = await supabase.rpc('admin_update_module_record', {
        p_target_user_id: selectedUserId,
        p_table_name: editingRecord.table,
        p_record_id: editingRecord.row.id,
        p_changes: changes,
        p_reason: reason
      });
      if (!error) setEditingRecord(null);
      return { error };
    }, `${editingRecord.title} record updated`);
  };

  const deleteModuleRecord = (table: string, title: string, row: JsonRow) => {
    if (!window.confirm(`Delete this ${title} record? This action is audited.`)) return;
    void runMutation('delete-record', async () => {
      const { error } = await supabase.rpc('admin_delete_module_record', {
        p_target_user_id: selectedUserId,
        p_table_name: table,
        p_record_id: row.id,
        p_reason: reason
      });
      return { error };
    }, `${title} record deleted`);
  };

  if (!isAdmin) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-6">
        <div className={`${panelClass} max-w-md p-8 text-center`}>
          <XCircle className="mx-auto mb-4 text-red-400" size={44} />
          <h1 className="text-xl font-semibold text-white">Administrator access required</h1>
          <p className="mt-2 text-sm text-slate-400">This workspace is only available to authorized CRM administrators.</p>
        </div>
      </div>
    );
  }

  const profile = workspace?.profile;
  const tabs: Array<{ key: CRMTab; label: string; icon: React.ElementType }> = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'profile', label: 'Profile', icon: UserCog },
    { key: 'wallet', label: 'Wallet', icon: Wallet },
    { key: 'swap', label: 'Swap', icon: RefreshCw },
    { key: 'futures', label: 'Futures', icon: TrendingUp },
    { key: 'cfd', label: 'CFD', icon: Activity },
    { key: 'prop', label: 'Prop', icon: Briefcase },
    { key: 'robot', label: 'Robot', icon: Bot },
    { key: 'staking', label: 'Staking', icon: Landmark },
    { key: 'wheel', label: 'Spin Wheel', icon: Gift },
    { key: 'deposits', label: 'Deposits', icon: CreditCard },
    { key: 'referrals', label: 'Referrals', icon: Users },
    { key: 'support', label: 'Support', icon: Headphones },
    { key: 'notifications', label: 'Notifications', icon: Bell },
    { key: 'audit', label: 'Audit', icon: Database }
  ];

  const managedSection = (title: string, table: string, rows: JsonRow[], removable = true) => (
    <RecordSection
      title={title}
      rows={rows || []}
      onEdit={row => openRecordEditor(table, title, row)}
      onDelete={removable ? row => deleteModuleRecord(table, title, row) : undefined}
    />
  );

  const cryptoRows = (rows: JsonRow[]) => (rows || []).filter(row => asText(row.symbol).toUpperCase().endsWith('USDT'));
  const cfdRows = (rows: JsonRow[]) => (rows || []).filter(row => !asText(row.symbol).toUpperCase().endsWith('USDT'));

  return (
    <div className="min-h-screen bg-slate-950/20 p-4 md:p-6">
      <div className="mx-auto max-w-[1800px]">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/')} className="rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-slate-400 transition hover:border-purple-500/50 hover:text-white" aria-label="Back to trading platform">
                <ArrowLeft size={22} />
              </button>
              <div className="rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 p-2.5 shadow-lg shadow-purple-500/20">
                <ShieldCheck size={25} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Administration CRM</h1>
                <p className="text-sm text-slate-400">Manage customers, funds, robot returns and platform records.</p>
              </div>
            </div>
          </div>
          <button onClick={() => void refreshAll()} className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-slate-300 hover:border-purple-500/50 hover:text-white">
            <RefreshCw size={16} className={loadingUsers || loadingWorkspace ? 'animate-spin' : ''} /> Refresh CRM
          </button>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            ['Customers', stats.total_users, Users],
            ['Pending KYC', stats.pending_kyc, FileText],
            ['Active robots', stats.active_robots, Bot],
            ['Available EUR', formatFiat(stats.total_usdt), Coins],
            ['Robot allocation', formatFiat(stats.total_robot_allocated), Wallet]
          ].map(([label, value, Icon]) => {
            const StatIcon = Icon as React.ElementType;
            return (
              <div key={String(label)} className={`${panelClass} p-4`}>
                <div className="mb-2 flex items-center gap-2 text-xs text-slate-400"><StatIcon size={15} />{String(label)}</div>
                <div className="truncate text-xl font-bold text-white">{String(value)}</div>
              </div>
            );
          })}
        </div>

        {message && (
          <div className={`mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${message.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>
            {message.type === 'success' ? <CheckCircle2 size={17} /> : <XCircle size={17} />}{message.text}
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className={`${panelClass} h-fit overflow-hidden xl:sticky xl:top-4`}>
            <div className="border-b border-slate-700/70 p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search users or UUID..." className={`${fieldClass} pl-9`} />
              </div>
            </div>
            <div className="max-h-[68vh] overflow-y-auto p-2">
              {loadingUsers ? (
                <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-400"><Loader2 className="animate-spin" size={18} />Loading users</div>
              ) : users.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">No users found</div>
              ) : users.map(user => (
                <button key={user.id} onClick={() => setSelectedUserId(user.id)} className={`mb-1 w-full rounded-xl border p-3 text-left transition ${selectedUserId === user.id ? 'border-purple-500/50 bg-purple-500/15' : 'border-transparent hover:border-slate-700 hover:bg-white/[0.03]'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{displayName(user)}</div>
                      <div className="truncate text-xs text-slate-500">{user.email}</div>
                    </div>
                    {user.is_admin && <ShieldCheck size={15} className="shrink-0 text-purple-400" />}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className={user.robot_active ? 'text-emerald-400' : 'text-slate-500'}>{user.robot_active ? 'Robot active' : user.kyc_status?.replaceAll('_', ' ')}</span>
                    <span className="font-mono text-slate-300">{formatFiat(asNumber(user.usdt_balance))}</span>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <main className="min-w-0">
            {!selectedUserId ? (
              <div className={`${panelClass} flex min-h-[420px] items-center justify-center p-8 text-center text-slate-500`}>Select a customer to open their CRM workspace.</div>
            ) : loadingWorkspace || !workspace || !profile ? (
              <div className={`${panelClass} flex min-h-[420px] items-center justify-center gap-2 text-slate-400`}><Loader2 className="animate-spin" />Loading customer workspace</div>
            ) : (
              <>
                <div className={`${panelClass} mb-5 p-5`}>
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-xl font-bold text-white">{displayName(profile)}</h2>
                        {profile.is_admin && <span className="rounded-full bg-purple-500/15 px-2 py-1 text-xs text-purple-300">Admin</span>}
                      </div>
                      <p className="mt-1 truncate text-sm text-slate-400">{profile.email} · {profile.id}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-right text-sm">
                      <div><div className="text-xs text-slate-500">EUR</div><div className="font-semibold text-white">{formatFiat(asNumber(workspace.balance.usdt_balance))}</div></div>
                      <div><div className="text-xs text-slate-500">Robot</div><div className="font-semibold text-white">{formatFiat(asNumber(workspace.robot.allocated_balance))}</div></div>
                      <div><div className="text-xs text-slate-500">KYC</div><div className="font-semibold capitalize text-white">{asText(profile.kyc_status).replaceAll('_', ' ')}</div></div>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-800 pt-4">
                    {tabs.map(item => {
                      const Icon = item.icon;
                      return <button key={item.key} onClick={() => setTab(item.key)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm ${tab === item.key ? 'bg-purple-500 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}><Icon size={15} />{item.label}</button>;
                    })}
                  </div>
                </div>

                <div className="mb-5 grid gap-3 md:grid-cols-[1fr_auto]">
                  <input value={reason} onChange={event => setReason(event.target.value)} placeholder="Reason for audited changes" className={fieldClass} />
                  <div className="flex items-center rounded-xl border border-slate-700 bg-slate-900/70 px-4 text-xs text-slate-400">All changes are audited</div>
                </div>

                {tab === 'dashboard' && (
                  <div className="space-y-5">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {[
                        ['Total wallet', `$${money(asNumber(workspace.balance.usdt_balance) + asNumber(workspace.robot.allocated_balance))}`, Wallet],
                        ['Open positions', (workspace.futures_positions || []).length + (workspace.prop_positions || []).length, TrendingUp],
                        ['Orders', (workspace.spot_orders || []).length + (workspace.futures_orders || []).length + (workspace.prop_orders || []).length, ReceiptText],
                        ['Support cases', (workspace.conversations || []).length, Headphones]
                      ].map(([label, value, Icon]) => {
                        const DashboardIcon = Icon as React.ElementType;
                        return <div key={String(label)} className={`${panelClass} p-4`}><div className="mb-2 flex items-center gap-2 text-xs text-slate-400"><DashboardIcon size={15} />{String(label)}</div><div className="text-xl font-bold text-white">{String(value)}</div></div>;
                      })}
                    </div>
                    <div className="grid gap-5 2xl:grid-cols-2">
                      <RecordSection title="Recent transactions" rows={(workspace.transactions || []).slice(0, 20)} />
                      <RecordSection title="Portfolio snapshots" rows={workspace.portfolio_snapshots || []} />
                      <RecordSection title="Favorite instruments" rows={workspace.favorites || []} />
                      <RecordSection title="Recent trading activity" rows={workspace.trading_logs || []} />
                    </div>
                  </div>
                )}

                {tab === 'profile' && (
                  <div className="grid gap-5 lg:grid-cols-2">
                    <section className={`${panelClass} p-5`}>
                      <h3 className="mb-4 font-semibold text-white">Identity and account</h3>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {[['first_name', 'First name'], ['last_name', 'Last name'], ['country', 'Country'], ['phone_number', 'Phone number']].map(([key, label]) => (
                          <label key={key} className="text-xs text-slate-400">{label}<input value={String(profileForm[key] || '')} onChange={event => setProfileForm(current => ({ ...current, [key]: event.target.value }))} className={`${fieldClass} mt-1.5`} /></label>
                        ))}
                        <label className="text-xs text-slate-400">KYC status<select value={String(profileForm.kyc_status)} onChange={event => setProfileForm(current => ({ ...current, kyc_status: event.target.value }))} className={`${fieldClass} mt-1.5`}><option value="not_verified">Not verified</option><option value="pending">Pending</option><option value="verified">Verified</option></select></label>
                        <div className="flex items-end rounded-xl border border-slate-700 p-3">
                          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={Boolean(profileForm.is_admin)} onChange={event => setProfileForm(current => ({ ...current, is_admin: event.target.checked }))} />Administrator</label>
                        </div>
                      </div>
                    </section>
                    <section className={`${panelClass} p-5`}>
                      <h3 className="mb-4 font-semibold text-white">Leverage limits</h3>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {['forex', 'commodities', 'stocks', 'futures'].flatMap(group => ([
                          [`min_leverage_${group}`, `${group} minimum`],
                          [`max_leverage_${group}`, `${group} maximum`]
                        ])).map(([key, label]) => (
                          <label key={key} className="text-xs capitalize text-slate-400">{label}<input type="number" min="1" value={String(profileForm[key] || '')} onChange={event => setProfileForm(current => ({ ...current, [key]: event.target.value }))} className={`${fieldClass} mt-1.5`} /></label>
                        ))}
                      </div>
                    </section>
                    <section className={`${panelClass} p-5 lg:col-span-2`}>
                      <h3 className="mb-4 font-semibold text-white">KYC, security and referral controls</h3>
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        {[['document_id_url', 'Identity document URL'], ['document_selfie_url', 'Selfie document URL'], ['referral_code', 'Referral code'], ['referred_by', 'Referrer user UUID'], ['referral_count', 'Referral count'], ['total_referral_earnings', 'Total referral earnings'], ['referral_commission_rate', 'Commission rate (0.01 = 1%)']].map(([key, label]) => (
                          <label key={key} className="text-xs text-slate-400">{label}<input value={String(profileForm[key] || '')} onChange={event => setProfileForm(current => ({ ...current, [key]: event.target.value }))} className={`${fieldClass} mt-1.5`} /></label>
                        ))}
                        <label className="flex items-center gap-2 self-end rounded-xl border border-slate-700 p-3 text-sm text-slate-300"><input type="checkbox" checked={Boolean(profileForm.two_factor_required)} onChange={event => setProfileForm(current => ({ ...current, two_factor_required: event.target.checked }))} />Require two-factor authentication</label>
                      </div>
                    </section>
                    <button onClick={saveProfile} disabled={saving !== null} className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 px-4 py-3 font-semibold text-white disabled:opacity-50 lg:col-span-2">{saving === 'profile' ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}Save profile controls</button>
                    <section className={`${panelClass} p-5`}>
                      <h3 className="font-semibold text-white">Supabase Auth password</h3>
                      <p className="mb-4 mt-1 text-xs text-slate-500">Set a new sign-in password for this customer. The password is never stored in the CRM audit log.</p>
                      {profile.id === currentAdminId && <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">This is your current administrator account. After changing its password, you will be signed out and must log in with the new password.</div>}
                      <input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="New password (minimum 8 characters)" className={fieldClass} />
                      <button onClick={() => void changeAuthPassword()} disabled={saving !== null || newPassword.length < 8 || !reason.trim()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 font-semibold text-white disabled:opacity-50">{saving === 'auth-password' ? <Loader2 className="animate-spin" size={17} /> : <ShieldCheck size={17} />}Change Auth password</button>
                    </section>
                    <section className="rounded-2xl border border-red-500/35 bg-red-500/[0.07] p-5 shadow-xl shadow-black/10">
                      <h3 className="font-semibold text-red-200">Delete customer permanently</h3>
                      <p className="mb-4 mt-1 text-xs text-red-200/60">Deletes the Supabase Auth identity and cascades cleanup across this customer's wallet, robot, orders, positions, deposits, staking, referrals, messages and profile.</p>
                      {profile.id === currentAdminId ? (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">Your current administrator account cannot delete itself.</div>
                      ) : (
                        <>
                          <input value={deleteConfirmation} onChange={event => setDeleteConfirmation(event.target.value)} placeholder={`Type ${profile.email} to confirm`} className={`${fieldClass} border-red-500/30 focus:border-red-400 focus:ring-red-500/20`} />
                          <button onClick={() => void deleteUserPermanently()} disabled={saving !== null || !reason.trim() || deleteConfirmation.trim().toLowerCase() !== profile.email.toLowerCase()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 font-semibold text-white disabled:opacity-40">{saving === 'delete-user' ? <Loader2 className="animate-spin" size={17} /> : <Trash2 size={17} />}Delete user and all data</button>
                        </>
                      )}
                    </section>
                  </div>
                )}

                {tab === 'wallet' && (
                  <div className="space-y-5">
                    <section className={`${panelClass} p-5`}>
                      <h3 className="mb-4 font-semibold text-white">Primary balances</h3>
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="text-xs text-slate-400">EUR balance<input type="number" min="0" step="0.01" value={balanceForm.usdt} onChange={event => setBalanceForm(current => ({ ...current, usdt: event.target.value }))} className={`${fieldClass} mt-1.5`} /></label>
                        <label className="text-xs text-slate-400">BTC balance<input type="number" min="0" step="0.00000001" value={balanceForm.btc} onChange={event => setBalanceForm(current => ({ ...current, btc: event.target.value }))} className={`${fieldClass} mt-1.5`} /></label>
                      </div>
                      <button onClick={saveBalances} disabled={saving !== null || !reason.trim()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-purple-500 px-4 py-3 font-semibold text-white disabled:opacity-50">{saving === 'balances' ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}Save wallet balances</button>
                    </section>
                    <section className={`${panelClass} p-5`}>
                      <h3 className="mb-4 font-semibold text-white">Crypto assets</h3>
                      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                        <input value={assetForm.symbol} onChange={event => setAssetForm(current => ({ ...current, symbol: event.target.value.toUpperCase() }))} placeholder="Asset, e.g. ETH" className={fieldClass} />
                        <input type="number" min="0" value={assetForm.balance} onChange={event => setAssetForm(current => ({ ...current, balance: event.target.value }))} placeholder="Balance" className={fieldClass} />
                        <button onClick={saveAsset} disabled={saving !== null || !assetForm.symbol.trim() || !reason.trim()} className="rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Set asset</button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {workspace.assets.filter(asset => !['USDT', 'BTC'].includes(asText(asset.asset_symbol))).map(asset => <button key={asText(asset.id)} onClick={() => setAssetForm({ symbol: asText(asset.asset_symbol), balance: asText(asset.balance) })} className="rounded-xl border border-slate-700 bg-slate-950/40 p-3 text-left hover:border-purple-500/50"><div className="text-xs text-slate-500">{asText(asset.asset_symbol)}</div><div className="mt-1 font-mono font-semibold text-white">{money(asset.balance, 8)}</div></button>)}
                      </div>
                    </section>
                    {workspace.bank_details?.id && managedSection('Bank details', 'client_bank_details', [workspace.bank_details], false)}
                    {managedSection('Wallet transactions', 'transactions', workspace.transactions)}
                  </div>
                )}

                {tab === 'swap' && (
                  <div className="space-y-5">
                    <section className={`${panelClass} p-5`}>
                      <h3 className="mb-1 font-semibold text-white">Asset balances</h3>
                      <p className="mb-4 text-xs text-slate-500">Select an asset, enter the exact balance, and save it to this customer.</p>
                      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                        <input value={assetForm.symbol} onChange={event => setAssetForm(current => ({ ...current, symbol: event.target.value.toUpperCase() }))} placeholder="Asset, e.g. ETH" className={fieldClass} />
                        <input type="number" min="0" value={assetForm.balance} onChange={event => setAssetForm(current => ({ ...current, balance: event.target.value }))} placeholder="Balance" className={fieldClass} />
                        <button onClick={saveAsset} disabled={saving !== null || !assetForm.symbol.trim() || !reason.trim()} className="rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Set asset</button>
                      </div>
                    </section>
                    {managedSection('All asset records', 'user_assets', workspace.assets)}
                    {managedSection('Spot / swap orders', 'spot_orders', workspace.spot_orders)}
                    {managedSection('Swap-related transactions', 'transactions', (workspace.transactions || []).filter(item => ['swap', 'trade', 'buy', 'sell'].some(term => asText(item.type).toLowerCase().includes(term))))}
                  </div>
                )}

                {tab === 'futures' && (
                  <div className="space-y-5">
                    {managedSection('Crypto futures positions', 'futures_positions', cryptoRows(workspace.futures_positions))}
                    {managedSection('Crypto futures orders', 'futures_orders', cryptoRows(workspace.futures_orders))}
                    {managedSection('Crypto futures history', 'futures_position_history', cryptoRows(workspace.futures_history))}
                    {managedSection('Crypto futures swap charges', 'position_swap_charges', cryptoRows(workspace.swap_charges))}
                  </div>
                )}

                {tab === 'cfd' && (
                  <div className="space-y-5">
                    {managedSection('CFD positions', 'futures_positions', cfdRows(workspace.futures_positions))}
                    {managedSection('CFD orders', 'futures_orders', cfdRows(workspace.futures_orders))}
                    {managedSection('CFD position history', 'futures_position_history', cfdRows(workspace.futures_history))}
                    {managedSection('CFD overnight swap charges', 'position_swap_charges', cfdRows(workspace.swap_charges))}
                  </div>
                )}

                {tab === 'prop' && (
                  <div className="space-y-5">
                    {managedSection('Prop challenge accounts', 'prop_account_balances', workspace.prop_accounts)}
                    {managedSection('Prop positions', 'prop_positions', workspace.prop_positions)}
                    {managedSection('Prop orders', 'prop_orders', workspace.prop_orders)}
                    {managedSection('Prop position history', 'prop_position_history', workspace.prop_history)}
                    {managedSection('Prop activity logs', 'prop_logs', workspace.prop_logs)}
                  </div>
                )}

                {tab === 'robot' && (
                  <div className="space-y-5">
                    <section className={`${panelClass} p-5`}>
                      <div className="mb-4 flex items-center justify-between"><h3 className="font-semibold text-white">Robot configuration</h3><label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={Boolean(robotForm.is_active)} onChange={event => setRobotForm(current => ({ ...current, is_active: event.target.checked }))} />Active</label></div>
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <label className="text-xs text-slate-400">CRM daily profit %<input type="number" min="0" step="0.01" value={String(robotForm.custom_daily_profit_percentage ?? '')} placeholder="Blank = tier rate" onChange={event => setRobotForm(current => ({ ...current, custom_daily_profit_percentage: event.target.value }))} className={`${fieldClass} mt-1.5`} /></label>
                        <label className="text-xs text-slate-400">Allocated EUR<input type="number" min="0" step="0.01" value={String(robotForm.allocated_balance)} onChange={event => setRobotForm(current => ({ ...current, allocated_balance: event.target.value }))} className={`${fieldClass} mt-1.5`} /></label>
                        <label className="text-xs text-slate-400">Today's profit (EUR)<input type="number" min="0" step="0.01" value={String(robotForm.todays_profit)} onChange={event => setRobotForm(current => ({ ...current, todays_profit: event.target.value }))} className={`${fieldClass} mt-1.5`} /></label>
                        <label className="text-xs text-slate-400">Strategy<select value={String(robotForm.strategy)} onChange={event => setRobotForm(current => ({ ...current, strategy: event.target.value }))} className={`${fieldClass} mt-1.5`}><option value="triangular">Triangular</option><option value="spatial">Spatial</option><option value="statistical">Statistical</option><option value="latency">Latency</option></select></label>
                        <label className="text-xs text-slate-400">Minimum profit threshold %<input type="number" min="0" step="0.01" value={String(robotForm.min_profit_threshold)} onChange={event => setRobotForm(current => ({ ...current, min_profit_threshold: event.target.value }))} className={`${fieldClass} mt-1.5`} /></label>
                        <label className="text-xs text-slate-400">Maximum trade amount (EUR)<input type="number" min="0" step="1" value={String(robotForm.max_trade_amount)} onChange={event => setRobotForm(current => ({ ...current, max_trade_amount: event.target.value }))} className={`${fieldClass} mt-1.5`} /></label>
                      </div>
                      <button onClick={saveRobot} disabled={saving !== null} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{saving === 'robot' ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}Save robot settings</button>
                    </section>
                    <section className={`${panelClass} p-5`}>
                      <h3 className="font-semibold text-white">Manual profit credit</h3><p className="mb-4 mt-1 text-xs text-slate-400">Adds an exact profit amount immediately. It counts as today's automated credit and is logged.</p>
                      <div className="grid gap-3 md:grid-cols-[1fr_auto]"><input type="number" min="0" step="0.01" value={manualProfit} onChange={event => setManualProfit(event.target.value)} placeholder="Profit amount in EUR" className={fieldClass} /><button onClick={creditProfit} disabled={saving !== null || Number(manualProfit) <= 0 || !reason.trim()} className="rounded-xl bg-emerald-600 px-6 py-2.5 font-semibold text-white disabled:opacity-50">Credit profit</button></div>
                    </section>
                    {managedSection('Robot profit history', 'transactions', workspace.transactions.filter(item => item.type === 'robot_profit'))}
                    {managedSection('Robot trading logs', 'trading_logs', workspace.trading_logs)}
                  </div>
                )}

                {tab === 'staking' && <div className="space-y-5">{managedSection('Staking positions and earnings', 'user_stakes', workspace.stakes)}</div>}

                {tab === 'wheel' && (
                  <div className="space-y-5">
                    {managedSection('Spin Wheel rewards', 'transactions', (workspace.transactions || []).filter(item => Boolean(item.wheel_spun) || asText(item.type).includes('wheel')))}
                    {managedSection('Giveaway tickets', 'giveaway_tickets', workspace.giveaway_tickets)}
                    {managedSection('Giveaway entries', 'giveaway_entries', workspace.giveaway_entries)}
                    {managedSection('Giveaway winnings', 'giveaway_winners', workspace.giveaway_winners)}
                  </div>
                )}

                {tab === 'deposits' && (
                  <div className="space-y-5">
                    {managedSection('Deposit addresses', 'crypto_deposit_addresses', workspace.deposit_addresses)}
                    {managedSection('On-chain deposits', 'crypto_deposits', workspace.deposits)}
                    {managedSection('Crypto payment requests', 'crypto_payment_requests', workspace.payment_requests)}
                    {managedSection('Card / sandbox payments', 'sandbox_payment_transactions', workspace.sandbox_payments)}
                  </div>
                )}

                {tab === 'referrals' && (
                  <div className="space-y-5">
                    <section className={`${panelClass} p-5`}><h3 className="font-semibold text-white">Referral account controls</h3><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[['referral_code', 'Referral code'], ['referred_by', 'Referrer user UUID'], ['referral_count', 'Referral count'], ['total_referral_earnings', 'Total referral earnings'], ['referral_commission_rate', 'Commission rate (0.01 = 1%)']].map(([key, label]) => <label key={key} className="text-xs text-slate-400">{label}<input value={String(profileForm[key] || '')} onChange={event => setProfileForm(current => ({ ...current, [key]: event.target.value }))} className={`${fieldClass} mt-1.5`} /></label>)}</div><button onClick={saveProfile} disabled={saving !== null || !reason.trim()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-purple-500 px-4 py-3 font-semibold text-white disabled:opacity-50">{saving === 'profile' ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}Save referral controls</button></section>
                    {managedSection('Referral earnings', 'referral_earnings', workspace.referral_earnings)}
                  </div>
                )}

                {tab === 'support' && (
                  <div className="space-y-5">
                    <section className={`${panelClass} p-5`}>
                      <h3 className="font-semibold text-white">Reply to customer support</h3>
                      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(220px,0.45fr)_1fr_auto]">
                        <select value={supportConversationId} onChange={event => setSupportConversationId(event.target.value)} className={fieldClass}><option value="">Select conversation</option>{(workspace.conversations || []).map(item => <option key={asText(item.id)} value={asText(item.id)}>{asText(item.subject) || asText(item.id)}</option>)}</select>
                        <input value={supportReply} onChange={event => setSupportReply(event.target.value)} placeholder="Write the administrator reply..." className={fieldClass} />
                        <button onClick={sendSupportReply} disabled={saving !== null || !supportConversationId || !supportReply.trim()} className="rounded-xl bg-purple-500 px-5 py-2.5 font-semibold text-white disabled:opacity-50">Send reply</button>
                      </div>
                    </section>
                    {managedSection('Support conversations', 'conversations', workspace.conversations)}
                    <RecordSection title="Conversation messages" rows={(workspace.support_messages || []).filter(item => !supportConversationId || asText(item.conversation_id) === supportConversationId)} />
                    <div className="grid gap-5 xl:grid-cols-2">
                      <section className={`${panelClass} p-5`}><h3 className="font-semibold text-white">Internal CRM note</h3><p className="mb-3 mt-1 text-xs text-slate-500">Visible to administrators only.</p><textarea rows={5} value={note} onChange={event => setNote(event.target.value)} className={fieldClass} placeholder="Add an internal note..." /><button onClick={addNote} disabled={saving !== null || !note.trim()} className="mt-3 w-full rounded-xl bg-slate-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50">Add note</button></section>
                      <RecordSection title="Internal notes" rows={workspace.notes || []} />
                    </div>
                  </div>
                )}

                {tab === 'notifications' && (
                  <div className="space-y-5">
                    <section className={`${panelClass} p-5`}><h3 className="font-semibold text-white">Send user notification</h3><p className="mb-3 mt-1 text-xs text-slate-500">Appears in the customer's notification feed.</p><textarea rows={4} value={notification} onChange={event => setNotification(event.target.value)} className={fieldClass} placeholder="Write a customer-facing message..." /><button onClick={sendNotification} disabled={saving !== null || !notification.trim()} className="mt-3 w-full rounded-xl bg-purple-500 px-4 py-2.5 font-semibold text-white disabled:opacity-50">Send notification</button></section>
                    {managedSection('Customer notifications', 'notifications', workspace.notifications)}
                  </div>
                )}

                {tab === 'audit' && (
                  <div className="space-y-5">
                    <RecordSection title="Administrator action audit" rows={workspace.audit_logs || []} />
                    <RecordSection title="All platform trading logs" rows={workspace.trading_logs || []} />
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
      {editingRecord && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setEditingRecord(null); }}>
          <div className={`${panelClass} max-h-[90vh] w-full max-w-4xl overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
              <div><h2 className="font-semibold text-white">Edit {editingRecord.title}</h2><p className="mt-1 text-xs text-slate-500">Record {asText(editingRecord.row.id)}</p></div>
              <button onClick={() => setEditingRecord(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><XCircle size={20} /></button>
            </div>
            <div className="max-h-[calc(90vh-145px)] overflow-y-auto p-5">
              <div className="grid gap-4 md:grid-cols-2">
                {Object.entries(recordForm).map(([key, value]) => {
                  const original = editingRecord.row[key];
                  const isLong = typeof original === 'object' || String(value).length > 100;
                  return (
                    <label key={key} className={`text-xs text-slate-400 ${isLong ? 'md:col-span-2' : ''}`}>
                      {key.replaceAll('_', ' ')}
                      {typeof original === 'boolean' ? (
                        <span className="mt-1.5 flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/60 px-3 text-sm text-white"><input type="checkbox" checked={value as boolean} onChange={event => setRecordForm(current => ({ ...current, [key]: event.target.checked }))} />{value ? 'Enabled' : 'Disabled'}</span>
                      ) : isLong ? (
                        <textarea rows={typeof original === 'object' ? 7 : 3} value={String(value)} onChange={event => setRecordForm(current => ({ ...current, [key]: event.target.value }))} className={`${fieldClass} mt-1.5 font-mono`} />
                      ) : (
                        <input type={typeof original === 'number' ? 'number' : 'text'} step="any" value={String(value)} onChange={event => setRecordForm(current => ({ ...current, [key]: event.target.value }))} className={`${fieldClass} mt-1.5`} />
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-700 px-5 py-4">
              <button onClick={() => setEditingRecord(null)} className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-300">Cancel</button>
              <button onClick={saveModuleRecord} disabled={saving !== null || !reason.trim()} className="flex items-center gap-2 rounded-xl bg-purple-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving === 'record' ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}Save audited changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCRMPage;
