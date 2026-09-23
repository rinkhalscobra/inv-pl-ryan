import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { bootstrapClientAccess, clientAccessBootstrapPromise } from '../lib/supabaseClient';

export default function ClientAccessPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let authenticationTimeout: number | undefined;
    let handoffTimeout: number | undefined;
    let cancelled = false;

    const clearTimers = () => {
      if (authenticationTimeout) window.clearTimeout(authenticationTimeout);
      if (handoffTimeout) window.clearTimeout(handoffTimeout);
    };

    const startAuthentication = (tokenHash: string, initialPromise?: Promise<string | null> | null) => {
      clearTimers();
      setError(null);
      authenticationTimeout = window.setTimeout(() => {
        if (!cancelled) setError('Client authentication timed out. Close this tab and open the client dashboard again.');
      }, 15_000);
      void (initialPromise || bootstrapClientAccess(tokenHash)).then(result => {
        if (authenticationTimeout) window.clearTimeout(authenticationTimeout);
        if (!cancelled && result) setError(result);
      });
    };

    const processLocation = () => {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const tokenHash = hash.get('token_hash');
      if (tokenHash) {
        startAuthentication(tokenHash, clientAccessBootstrapPromise);
        return;
      }
      if (hash.has('waiting')) {
        handoffTimeout = window.setTimeout(() => {
          if (!cancelled) setError('The client session request did not complete. Close this tab and try Open as client again.');
        }, 20_000);
        return;
      }
      setError('This client access link is missing or has expired.');
    };

    processLocation();
    window.addEventListener('hashchange', processLocation);
    return () => {
      cancelled = true;
      clearTimers();
      window.removeEventListener('hashchange', processLocation);
    };
  }, []);

  return <main className="flex min-h-screen items-center justify-center bg-[#0d1118] px-4 text-slate-100">
    <section className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#151b26] p-7 text-center shadow-2xl">
      {error ? <>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-300"><AlertCircle size={24} /></div>
        <h1 className="mt-4 text-xl font-semibold">Client access unavailable</h1>
        <p className="mt-2 text-sm text-slate-400">{error}</p>
        <button type="button" onClick={() => window.close()} className="mt-6 rounded-lg border border-white/[0.12] px-4 py-2 text-sm text-slate-200 hover:bg-white/[0.05]">Close this tab</button>
      </> : <>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/15 text-violet-300"><ShieldCheck size={23} /></div>
        <Loader2 size={22} className="mx-auto mt-5 animate-spin text-violet-300" />
        <h1 className="mt-3 text-xl font-semibold">Opening client dashboard</h1>
        <p className="mt-2 text-sm text-slate-400">Verifying your CRM access and creating an isolated session.</p>
      </>}
    </section>
  </main>;
}
