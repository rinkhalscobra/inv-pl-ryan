import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { buildCrmRecordChanges, createCrmRecordForm, isCrmRecordFieldReadOnly } from '../src/lib/crmRecordEditing.ts';

const db = new PGlite();
const company = '10000000-0000-0000-0000-000000000001';
const otherCompany = '10000000-0000-0000-0000-000000000002';
const admin = '20000000-0000-0000-0000-000000000001';
const client = '20000000-0000-0000-0000-000000000002';
const otherClient = '20000000-0000-0000-0000-000000000003';
const migration = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');

function sqlFunction(sql, name) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  assert.ok(start >= 0, `Missing SQL function ${name}`);
  return sql.slice(start, sql.indexOf('$$;', sql.indexOf('AS $$', start)) + 3);
}
async function login(id = admin, ip = '192.0.2.1') {
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false),
    set_config('request.jwt.claim.role', 'authenticated', false),
    set_config('request.headers', $2, false)`, [id, JSON.stringify({ 'cf-connecting-ip': ip })]);
}
async function edit(id, changes, table = 'transactions', target = client, reason = 'Status correction') {
  return (await db.query('SELECT public.admin_update_module_record($1, $2, $3, $4, $5) AS record',
    [target, table, id, changes, reason])).rows[0].record;
}
async function rejects(action, expected) {
  await db.exec('SAVEPOINT expected_error');
  try { await assert.rejects(action, expected); }
  finally { await db.exec('ROLLBACK TO SAVEPOINT expected_error; RELEASE SAVEPOINT expected_error'); }
}
async function wallet(asset = 'USDT') {
  const row = (await db.query('SELECT * FROM public.balances WHERE user_id = $1', [client])).rows[0];
  return Number(row[asset === 'BTC' ? 'btc_balance' : asset === 'USD' ? 'usd_balance' : 'usdt_balance']);
}
async function deposit() {
  const id = randomUUID();
  await db.query(`INSERT INTO public.transactions(id,user_id,type,amount,currency,description,status)
    VALUES ($1,$2,'deposit',100,'EUR','Deposit','pending')`, [id, client]);
  return id;
}
async function withdrawal(asset = 'USDT', owner = client) {
  const id = randomUUID();
  const amount = asset === 'BTC' ? 0.01 : 111.41;
  await db.query(`UPDATE public.balances SET
    usdt_balance=usdt_balance-CASE WHEN $2='USDT' THEN $3::numeric ELSE 0 END,
    usd_balance=usd_balance-CASE WHEN $2='USD' THEN $3::numeric ELSE 0 END,
    btc_balance=btc_balance-CASE WHEN $2='BTC' THEN $3::numeric ELSE 0 END WHERE user_id=$1`, [owner, asset, amount]);
  await db.query(`INSERT INTO public.transactions(id,user_id,type,amount,currency,description,status,balance_effect,balance_processed_at)
    VALUES ($1,$2,'withdrawal',-100,$3,'Withdrawal','pending',$4,now())`,
  [id, owner, asset === 'USDT' ? 'EUR' : asset, { ledger_asset: asset, ledger_amount: amount }]);
  return id;
}

before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE SCHEMA crm_private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT current_setting('request.jwt.claim.role', true)
    $$;
    CREATE TABLE public.users(id uuid PRIMARY KEY,company_id uuid,is_admin boolean DEFAULT false);
    CREATE TABLE crm_private.admin_ip_allowlist(address inet,access_scope text,company_id uuid);
    INSERT INTO crm_private.admin_ip_allowlist VALUES ('192.0.2.1','company','${company}');
    INSERT INTO public.users VALUES ('${admin}','${company}',true),('${client}','${company}',false),('${otherClient}','${otherCompany}',false);
    CREATE TABLE public.balances(user_id uuid PRIMARY KEY,usdt_balance numeric NOT NULL DEFAULT 1000 CHECK(usdt_balance>=0),
      usd_balance numeric NOT NULL DEFAULT 1000 CHECK(usd_balance>=0),btc_balance numeric NOT NULL DEFAULT 1000 CHECK(btc_balance>=0),updated_at timestamptz);
    INSERT INTO public.balances(user_id) VALUES ('${client}'),('${otherClient}');
    CREATE TABLE public.transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,
      type text NOT NULL,amount numeric NOT NULL,currency text,description text,
      status text NOT NULL DEFAULT 'completed' CHECK(status IN ('completed','pending','failed')),
      balance_effect jsonb NOT NULL DEFAULT '{}',balance_processed_at timestamptz,balance_reversed_at timestamptz,
      withdrawal_details jsonb,tickets_processed boolean DEFAULT false,created_at timestamptz DEFAULT now());
    CREATE TABLE public.admin_action_logs(admin_user_id uuid,target_user_id uuid,company_id uuid,action text,before_data jsonb,after_data jsonb,reason text);
    CREATE FUNCTION public.get_current_eur_usd_rate() RETURNS numeric LANGUAGE sql AS $$ SELECT 1.1::numeric $$;
    CREATE TABLE public.conversations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,
      status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed','pending')),
      priority text DEFAULT 'low' CHECK(priority IN ('low','medium','high','urgent')));
    CREATE TYPE public.test_enum AS ENUM ('first','second');
    CREATE TABLE public.notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,status public.test_enum);
    CREATE TABLE public.referral_earnings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),referrer_id uuid,referred_user_id uuid,paid_out boolean);
  `);
  const tenancy = await migration('20260925120000_add_crm_company_tenancy');
  const scope = await migration('20261014140000_allow_company_admins_to_manage_kyc');
  for (const name of ['crm_private.request_ip', 'crm_private.request_network_context']) await db.exec(sqlFunction(tenancy, name));
  for (const name of ['public.require_admin', 'crm_private.admin_can_manage_user', 'crm_private.assert_actor_user_access']) {
    await db.exec(sqlFunction(scope, name));
  }
  await db.exec(await migration('20261028160000_edit_crm_module_statuses'));
  await db.exec(`CREATE TRIGGER apply_wallet_transaction_balance_trigger BEFORE INSERT OR UPDATE OR DELETE ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION public.apply_wallet_transaction_balance()`);
});
beforeEach(async () => { await db.exec('BEGIN'); await login(); });
afterEach(async () => { await db.exec('ROLLBACK'); });
after(async () => { await db.close(); });

