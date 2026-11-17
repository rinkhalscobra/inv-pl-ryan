# Derivative accounting audit — 17 November 2026

The audit found inconsistent gross/net P&L between Dashboard and the trading
pages, different quote sources on closing, missing cross-currency conversion in
Dashboard, incorrect Cross loss caps, outdated browser spread settings, a broken
referral settlement schema, and limit fills ignoring price improvement. The
changes make client and CRM opening use one server valuation and settlement
model. They do not backfill historical trades or change their entry prices.

## Accounting contract

Quantities are base units for crypto and contract units for CFD. CFD lot inputs
are multiplied by the shared instrument contract size once. Long gross P&L is
`(mark − entry) × quantity`; Short reverses the price difference. Forex profits
are converted from the quote currency to USD using a fresh direct or inverse
quote. USD-base forex notional is the base quantity; other notional is quantity
times price, converted to USD where necessary. Leverage divides required margin;
it does not multiply an already sized position's P&L. These conventions agree
with [linear contract P&L](https://www.bybit.com/en/help-center/article/Profit-Loss-calculations-USDT-Contract)
and [quote-to-account conversion](https://help.oanda.com/us/en/faqs/account-statement.htm?Highlight=exchange+rates).

Estimated net P&L subtracts the stored opening spread, an estimated closing
spread from the current database configuration, and financing accrued since its
checkpoint plus previously booked financing. ROI is net P&L divided by initial
margin. Financing uses current notional and the existing instrument daily rate;
leverage is not an additional multiplier. Closing at the same quote and time
posts this same net amount to cash and history. Later quote movement and elapsed
financing can change the final amount.

Opening reserves margin without deducting cash. Pending orders reserve margin
once; filling releases that reservation and creates the position at the actual
executable quote, including favorable slippage. Margin and costs are recomputed
at the fill. Cancellation releases the reservation without crediting cash. Orders
that cannot fund margin, both spread legs and maintenance are cancelled at fill.

The existing USD-nominal settlement model uses the legacy `usdt_balance` column.
This audit preserves that convention. It does not silently reinterpret historical
contract prices or migrate account denominations. EUR/USD presentation converts
monetary values once; forex rates remain instrument rates. Available trading
margin is settlement cash minus open-position and pending-order reservations.
Portfolio value also includes valued assets, robot allocation, active stakes
and position net P&L, without adding that P&L twice.

Isolated losses cannot exceed the smaller of isolated margin and remaining
settlement cash. Cross losses may exceed initial position margin but cannot
consume cash reserved for other open isolated positions. Final settlement never
posts a loss larger than the cash debit. Cross account risk uses remaining Cross
collateral and the account's Cross position P&L.

The user explicitly chose **new positions only** for the corrected isolated
maintenance rule. Migration adds `maintenance_model=1` to existing rows and
sets the insert default to `2`. Legacy isolated trades retain the full-margin
loss threshold; new trades use `margin + uncapped net P&L <= current notional ×
maintenance rate`. The normal rate is 0.5%. The internal version cannot be edited
through the generic CRM record editor. TP/SL and Cross risk remain server tasks.
Liquidation prices are estimates; actual risk exits evaluate equity at fresh
quotes and can cross the threshold during gaps or between worker runs.

Profitable closes use the existing referred account's configured commission
rate (default 1%). Payouts require a real settled history row and same-company,
non-self referrer, use the deployed referral schema, and post once per position.
Browser callers cannot invoke commission posting directly. Client and CRM
opening use retry references to prevent a repeated request creating another
position. Server authorization always determines the actor and target client.

## Quotes and updates

Twelve Data remains the source. The canonical helper reads `crypto_market_quotes`
or `cfd_market_quotes`; the old `market_data` mirror is only a fallback when no
primary row exists. A stale primary row cannot be bypassed by the mirror.
Opening, closing, FX conversion, limit execution and risk exits share a maximum
source age of six minutes and one minute of allowed clock skew.

Quote collection and the server worker run every minute. Realtime quote,
position, order and balance events refresh the client snapshots. Dashboard,
Futures and CFD consume the same server net values. Missing FX for one position
or pending order does not abort unrelated accounts. The UI labels unavailable
or stale valuations. Switching browser tabs does not trigger a forced reload.
This is a minute-based feed; neither prices nor TP/SL execution are tick-by-tick
or guaranteed at the requested threshold.

## Verification and release

Deployed to Atlas Supabase project `vvomlpkrfehkgkxnglrn`:

- `20261117160000_unify_derivative_position_valuation.sql`.
- `futures-engine`, version 8, active; gateway JWT verification preserved.

The migration dry run contained only this migration. The unrelated pending
network-management migration was excluded. The matching frontend changes are
in this checkout and need the normal frontend publication.

Validation passed:

- `npm run test:accounting`: 39 SQL-accounting and actual Edge-handler tests,
  covering both sides, six instrument cases, currency conversion, financing,
  reservations, retries, settlement, referral payout, risk exits, legacy rules
  and failure isolation.
- `npm run test:crm-trading`: 12 ownership, lot, margin, idempotency, permission
  and audit rollback tests.
- Existing regressions: 14 chart, 7 market-refresh, 5 session, 10 scoped handler
  and 25 CRM/funding tests passed.
- Hosted accounting regression: 8 market/side cases, 5 worker checks and 14
  ledger checks, passed before and after deployment. It runs a fixture-only
  clone of the worker and rolls back every test account, quote and trade.
- Hosted CRM opening: 2 positions. Hosted scoped workspace: all 5 roles,
  10 positions and 79 denied out-of-scope operations. All fixtures rolled back.
- Browser checks used the real app and a local SQL engine with synthetic
  accounts: Dashboard/Futures/CFD totals, price changes, USD/EUR conversion,
  closing settlement and a CRM-opened position arriving through Realtime.
- Production build and targeted lint passed. Full-project TypeScript checking
  still reports unrelated existing errors; it is not a clean project-wide gate.

The live pre-deployment preview valued all 22 open positions without error.
After deployment all 22 baseline positions remained open with model 1; the
new-row default was 2. The worker remained active every minute with no failed
runs in the preceding 15 minutes. No audit fixtures remained in the database.

These checks establish tested behavior, not an absolute zero-defect guarantee.
Provider availability, market gaps, network delay and minute scheduling still
bound update and execution timing.
