# Administrator CRM network access

`/admin` and its subpages pass through Vercel Routing Middleware before the
site is served. The middleware checks its trusted client IP against the
Supabase-backed allowlist and fails closed when the check is unavailable.
Supabase independently restricts administrator RPCs and table policies using
the gateway-supplied `cf-connecting-ip`. The user-creation and KYC-document
Edge Functions use the same allowlist. Administrator sign-in still applies.

Manage addresses in **Administration CRM → IP access**. Only an administrator
on an already approved network can add or remove an address. The current IP
cannot be removed from its own session, and at least one IP must remain. The
initial list is `46.166.172.116` and `92.246.87.144`. Changes are audited in
`admin_action_logs` and take effect without a new deployment. Missing IP
headers and allowlist lookup errors fail closed. Do not accept a client-provided
`x-forwarded-for` header as an administrator address.

The restriction applies to administrator CRM access. The separate staff CRM
route retains its agent and retention role checks and assignment scope.
