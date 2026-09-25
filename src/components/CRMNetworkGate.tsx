import { useEffect, useState, type ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function CRMNetworkGate({ children }: { children: ReactNode }) {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.rpc('crm_staff_network_allowed').then(({ data, error }) => {
      if (active) setAllowed(!error && data === true);
    });
    return () => { active = false; };
  }, []);

  if (allowed === null) return <div className="flex min-h-screen items-center justify-center bg-[#0b0e11] text-sm text-slate-400">Checking company network…</div>;
  if (!allowed) return <div className="flex min-h-screen items-center justify-center bg-[#0b0e11] px-6 text-slate-200"><div className="max-w-md rounded-2xl border border-white/[0.1] bg-[#151b26] p-8 text-center shadow-2xl"><ShieldAlert className="mx-auto mb-4 text-amber-400" size={32} /><h1 className="text-lg font-semibold text-white">CRM network restricted</h1><p className="mt-2 text-sm text-slate-400">Connect from an IP address approved for your company.</p></div></div>;
  return <>{children}</>;
}
