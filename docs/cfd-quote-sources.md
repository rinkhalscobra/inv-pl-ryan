# CFD quotes

Twelve Data is the sole provider for displayed CFD prices, charts, and order
execution. The `cfd-market-data` Edge Function stores provider prices and their
source timestamps in `cfd_market_quotes`; the browser reads those rows through
Supabase. API credentials remain in Edge Function secrets.

The catalog cron fetches supported instruments every four minutes. While a CFD
workspace is open, its selected market requests a refresh every minute. The
database refresh lease is anchored to the **start** of each request, with five
seconds of scheduling room, so a one-minute timer does not miss every second
tick. Source timestamps, rather than database write times, determine freshness.

The selected CFD quote can be used for orders while its source timestamp is
less than three minutes old. The order form, Edge Function, and database
processing guard use the same limit. Older prices remain visible for reference
and cannot execute new orders. The three-minute window accounts for Twelve
Data's minute-bar timestamp and normal request scheduling; it does not turn a
stale provider response into a current quote.

For diagnostics, compare `timestamp` and `updated_at` in `cfd_market_quotes`,
then inspect `cfd_quote_sync_runs` and `cfd_quote_refresh_state`. A recent
`updated_at` with an old `timestamp` means Twelve Data returned an old source
quote; repeated missing cron runs point to scheduling or lease trouble.
