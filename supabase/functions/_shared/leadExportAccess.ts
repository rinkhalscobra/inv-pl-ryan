export const LEAD_EXPORT_IP = "46.166.172.116";

export function canExportLeads(isAdmin: boolean, clientIp: string): boolean {
  return isAdmin && clientIp === LEAD_EXPORT_IP;
}
