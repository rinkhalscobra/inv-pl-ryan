import { supabase } from './supabaseClient';

const HEARTBEAT_INTERVAL_MS = 25_000;
const PRESENCE_SESSION_KEY = 'atlas-presence-session-id';

let activeUserId: string | null = null;
let activeAccessToken: string | null = null;
let heartbeatTimer: number | null = null;
let listenersAttached = false;

const getTabSessionId = () => {
  const existing = window.sessionStorage.getItem(PRESENCE_SESSION_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.sessionStorage.setItem(PRESENCE_SESSION_KEY, created);
  return created;
};

const touchPresence = async () => {
  if (!activeUserId) return;
  const { error } = await supabase.rpc('touch_client_presence', {
    p_session_id: getTabSessionId(),
  });
  if (error) console.warn('Could not refresh client presence:', error.message);
};

const endPresenceWithKeepalive = () => {
  if (!activeUserId || !activeAccessToken) return;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  void fetch(`${supabaseUrl}/rest/v1/rpc/end_client_presence`, {
    method: 'POST',
    keepalive: true,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${activeAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_session_id: getTabSessionId() }),
  }).catch(() => {
    // A killed process may cancel even a keepalive request. The server-side
    // heartbeat expiry is the authoritative fallback in that case.
  });
};

const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible') void touchPresence();
};

const handleBeforeUnload = (event: BeforeUnloadEvent) => {
  if (!activeUserId) return;
  event.preventDefault();
  // Modern browsers intentionally ignore custom text and show their own
  // security-safe confirmation message.
  event.returnValue = '';
};

const attachListeners = () => {
  if (listenersAttached) return;
  window.addEventListener('online', touchPresence);
  window.addEventListener('pagehide', endPresenceWithKeepalive);
  window.addEventListener('beforeunload', handleBeforeUnload);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  listenersAttached = true;
};

const detachListeners = () => {
  if (!listenersAttached) return;
  window.removeEventListener('online', touchPresence);
  window.removeEventListener('pagehide', endPresenceWithKeepalive);
  window.removeEventListener('beforeunload', handleBeforeUnload);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  listenersAttached = false;
};

const stopHeartbeat = () => {
  if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  detachListeners();
};

export const syncClientPresence = (userId: string | null, accessToken?: string | null) => {
  if (!userId) {
    activeUserId = null;
    activeAccessToken = null;
    stopHeartbeat();
    return;
  }

  activeAccessToken = accessToken || activeAccessToken;
  if (activeUserId === userId && heartbeatTimer !== null) return;

  stopHeartbeat();
  activeUserId = userId;
  attachListeners();
  void touchPresence();
  heartbeatTimer = window.setInterval(() => void touchPresence(), HEARTBEAT_INTERVAL_MS);
};

export const endClientPresence = async () => {
  if (!activeUserId) return;
  stopHeartbeat();
  const { error } = await supabase.rpc('end_all_client_presence');
  if (error) console.warn('Could not close client presence:', error.message);
  activeUserId = null;
  activeAccessToken = null;
};
