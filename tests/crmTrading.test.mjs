import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { TOP_CRYPTO_PAIRS, CFD_INSTRUMENTS } from '../src/constants/tradingPairs.ts';
import { getCfdLotSize } from '../src/lib/cfdLots.ts';

const db = new PGlite();
const id = n => `72000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const company = id(1), otherCompany = id(2), admin = id(3), client = id(4), otherClient = id(5), staff = id(6), platformAdmin = id(7);
const migration = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
function sqlFunction(sql, name) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);
  return sql.slice(start, sql.indexOf('$$;', start) + 3);
}
async function login(actor = admin, ip = '192.0.2.1') {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false),set_config('request.headers',$2,false)", [actor || '', JSON.stringify({ 'cf-connecting-ip': ip })]);
}
async function open(changes = {}, key = randomUUID()) {
  const p = { target: client, market: 'futures', symbol: 'BTCUSDT', side: 'long', quantity: 0.01, leverage: 10, margin: 'isolated', reason: 'Client requested market order', sl: null, tp: null, ...changes };
  return (await db.query('SELECT public.crm_open_client_position($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) AS result',
    [p.target, p.market, p.symbol, p.side, p.quantity, p.leverage, p.margin, key, p.reason, p.sl, p.tp])).rows[0].result;
}
async function context(market = 'futures', target = client) {
  return (await db.query('SELECT public.crm_get_client_trade_context($1,$2) AS result', [target, market])).rows[0].result;
}
async function rejects(action, message) {
  await db.exec('SAVEPOINT expected_failure');
  try { await assert.rejects(action, message); }
  finally { await db.exec('ROLLBACK TO SAVEPOINT expected_failure; RELEASE SAVEPOINT expected_failure'); }
}
const count = async table => (await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;

before(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA crm_private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
    GRANT USAGE ON SCHEMA public,auth,crm_private TO authenticated;
    CREATE TABLE public.users(id uuid PRIMARY KEY,company_id uuid,is_admin boolean DEFAULT false,
      min_leverage_futures integer DEFAULT 2,max_leverage_futures integer DEFAULT 20,
      min_leverage_forex integer DEFAULT 1,max_leverage_forex integer DEFAULT 100,
      min_leverage_commodities integer DEFAULT 1,max_leverage_commodities integer DEFAULT 50,
      min_leverage_stocks integer DEFAULT 1,max_leverage_stocks integer DEFAULT 10);
    INSERT INTO public.users(id,company_id,is_admin) VALUES('${admin}','${company}',true),('${client}','${company}',false),
      ('${otherClient}','${otherCompany}',false),('${staff}','${company}',false),('${platformAdmin}',NULL,true);
    CREATE TABLE public.crm_staff_roles(user_id uuid,role text);
    INSERT INTO public.crm_staff_roles VALUES('${staff}','agent');
    CREATE TABLE crm_private.admin_ip_allowlist(address inet,access_scope text,company_id uuid);
    INSERT INTO crm_private.admin_ip_allowlist VALUES('192.0.2.1','company','${company}'),('192.0.2.2','platform',NULL);
    CREATE TABLE public.balances(user_id uuid PRIMARY KEY,usdt_balance numeric NOT NULL,updated_at timestamptz DEFAULT now());
    INSERT INTO public.balances(user_id,usdt_balance) VALUES('${client}',2000),('${otherClient}',5000);
    CREATE TABLE public.market_data(symbol text,price numeric,timestamp timestamptz,updated_at timestamptz);
    INSERT INTO public.market_data VALUES('GBP/USD',1.25,now(),now());
    CREATE TABLE public.crypto_market_quotes(symbol text PRIMARY KEY,price numeric,timestamp timestamptz);
    CREATE TABLE public.cfd_market_quotes(LIKE public.crypto_market_quotes INCLUDING ALL);
    INSERT INTO public.crypto_market_quotes VALUES('BTCUSDT',50000,now());
    INSERT INTO public.cfd_market_quotes VALUES('EUR/USD',1.1,now()),('USD/JPY',150,now()),('EUR/GBP',0.88,now()),('XAU/USD',2300,now());
    CREATE TABLE public.instrument_spreads(symbol text,instrument_type text,is_active boolean DEFAULT true,
      spread_percentage numeric DEFAULT 0.0001,min_spread_value numeric DEFAULT 0,max_spread_value numeric DEFAULT 999999);
    INSERT INTO public.instrument_spreads(symbol,instrument_type) VALUES('BTCUSDT','crypto'),('EUR/USD','forex'),('USD/JPY','forex'),('EUR/GBP','forex'),('XAU/USD','commodity');
    CREATE TABLE public.futures_positions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES public.users(id),
      symbol text,side text,entry_price numeric,current_price numeric,amount numeric,leverage integer,margin_type text,
      liquidation_price numeric,unrealized_pnl numeric,margin numeric,roi numeric,is_open boolean,position_size numeric,
      tp_price numeric,sl_price numeric,spread_cost numeric,spread_percentage numeric,maintenance_margin_rate numeric,swap_accrued_at timestamptz,
      accumulated_swap_cost numeric DEFAULT 0,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE public.futures_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,reserved_margin numeric,status text);
    CREATE TABLE public.futures_position_history(id uuid PRIMARY KEY,user_id uuid,symbol text,side text,pnl numeric);
    CREATE TABLE public.admin_action_logs(admin_user_id uuid,target_user_id uuid,company_id uuid,action text,after_data jsonb,reason text);
  `);
  const tenancy = await migration('20260925120000_add_crm_company_tenancy');
  for (const name of ['crm_private.request_ip', 'crm_private.request_network_context']) await db.exec(sqlFunction(tenancy, name));
  const scopes = await migration('20261014140000_allow_company_admins_to_manage_kyc');
  for (const name of ['public.require_admin', 'crm_private.admin_can_manage_user', 'crm_private.assert_actor_user_access']) await db.exec(sqlFunction(scopes, name));
  const pricing = await migration('20260911163000_fix_realtime_derivatives_accounting');
  for (const name of ['public.derivative_usd_per_currency', 'public.derivative_swap_rate', 'public.calculate_derivative_pnl_usd', 'public.calculate_derivative_notional_usd', 'public.calculate_derivative_spread_cost_usd']) await db.exec(sqlFunction(pricing, name));
  const engine = await migration('20260917120000_rebuild_futures_engine');
  for (const name of ['public.futures_liquidation_price', 'public.place_derivative_order']) await db.exec(sqlFunction(engine, name));
  for (const name of ['public.update_futures_risk', 'public.process_futures_engine']) await db.exec(sqlFunction(engine, name));
  const closeStart = engine.indexOf('CREATE FUNCTION public.close_futures_position(');
  await db.exec(engine.slice(closeStart, engine.indexOf('$$;', closeStart) + 3));
  await db.exec(await migration('20261116230000_add_crm_client_position_opening'));
  await db.exec(sqlFunction(await migration('20261028160000_edit_crm_module_statuses'), 'public.admin_update_module_record'));
  await db.exec(await migration('20261117160000_unify_derivative_position_valuation'));
});
beforeEach(async () => { await db.exec('BEGIN'); await login(); });
afterEach(async () => { await db.exec('ROLLBACK'); });
after(async () => { await db.close(); });

