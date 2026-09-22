import { ipAddress, next } from '@vercel/functions';

const allowedAdminIps = new Set(['46.166.172.116', '92.246.87.144']);

export const config = { matcher: ['/admin', '/admin/:path*'], runtime: 'nodejs' };

export default function middleware(request: Request) {
  const ip = ipAddress(request);
  if (!ip || !allowedAdminIps.has(ip)) {
    return new Response('Forbidden', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  return next();
}
