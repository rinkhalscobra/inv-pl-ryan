import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const migration = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
function sqlFunction(sql, name) {
  const start = sql.search(new RegExp(`CREATE(?: OR REPLACE)? FUNCTION ${name.replaceAll('.', '\\.') }\\(`));
  assert.ok(start >= 0, `Missing function ${name}`);
  return sql.slice(start, sql.indexOf('$$;', start) + 3);
}
async function claim(market, key, force = false) {
  return (await db.query(`SELECT public.claim_${market}_quote_refresh($1,60,$2) AS claimed`, [key, force])).rows[0].claimed;
}
async function finish(market, key, success = true) {
  await db.query(`SELECT public.finish_${market}_quote_refresh($1,60,$2)`, [key, success]);
}

before(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA cron;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT current_setting('request.jwt.claim.role',true)
    $$;
    GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;
    CREATE TABLE public.cfd_quote_refresh_state(cache_key text PRIMARY KEY,next_refresh_at timestamptz NOT NULL DEFAULT '-infinity',
      lease_until timestamptz NOT NULL DEFAULT '-infinity',last_attempt_at timestamptz,last_success_at timestamptz);
    CREATE TABLE public.crypto_quote_refresh_state(LIKE public.cfd_quote_refresh_state INCLUDING ALL);
    CREATE TABLE cron.job(jobid bigint PRIMARY KEY,jobname text UNIQUE,schedule text);
    INSERT INTO cron.job VALUES(1,'sync-twelve-data-cfd-quotes','*/4 * * * *'),(2,'sync-twelve-data-crypto-quotes','*/4 * * * *'),(3,'unrelated-job','0 * * * *');
    CREATE FUNCTION cron.alter_job(bigint,schedule text) RETURNS void LANGUAGE sql AS $$
      UPDATE cron.job SET schedule=$2 WHERE jobid=$1
    $$;
  `);
  const crypto = await migration('20260922120000_twelve_data_crypto_cache');
  await db.exec(sqlFunction(crypto, 'public.claim_crypto_quote_refresh'));
  await db.exec(sqlFunction(await migration('20260922112000_twelve_data_cfd_candles'), 'public.claim_cfd_quote_refresh'));
  await db.exec(sqlFunction(await migration('20260922130000_align_cfd_quote_freshness'), 'public.finish_cfd_quote_refresh'));
  await db.exec(await migration('20261116220000_refresh_markets_every_minute'));
});
beforeEach(async () => {
  await db.exec("BEGIN; SELECT set_config('request.jwt.claim.role','service_role',true)");
});
afterEach(async () => { await db.exec('ROLLBACK'); });
after(async () => { await db.close(); });

test('both catalog jobs run every minute while unrelated schedules stay unchanged', async () => {
  assert.deepEqual((await db.query('SELECT schedule FROM cron.job ORDER BY jobid')).rows.map(row => row.schedule),
    ['* * * * *', '* * * * *', '0 * * * *']);
});

test('catalog, selected quote and candle leases block overlapping refreshes in both markets', async () => {
  for (const market of ['cfd', 'crypto']) for (const key of ['catalog', 'selected:TESTUSD', 'candles:TESTUSD']) {
    assert.equal(await claim(market, key), true);
    assert.equal(await claim(market, key), false);
    assert.equal(await claim(market, key, true), false);
  }
});

test('a slow request still allows the next minute tick for both quotes and candles', async () => {
  for (const market of ['cfd', 'crypto']) for (const key of ['catalog', 'selected:TESTUSD', 'candles:TESTUSD']) {
    await claim(market, key);
    await db.query(`UPDATE public.${market}_quote_refresh_state SET last_attempt_at=now()-interval '56 seconds' WHERE cache_key=$1`, [key]);
    await finish(market, key);
    assert.equal(await claim(market, key), true, `${market}:${key} must not skip the next minute tick`);
  }
});

test('early completion respects the shared cooldown and five-second scheduling margin', async () => {
  for (const market of ['cfd', 'crypto']) {
    await claim(market, 'catalog');
    await db.exec(`UPDATE public.${market}_quote_refresh_state SET last_attempt_at=now()-interval '10 seconds'`);
    await finish(market, 'catalog');
    const seconds = Number((await db.query(`SELECT extract(epoch FROM next_refresh_at-now()) AS seconds FROM public.${market}_quote_refresh_state`)).rows[0].seconds);
    assert.equal(seconds, 45);
    assert.equal(await claim(market, 'catalog'), false);
  }
});

test('failed refreshes retry after thirty seconds without claiming a successful update', async () => {
  for (const market of ['cfd', 'crypto']) {
    await claim(market, 'catalog');
    await finish(market, 'catalog', false);
    const row = (await db.query(`SELECT extract(epoch FROM next_refresh_at-now()) AS seconds,last_success_at FROM public.${market}_quote_refresh_state`)).rows[0];
    assert.equal(Number(row.seconds), 30);
    assert.equal(row.last_success_at, null);
  }
});

test('migration clears old cooldowns without dropping an active provider lease', async () => {
  for (const market of ['cfd', 'crypto']) {
    await db.exec(`INSERT INTO public.${market}_quote_refresh_state VALUES('catalog',now()+interval '4 minutes',now()+interval '1 minute',now(),NULL)`);
  }
  await db.exec(await migration('20261116220000_refresh_markets_every_minute'));
  for (const market of ['cfd', 'crypto']) {
    const row = (await db.query(`SELECT next_refresh_at<=now() AS ready,lease_until>now() AS active FROM public.${market}_quote_refresh_state`)).rows[0];
    assert.deepEqual(row, { ready: true, active: true });
    assert.equal(await claim(market, 'catalog'), false);
  }
});

test('clients cannot release or bypass a server-owned refresh lease', async () => {
  assert.equal((await db.query("SELECT has_function_privilege('authenticated','public.finish_crypto_quote_refresh(text,integer,boolean)','EXECUTE') AS allowed")).rows[0].allowed, false);
  await db.exec("SELECT set_config('request.jwt.claim.role','authenticated',true); SAVEPOINT denied");
  await assert.rejects(() => finish('crypto', 'catalog'), /Service role required/);
  await db.exec('ROLLBACK TO SAVEPOINT denied');
});
