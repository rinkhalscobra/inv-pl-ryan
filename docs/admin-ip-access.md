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
platform owner network is `46.166.172.116`. Company networks are stored with a
`company_id`; they can pass the page-level network gate but every CRM operation
is restricted to that network's company. Within that boundary an administrator
has the complete client-management workflow, including account roles, profile,
KYC, wallet, robot, trading records, deposits, support, password resets, and
account deletion. There are no per-IP UI exceptions after an address is active
in the allowlist. `92.246.87.144` belongs to Vlad, while
Ryan is resolved by its primary network `176.65.136.41`. Ryan's additional
approved networks are `85.206.173.103`, `85.206.173.105`, `85.206.173.107`,
`85.206.173.114`, and `85.206.173.115`. Missing IP headers and allowlist lookup
errors fail closed. Do not accept a client-provided `x-forwarded-for` header as
an administrator address.

The restriction applies to administrator CRM access. The separate staff CRM
route retains its agent and retention role checks and assignment scope.
