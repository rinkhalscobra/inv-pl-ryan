import { supabase } from './supabaseClient';

type ClientAccessResponse = { token_hash?: string; error?: string };

const errorDetail = async (error: { message: string; context?: Response }) => {
  const response = error.context;
  if (response instanceof Response) {
    const payload = await response.clone().json().catch(() => null) as ClientAccessResponse | null;
    if (payload?.error) return payload.error;
  }
  return error.message;
};

export async function openClientDashboard(clientId: string) {
  const clientWindow = window.open('about:blank', '_blank');
  if (!clientWindow) throw new Error('Allow pop-ups for this website to open the client dashboard.');
  try {
    clientWindow.opener = null;
    clientWindow.location.replace('/client-access#waiting');
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) throw new Error('Your CRM session expired. Sign in again.');
    const { data, error } = await supabase.functions.invoke('crm-client-access', {
      headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
      body: { target_user_id: clientId },
    });
    if (error) throw new Error(await errorDetail(error));
    const payload = data as ClientAccessResponse | null;
    if (!payload?.token_hash) throw new Error(payload?.error || 'The server did not issue a client session.');
    clientWindow.location.replace(`/client-access#token_hash=${encodeURIComponent(payload.token_hash)}`);
  } catch (cause) {
    clientWindow.close();
    throw cause;
  }
}
