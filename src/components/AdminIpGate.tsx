import { useEffect, useState, type ReactNode } from 'react';
import { ShieldAlert, ShieldX } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const VLAD_BLOCKED_IP = '92.246.87.144';

interface CurrentNetworkEntry {
  ip_address: string;
  is_current: boolean;
}

export default function AdminIpGate({ children }: { children: ReactNode }) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [vladBlocked, setVladBlocked] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      supabase.rpc('crm_admin_ip_allowed'),
      supabase.rpc('crm_admin_list_ips')
    ]).then(([accessResult, networksResult]) => {
      if (!active) return;

      const networks = (networksResult.data as CurrentNetworkEntry[] | null) || [];
      setVladBlocked(!networksResult.error && networks.some(network =>
        network.is_current && network.ip_address === VLAD_BLOCKED_IP
      ));
      setAllowed(!accessResult.error && accessResult.data === true);
    });
    return () => { active = false; };
  }, []);

  if (allowed === null) return <div className="flex min-h-screen items-center justify-center bg-[#0b0e11] text-sm text-slate-400">Checking administrator access…</div>;
  if (vladBlocked) return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070b14] px-6 py-12 text-slate-200">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.12),transparent_42%)]" />
      <div className="relative w-full max-w-lg rounded-3xl border border-white/[0.09] bg-[#101725]/95 p-8 text-center shadow-2xl shadow-black/40 sm:p-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-red-400/20 bg-red-500/10 text-red-300 shadow-lg shadow-red-950/20">
          <ShieldX size={34} strokeWidth={1.8} />
        </div>
        <div className="mt-6 text-xs font-semibold uppercase tracking-[0.24em] text-red-300">Access blocked</div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">You are blocked from accessing this CRM</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-400">
          Access to the Vlad CRM workspace has been suspended. Please contact the platform administrator if you believe this is an error.
        </p>
        <div className="mt-7 border-t border-white/[0.08] pt-5 text-xs text-slate-500">
          Reference: CRM access restriction
        </div>
      </div>
    </div>
  );
  if (!allowed) return <div className="flex min-h-screen items-center justify-center bg-[#0b0e11] px-6 text-slate-200">
    <div className="max-w-md rounded-2xl border border-white/[0.1] bg-[#151b26] p-8 text-center shadow-2xl">
      <ShieldAlert className="mx-auto mb-4 text-amber-400" size={32} />
      <h1 className="text-lg font-semibold text-white">Administrator access restricted</h1>
      <p className="mt-2 text-sm text-slate-400">Connect from an approved network to access the CRM.</p>
    </div>
  </div>;
  return <>{children}</>;
}
