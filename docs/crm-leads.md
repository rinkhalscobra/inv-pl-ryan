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

The response reports `accepted`, `duplicates`, and `invalid`. Lead email is
the deduplication key across all sources. A rotated or paused key stops working
immediately. The endpoint does not allow browser CORS requests; keep the key
on the affiliate's server.

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
