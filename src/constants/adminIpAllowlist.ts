export const ADMIN_ALLOWED_IPS = ['46.166.172.116', '92.246.87.144'] as const;

export const isAllowedAdminIp = (ip: string | null | undefined): boolean =>
  !!ip && ADMIN_ALLOWED_IPS.some(allowed => allowed === ip);