test('server catalog matches active client markets and the shared CFD contract sizes', async () => {
  const rows = (await db.query('SELECT * FROM crm_private.client_trade_markets')).rows;
  const markets = [...TOP_CRYPTO_PAIRS, ...CFD_INSTRUMENTS].filter(item => item.active && item.tradable !== false);
  assert.equal(rows.length, markets.length);
  for (const market of markets) assert.equal(Number(rows.find(row => row.symbol === market.symbol).contract_size), market.type === 'crypto' ? 1 : getCfdLotSize(market.symbol));
});

test('actual engine opens Long and Short positions for the selected client and reserves margin once', async () => {
  for (const side of ['long', 'short']) {
    const result = await open({ side, sl: side === 'long' ? 49000 : 51000, tp: side === 'long' ? 51000 : 49000 });
    const p = (await db.query('SELECT * FROM public.futures_positions WHERE id=$1', [result.id])).rows[0];
    assert.equal(p.user_id, client);
    assert.equal(p.side, side);
    assert.equal(Number(p.entry_price), 50000);
    assert.equal(Number(p.margin), 50);
    assert.ok(Number(p.liquidation_price) > 0);
    assert.ok(Number(p.unrealized_pnl) < 0);
    assert.equal(Number(p.sl_price), side === 'long' ? 49000 : 51000);
    assert.equal(Number(p.tp_price), side === 'long' ? 51000 : 49000);
  }
  assert.equal((await context()).available_margin, 1900);
  assert.equal(Number((await db.query('SELECT usdt_balance FROM public.balances WHERE user_id=$1', [client])).rows[0].usdt_balance), 2000);
  const audit = (await db.query('SELECT * FROM public.admin_action_logs LIMIT 1')).rows[0];
  assert.equal(audit.admin_user_id, admin); assert.equal(audit.target_user_id, client); assert.equal(audit.company_id, company);
  assert.equal(audit.action, 'crm_client_position_opened');
  assert.equal((await db.query("SELECT current_setting('crm.client_position_authorized',true) AS value")).rows[0].value, '');
  assert.equal((await db.query('SELECT auth.uid() AS actor,auth.role() AS role')).rows[0].role, 'authenticated');
});