test('all nine deposit transitions reconcile the balance exactly once', async () => {
  for (const from of ['pending', 'completed', 'failed']) for (const to of ['pending', 'completed', 'failed']) {
    await db.exec('SAVEPOINT transition');
    const id = await deposit();
    await edit(id, { status: from });
    const result = await edit(id, { status: to });
    assert.equal(result.status, to);
    assert.equal(await wallet(), to === 'completed' ? 1110 : 1000, `${from} -> ${to}`);
    await edit(id, { status: to });
    assert.equal(await wallet(), to === 'completed' ? 1110 : 1000);
    await db.exec('ROLLBACK TO SAVEPOINT transition; RELEASE SAVEPOINT transition');
  }
});

test('all nine reserved withdrawal transitions reconcile EUR, USD and BTC exactly once', async () => {
  for (const asset of ['USDT', 'USD', 'BTC']) {
    for (const from of ['pending', 'completed', 'failed']) for (const to of ['pending', 'completed', 'failed']) {
      await db.exec('SAVEPOINT transition');
      const id = await withdrawal(asset);
      await edit(id, { status: from });
      const result = await edit(id, { status: to });
      assert.equal(result.status, to);
      const expected = to === 'failed' ? 1000 : asset === 'BTC' ? 999.99 : 888.59;
      assert.equal(await wallet(asset), expected, `${asset}: ${from} -> ${to}`);
      await edit(id, { status: to });
      assert.equal(await wallet(asset), expected);
      await db.exec('ROLLBACK TO SAVEPOINT transition; RELEASE SAVEPOINT transition');
    }
  }
});

