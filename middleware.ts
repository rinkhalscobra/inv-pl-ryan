import { ipAddress, next } from '@vercel/functions';

export const config = { matcher: ['/admin', '/admin/:path*'], runtime: 'nodejs' };

const forbidden = () => new Response('Forbidden', {
  status: 403,
  headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
});

export default async function middleware(request: Request) {
  const ip = ipAddress(request);
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!ip || !url || !key) return forbidden();

  try {
    const response = await fetch(`${url}/rest/v1/rpc/crm_is_ip_allowlisted`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_ip: ip }),
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (response.ok && await response.json() === true) return next();
  } catch {
    // Fail closed if the allowlist service is unavailable.
  }
  return forbidden();
}
