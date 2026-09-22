import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Retired: crypto quotes are populated by twelve-crypto-market-data on a server schedule.
Deno.serve(() => new Response(JSON.stringify({ error: "This feed has been retired" }), {
  status: 410,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type" },
}));
