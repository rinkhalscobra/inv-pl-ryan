# CFD quote sources

The `cfd-market-data` Edge Function uses Yahoo market quotes for the catalog and
selected instruments. The selected instrument also tries Yahoo's chart endpoint
when its batch quote is missing. If the selected instrument is a forex pair or
a US stock with a simple ticker, and Yahoo has no current quote, the function
can try Twelve Data as an independent fallback.

To enable that fallback, a project Owner or Administrator must set
`TWELVE_DATA_API_KEY` in **Supabase Dashboard > Edge Functions > Secrets**. Do not
put it in a `VITE_` variable or commit it. Deploy `cfd-market-data` from this
repository, then publish the frontend for its quote retry button and status
messages to appear. If the function is already deployed, Supabase makes a newly
set secret available without another deployment.

The fallback is requested only for the selected market, at most once every
five minutes per symbol in each Edge Function worker. It accepts only a matching
symbol with a positive price and a source timestamp less than two minutes old.
For stocks, the provider must also report that the market is open. Weekend forex
hours and the normal daily break remain closed. Cached or delayed prices stay
visible for reference but cannot enable trading.

Check the provider's display and trading rights before enabling a key on a
client-facing platform. Twelve Data's free Basic plan lists internal,
non-display use and a daily credit limit; it is not a guarantee of external
display rights or uninterrupted quotes.