test('pending withdrawal without a prior reservation is charged once on completion', async () => {
  const id = randomUUID();
  await db.query(`INSERT INTO public.transactions(id,user_id,type,amount,currency,status) VALUES ($1,$2,'withdrawal',-100,'USD','pending')`, [id, client]);
  await edit(id, { status: 'completed' });
  assert.equal(await wallet('USD'), 900);
  await edit(id, { status: 'pending' });
  assert.equal(await wallet('USD'), 900);
  await edit(id, { status: 'failed' });
  assert.equal(await wallet('USD'), 1000);
});

test('unposted financial edits and status changes in one save use the updated values', async () => {
  const id = await deposit();
  const result = await edit(id, { amount: 200, currency: 'USD', status: 'completed' });
  assert.equal(Number(result.amount), 200);
  assert.equal(await wallet('USD'), 1200);
  assert.equal(await wallet(), 1000);
  const second = await deposit();
  await edit(second, { type: 'withdrawal', amount: -50, currency: 'USD', status: 'completed' });
  assert.equal(await wallet('USD'), 1150);
});

test('failed reapproval preserves the original EUR conversion instead of using the current rate', async () => {
  const id = await withdrawal();
  await edit(id, { status: 'failed' });
  await db.exec('CREATE OR REPLACE FUNCTION public.get_current_eur_usd_rate() RETURNS numeric LANGUAGE sql AS $$ SELECT 2::numeric $$');
  const result = await edit(id, { status: 'completed' });
  assert.equal(Number(result.balance_effect.ledger_amount), 111.41);
  assert.equal(await wallet(), 888.59);
});

test('insufficient funds rolls back status, balance, and audit together', async () => {
  const id = await deposit();
  await edit(id, { status: 'completed' });
  await db.query('UPDATE public.balances SET usdt_balance=50 WHERE user_id=$1', [client]);
  await rejects(() => edit(id, { status: 'failed' }), /Insufficient USDT balance/);
  assert.equal(await wallet(), 50);
  assert.equal((await db.query('SELECT status FROM public.transactions WHERE id=$1', [id])).rows[0].status, 'completed');
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.admin_action_logs')).rows[0].count, 1);
});

test('historical and external adjustments change status without replaying an unrelated balance change', async () => {
  for (const effect of [{ legacy: true }, { external_balance_change: true }]) {
    const id = randomUUID();
    await db.query(`INSERT INTO public.transactions(id,user_id,type,amount,currency,status,balance_effect,balance_processed_at)
      VALUES ($1,$2,'deposit',100,'USD','completed',$3,now())`, [id, client, effect]);
    for (const status of ['pending', 'failed', 'completed']) await edit(id, { status });
    assert.equal(await wallet('USD'), 1000);
  }
});

test('status and other constrained fields use choices from live CHECK constraints and enums', async () => {
  const options = async table => (await db.query('SELECT public.admin_get_module_edit_options($1) AS options', [table])).rows[0].options;
  assert.deepEqual((await options('transactions')).status, ['completed', 'failed', 'pending']);
  assert.deepEqual(await options('conversations'), { status: ['closed', 'open', 'pending'], priority: ['high', 'low', 'medium', 'urgent'] });
  assert.deepEqual((await options('notifications')).status, ['first', 'second']);
  await rejects(() => options('users'), /This CRM table is not editable/);
  await login(client);
  await rejects(() => options('transactions'), /Administrator access required/);
});

