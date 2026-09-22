import { ipAddress, next } from '@vercel/functions';
import { isAllowedAdminIp } from './src/constants/adminIpAllowlist';

export const config = { matcher: ['/admin', '/admin/:path*'] };

export default function middleware(request: Request) {
  const ip = ipAddress(request);
  if (!isAllowedAdminIp(ip)) {
    return new Response('Forbidden', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  return next();
}
