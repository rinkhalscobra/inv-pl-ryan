# Open a position for a client

In the CRM, open the corresponding client and choose **Futures**
or **CFD**. The opening form appears above that client's positions. Select the
instrument, Long or Short, quantity, leverage and margin mode. Stop-loss and
take-profit prices are optional. The audit reason above the tabs is required.

Futures quantities use the base asset. CFD quantities use lots; the contract
size appears below the input. Margin values are shown in USD, matching the
existing trading engine's settlement ledger. Prices come from the verified
Twelve Data cache. **Refresh price** refreshes the selected market.

The selected client is explicit in the form and in every request. Changing
clients clears the draft. An order already submitted still belongs to its
original client. Retries with unchanged details reuse their request reference
and return the original position. A different order receives a different
reference.

Administrators and CRM staff with existing access to the selected client and an
approved CRM network can open positions. All five staff roles use their existing
company, office, assignment and Sales/Retention visibility rules. The server
checks the target, quote freshness, order size, leverage,
available margin and risk prices. The position, retry receipt and actor/client
audit are committed together. Opening reserves margin without deducting cash a
second time. The position appears in the client's normal trading dashboard.

The backend migration `20261116230000_add_crm_client_position_opening.sql` was
applied to Atlas Supabase project `vvomlpkrfehkgkxnglrn` on 16 November 2026. No
new Edge Function or secret is required. The frontend form is included in this
checkout and requires a frontend publication to appear on the live website.

`20261117000000_enable_scoped_client_management.sql` extends the full client
workspace to Workflow Managers, Desk Managers, Agents, Retention Managers and
Retention. Staff open **Manage client** from their CRM client details. This
includes profile/KYC, wallet and asset controls, funding approval/rejection,
client payment instructions, robot, trades, wheel grants, support, notes,
notifications, passwords and deletion. Global administration and company-wide
payment instructions stay under administrator control. Every client RPC checks
current visibility again; removing an assignment revokes subsequent access.

The password/deletion and KYC document Edge Functions authorize the real
authenticated actor, target client and trusted request IP through a service-only
RPC before accessing Auth or storage. `npm run test:client-access` tests these
handlers. `supabase/tests/scoped_client_management.sql` exercises all five roles
against the hosted business logic in a transaction that always rolls back.

The scoped-access migration and both updated Edge Functions were deployed to
Atlas on 16 November 2026. The hosted regression passed before and after
deployment: five roles, ten positions and 79 rejected out-of-scope operations.
No regression fixtures remain. Browser checks passed for all five roles,
including client switching, funding review, both trade forms and revoked access.
The production build and 56 local trading, funding, KYC and handler tests passed.
Frontend publication is still required for the new staff workspace button and
route. The repository's existing full-project TypeScript/lint errors remain;
targeted lint checks for the changed client workspace and handlers passed.

`npm run test:crm-trading` executes the actual trading engine in a local test
database, including ownership, lot conversion, margin, risk prices, idempotency,
permissions and audit rollback. The hosted regression in
`supabase/tests/crm_client_position_opening.sql` also passed. Its sample accounts,
companies, quotes, positions and audit entries are always rolled back.

The 17 November [derivatives audit](derivatives-audit.md) also covers CRM-created
positions. Opening immediately records the same net P&L shown to the client;
it includes both spread legs. The corrected maintenance liquidation rule applies
only to new positions, as explicitly requested. Existing positions retain their
legacy threshold. The accounting migration and updated `futures-engine` function
are deployed to Atlas; the matching Dashboard/Futures/CFD frontend changes require
publication from this checkout.
