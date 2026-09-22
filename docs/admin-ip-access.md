# Administrator CRM network access

`/admin` and `/admin/hierarchy` pass through Vercel Routing Middleware before
the site is served. Supabase independently restricts administrator RPCs and
table policies using the gateway-supplied `cf-connecting-ip`. The user-creation
and KYC-document Edge Functions check that address before processing a request.
The existing administrator account check still applies at every data endpoint.

The current allowlist is `46.166.172.116` and `92.246.87.144`. Update
`middleware.ts`, `src/constants/adminIpAllowlist.ts`, and the database function
`crm_private.admin_ip_allowed()` in a new migration when adding or removing an
address. Deploy the Supabase migration and affected Edge Functions, then deploy
Vercel. Missing IP headers fail closed. Do not accept a client-provided
`x-forwarded-for` header as an administrator address.

The restriction applies to administrator CRM access. The separate staff CRM
route retains its agent and retention role checks and assignment scope.