test('CFD lots execute as correct forex and gold units using the actual engine', async () => {
  for (const [symbol, quantity, units, margin] of [['EUR/USD', 0.01, 1000, 110], ['USD/JPY', 0.01, 1000, 100], ['XAU/USD', 0.01, 1, 230]]) {
    const result = await open({ market: 'cfd', symbol, quantity, side: 'short' });
    const p = (await db.query('SELECT * FROM public.futures_positions WHERE id=$1', [result.id])).rows[0];
    assert.equal(Number(p.amount), units, symbol);
    assert.equal(Number(p.margin), margin, symbol);
  }
});

test('retries return the original position without another audit or margin reservation', async () => {
  const key = randomUUID();
  const first = await open({}, key);
  assert.deepEqual(await open({}, key), first);
  assert.equal(await count('public.futures_positions'), 1);
  assert.equal(await count('public.admin_action_logs'), 1);
  assert.equal((await context()).available_margin, 1950);
  await rejects(() => open({ quantity: 0.02 }, key), /different order/);
});

test('company administrators cannot cross companies, while platform access retains its existing scope', async () => {
  await rejects(() => open({ target: otherClient }), /another company/);
  await rejects(() => context('cfd', otherClient), /another company/);
  await login(platformAdmin, '192.0.2.2');
  const result = await open({ target: otherClient });
  assert.equal((await db.query('SELECT user_id FROM public.futures_positions WHERE id=$1', [result.id])).rows[0].user_id, otherClient);
});

test('existing service-role trading continues through the same engine without CRM authorization flags', async () => {
  await db.exec("SELECT set_config('request.jwt.claim.role','service_role',true)");
  const result = (await db.query("SELECT public.place_derivative_order($1,'BTCUSDT','long',0.01,10,'isolated','market',50000,NULL,NULL,NULL) AS result", [otherClient])).rows[0].result;
  assert.equal(result.kind, 'position');
  const position = (await db.query('SELECT * FROM public.futures_positions WHERE id=$1', [result.id])).rows[0];
  assert.equal(position.user_id, otherClient);
  assert.equal(Number(position.margin), 50);
});

