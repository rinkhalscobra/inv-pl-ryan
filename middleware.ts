import { ipAddress, next } from '@vercel/functions';

export const config = {
  matcher: ['/admin', '/admin/:path*', '/crm', '/crm/:path*', '/register', '/auth/register', '/signup', '/signup/:path*'],
  runtime: 'nodejs'
};

const forbidden = () => new Response('Forbidden', {
  status: 403,
  headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
});

export default async function middleware(request: Request) {
  const ip = ipAddress(request);
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  const requestUrl = new URL(request.url);
  const isRegistrationRoute = requestUrl.pathname === '/register'
    || requestUrl.pathname === '/auth/register'
    || requestUrl.pathname === '/signup'
    || requestUrl.pathname.startsWith('/signup/');
  if (!url || !key) return isRegistrationRoute ? next() : forbidden();
  if (!ip) return isRegistrationRoute ? next() : forbidden();

  if (isRegistrationRoute) {
    try {
      const response = await fetch(`${url}/rest/v1/rpc/crm_registration_network_route`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_ip: ip }),
        cache: 'no-store',
        signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) return next();
      const companyPath = await response.json() as string | null;
      if (!companyPath || requestUrl.pathname === companyPath) return next();
      const destination = new URL(companyPath, request.url);
      destination.search = requestUrl.search;
      return Response.redirect(destination, 307);
    } catch {
      // Public registration remains available if the route resolver is briefly unavailable.
      return next();
    }
  }

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