test('other module statuses and fields save with a company-scoped audit record', async () => {
  const id = randomUUID();
  await db.query('INSERT INTO public.conversations(id,user_id) VALUES ($1,$2)', [id, client]);
  const result = await edit(id, { status: 'closed', priority: 'urgent' }, 'conversations');
  assert.equal(result.status, 'closed');
  assert.equal(result.priority, 'urgent');
  const log = (await db.query('SELECT * FROM public.admin_action_logs')).rows[0];
  assert.equal(log.company_id, company);
  assert.equal(log.action, 'update_conversations');
  assert.equal(log.before_data.status, 'open');
  assert.equal(log.after_data.status, 'closed');
  await rejects(() => edit(id, { status: 'invalid' }, 'conversations'), /check constraint/);
});

test('cross-company, wrong-owner, non-admin and unaudited edits are rejected', async () => {
  const id = await withdrawal('USD', otherClient);
  await rejects(() => edit(id, { status: 'completed' }, 'transactions', otherClient), /Account belongs to another company/);
  await rejects(() => edit(id, { status: 'completed' }), /Record not found for this user/);
  const own = await withdrawal();
  await rejects(() => edit(own, { status: 'completed' }, 'transactions', client, ''), /A reason is required/);
  await login(client);
  await rejects(() => edit(own, { status: 'completed' }), /Administrator access required/);
});

test('direct updates retain finalized-status guards and cannot forge an admin bypass', async () => {
  const id = await withdrawal();
  await edit(id, { status: 'completed' });
  assert.equal((await db.query("SELECT current_setting('crm.module_edit_transaction',true) AS value")).rows[0].value, '');
  await rejects(() => db.query("UPDATE public.transactions SET status='pending' WHERE id=$1", [id]), /finalized wallet transaction/);
  await login(client);
  await db.query("SELECT set_config('crm.module_edit_transaction',$1,false)", [id]);
  await rejects(() => db.query("UPDATE public.transactions SET status='pending' WHERE id=$1", [id]), /Administrator access required/);
});

test('ledger fields and posted financial details cannot be overwritten through the record RPC', async () => {
  const id = await withdrawal();
  await rejects(() => edit(id, { balance_processed_at: null }), /ledger metadata is managed automatically/);
  await rejects(() => edit(id, { amount: -500, status: 'completed' }), /financial fields are immutable/);
  const original = (await db.query('SELECT * FROM public.transactions WHERE id=$1', [id])).rows[0];
  const result = await edit(id, { status: 'completed', balance_effect: original.balance_effect });
  assert.equal(result.status, 'completed');
  assert.equal(await wallet(), 888.59);
});

test('client forms submit only changed business fields, preserving metadata and JSON types', () => {
  const row = { id: 'tx', user_id: 'user', status: 'pending', amount: -100, balance_processed_at: '2026-10-28',
    balance_effect: { ledger_amount: 111.41 }, withdrawal_details: { currency: 'EUR' }, tickets_processed: true, description: 'Bank withdrawal' };
  const form = createCrmRecordForm(row);
  form.status = 'completed';
  assert.deepEqual(buildCrmRecordChanges('transactions', row, form), { status: 'completed' });
  assert.equal(isCrmRecordFieldReadOnly('transactions', 'status', row), false);
  assert.equal(isCrmRecordFieldReadOnly('transactions', 'amount', row), true);
  assert.deepEqual(buildCrmRecordChanges('conversations', { status: 'open', info: { a: 1 }, amount: 3 },
    { status: 'closed', info: '{"a":2}', amount: '4' }), { status: 'closed', info: { a: 2 }, amount: 4 });
  assert.throws(() => buildCrmRecordChanges('conversations', { info: {} }, { info: '{bad' }), /valid JSON/);
  assert.throws(() => buildCrmRecordChanges('conversations', { amount: 1 }, { amount: 'Infinity' }), /valid number/);
});

test('anonymous access to the new metadata endpoint is denied', async () => {
  assert.equal((await db.query("SELECT has_function_privilege('anon','public.admin_get_module_edit_options(text)','EXECUTE') AS allowed")).rows[0].allowed, false);
});
