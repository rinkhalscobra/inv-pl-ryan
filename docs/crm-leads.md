# CRM lead intake

Open **Administration CRM → Lead inbox** from an approved administrator IP.

## Affiliate API

Create an affiliate connection in the CRM and copy the generated key. The key
is shown once, stored only as a SHA-256 hash, and can be rotated or paused in
the CRM. Give the affiliate this server-to-server endpoint:

`https://vvomlpkrfehkgkxnglrn.supabase.co/functions/v1/affiliate-leads`

Send a POST request with `Content-Type: application/json` and
`x-affiliate-key: aff_live_...`. A single lead or up to 100 leads per request
are accepted:

```json
{
  "leads": [
    {
      "email": "jane@example.com",
      "first_name": "Jane",
      "last_name": "Doe",
      "phone": "+1 555 0100",
      "country": "US",
      "campaign": "Spring campaign",
      "external_id": "partner-123"
    }
  ]
}
```

The response reports `accepted`, `duplicates`, and `invalid`, plus a `results`
array. Every visible result includes an opaque `tracking_id`, the affiliate's
`external_id`, the current partner-facing status, and timestamps. Store either
`tracking_id` or a unique `external_id` with the affiliate's record.

Lead email is the deduplication key across all sources. A rotated or paused key
stops working immediately. The endpoint does not allow browser CORS requests;
keep the key on the affiliate's server.

When the same affiliate resends its own unregistered lead with a corrected,
non-empty phone number, the server revalidates the number and refreshes the
automatic Office routing. It never updates another source's duplicate or a
lead whose Office was manually classified.

### Current lead status

Use the same server-side key to retrieve a current status snapshot:

`GET https://vvomlpkrfehkgkxnglrn.supabase.co/functions/v1/affiliate-leads/status?tracking_id=TRACKING_UUID`

The endpoint also accepts `external_id`, `updated_after`, and `limit` (maximum
100). Every lead contains `ftd_status` and `ftd_date`. Results are always
restricted to the affiliate connection represented by the key. It never
exposes CRM notes, assigned staff, balances, deposit amounts, or other
affiliates' leads.

### Near-real-time status events

For a reliable ordered feed, poll this endpoint from the affiliate's backend:

`GET https://vvomlpkrfehkgkxnglrn.supabase.co/functions/v1/affiliate-leads/events?after=0&limit=100`

Each response contains `events`, `next_cursor`, and `has_more`. Save
`next_cursor`, use it as the next `after` value, and poll again every five
seconds. Event cursors are ordered and make reconnecting safe: after a restart,
continue from the last cursor that the affiliate successfully stored.

Use `from` and `to` with either `YYYY-MM-DD` dates or ISO-8601 timestamps that
include `Z` or an explicit timezone offset. Date-only `to` values include the
entire UTC day. The default `date_field=event` filters `occurred_at`; use
`date_field=lead` for the original lead-received date or `date_field=ftd` for
the exact first-deposit date:

```text
GET /affiliate-leads/events?from=2026-09-01&to=2026-09-29&limit=100
GET /affiliate-leads/events?date_field=lead&from=2026-09-01&to=2026-09-29&limit=100
GET /affiliate-leads/events?date_field=ftd&from=2026-09-01&to=2026-09-29&after=0&limit=100
```

Every event contains `lead_received_at`, `ftd_status`, and `ftd_date`. The FTD
date is the earliest qualifying completed wallet credit timestamp from the
transaction ledger. It is not manufactured from the CRM status-change time.
Balance adjustments, sandbox credits, failed/reversed deposits, and non-positive
amounts do not qualify. Legacy transactions without an authoritative
wallet-credit time are also excluded; the API returns no FTD date instead of
inventing one.

Partner-facing statuses are `received`, `contact_attempted`, `follow_up`,
`invalid`, `not_qualified`, `processing`, `registered`, and `converted`. The
stream contains the initial `lead.received` event, later `lead.status_changed`
events, and a canonical `lead.ftd` event at the exact first-deposit time.

```js
const endpoint =
  "https://vvomlpkrfehkgkxnglrn.supabase.co/functions/v1/affiliate-leads";
const headers = { "x-affiliate-key": process.env.AFFILIATE_API_KEY };
let cursor = Number(process.env.LAST_AFFILIATE_CURSOR || 0);

for (;;) {
  const response = await fetch(`${endpoint}/events?after=${cursor}&limit=100`, {
    headers,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Status feed failed");

  for (const event of payload.events) {
    console.log(
      event.external_id,
      event.status,
      event.ftd_status,
      event.ftd_date,
      event.occurred_at,
    );
    // Update the affiliate database idempotently using event.cursor.
    cursor = event.cursor;
  }

  if (!payload.has_more) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
```

## Google Sheets

Connect a Google Sheets URL in the CRM. The sheet needs an `Email` header and
must be readable as CSV using the provided URL. The server checks active
sheets every ten minutes; **Sync now** runs immediately. The CRM shows the last
sync time or error. If Google requires a sign-in to download the CSV, this URL
method cannot read it. Publishing a sheet or enabling link access can expose
lead information to others who have the URL, so restrict access accordingly.

## CSV and Excel

Upload `.csv` or `.xlsx` files up to 5 MB and 5,000 lead rows. `Email` is
required. `First Name`, `Last Name`, `Full Name`, `Phone`, `Country`,
`Campaign`, `Notes`, and `Lead ID` are recognized when present. Files are read
in the browser and submitted to the protected admin function in batches.

## Register a lead

Use **Register** on a new lead. An administrator may assign the client to an
agent or retention manager. The server sends a Supabase invitation, creates
the client profile using the existing CRM account setup, and links the lead to
the account. Existing emails are linked without creating a duplicate user.
Invitation delivery requires Supabase Auth email sending and a production
redirect URL configured for `https://atlasmarketstrade.com/reset-password`.