test('non-admin clients and staff, blocked networks and staff targets cannot open operations', async () => {
  for (const actor of [client, staff]) { await login(actor); await rejects(() => open(), /Administrator access required/); }
  await login(admin, '198.51.100.99'); await rejects(() => open(), /network|Network/);
  await login(); await rejects(() => open({ target: staff }), /Select a client/);
  await rejects(() => open({ target: admin }), /Select a client/);
  await rejects(() => open({ reason: '' }), /audit reason/);
});

test('stale, missing and future-dated server quotes cannot execute', async () => {
  for (const time of ["now()-interval '7 minutes'", "now()+interval '2 minutes'", 'NULL']) {
    await db.exec(`UPDATE public.crypto_market_quotes SET timestamp=${time}`);
    await rejects(() => open(), /verified live price/);
  }
  assert.equal(await count('public.futures_positions'), 0);
});

test('leverage, available margin and risk prices are validated by the engine', async () => {
  await rejects(() => open({ leverage: 100 }), /Leverage must be between/);
  await rejects(() => open({ sl: 51000 }), /Stop-loss price is invalid/);
  await rejects(() => open({ tp: 49000 }), /Take-profit price is invalid/);
  await rejects(() => open({ quantity: 10 }), /Insufficient available margin/);
  await db.query("INSERT INTO public.futures_orders(user_id,reserved_margin,status) VALUES($1,1980,'open')", [client]);
  await rejects(() => open(), /Insufficient available margin/);
  assert.equal((await context()).available_margin, 20);
});

test('invalid markets, numeric values and lot sizes are rejected without changing the client', async () => {
  for (const changes of [{ quantity: 'NaN' }, { quantity: 'Infinity' }, { quantity: 0 }, { quantity: 0.000000001 }, { leverage: null }, { sl: 'Infinity' }, { tp: -1 }, { market: 'cfd', symbol: 'EUR/USD', quantity: 0.001 }, { market: 'cfd', symbol: 'BTCUSDT' }, { side: null }, { margin: null }]) {
    await rejects(() => open(changes), /valid|supported|size/);
  }
  assert.equal(await count('public.futures_positions'), 0);
});

test('audit failure rolls back the position, its receipt and available margin together', async () => {
  await db.exec(`CREATE FUNCTION public.reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Audit unavailable'; END$$;
    CREATE TRIGGER reject_test_audit BEFORE INSERT ON public.admin_action_logs FOR EACH ROW EXECUTE FUNCTION public.reject_test_audit()`);
  await rejects(() => open(), /Audit unavailable/);
  assert.equal(await count('public.futures_positions'), 0);
  assert.equal(await count('crm_private.client_trade_requests'), 0);
  assert.equal((await context()).available_margin, 2000);
});

test('browser users cannot call the raw engine or read private request receipts', async () => {
  assert.equal((await db.query("SELECT has_function_privilege('authenticated','public.place_derivative_order(uuid,text,text,numeric,integer,text,text,numeric,numeric,numeric,numeric)','EXECUTE') AS allowed")).rows[0].allowed, false);
  assert.equal((await db.query("SELECT has_function_privilege('anon','public.crm_open_client_position(uuid,text,text,text,numeric,integer,text,uuid,text,numeric,numeric)','EXECUTE') AS allowed")).rows[0].allowed, false);
  await db.exec('SET LOCAL ROLE authenticated');
  await rejects(() => db.query('SELECT * FROM crm_private.client_trade_requests'), /permission denied/);
  await rejects(() => db.query("SELECT public.place_derivative_order($1,'BTCUSDT','long',0.01,10,'isolated','market',50000,NULL,NULL,NULL)", [client]), /permission denied/);
  await db.exec('RESET ROLE');
  await login(client);
  await db.query("SELECT set_config('crm.client_position_authorized',$1,true)", [client]);
  await rejects(() => db.query("SELECT public.place_derivative_order($1,'BTCUSDT','long',0.01,10,'isolated','market',50000,NULL,NULL,NULL)", [client]), /Administrator access required/);
});
