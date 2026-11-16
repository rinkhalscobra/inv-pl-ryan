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
    CREATE TABLE public.crm_companies(id uuid PRIMARY KEY);
    INSERT INTO public.crm_companies VALUES ('${company}'),('${otherCompany}');
    CREATE TABLE public.users(id uuid PRIMARY KEY,company_id uuid,is_admin boolean DEFAULT false,kyc_status text DEFAULT 'verified');
    CREATE TABLE crm_private.admin_ip_allowlist(address inet,access_scope text,company_id uuid);
    INSERT INTO crm_private.admin_ip_allowlist VALUES ('192.0.2.1','company','${company}');
    INSERT INTO public.users(id,company_id,is_admin) VALUES ('${admin}','${company}',true),('${client}','${company}',false),('${otherClient}','${otherCompany}',false);
    CREATE TABLE public.client_bank_details(user_id uuid,bank_name text,account_number text,routing_number text,swift_code text,beneficiary_name text,iban text,currency text);
    CREATE TABLE public.futures_positions(user_id uuid,margin numeric,is_open boolean);
    CREATE TABLE public.futures_orders(user_id uuid,reserved_margin numeric,status text);
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
  await db.exec(await migration('20261116120000_manual_funding_requests'));
  await db.exec(`CREATE TRIGGER apply_wallet_transaction_balance_trigger BEFORE INSERT OR UPDATE OR DELETE ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION public.apply_wallet_transaction_balance()`);
  await db.exec(`ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Users can view own transactions" ON public.transactions FOR SELECT TO authenticated USING(auth.uid()=user_id);
    GRANT USAGE ON SCHEMA public,auth TO authenticated;
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.transactions TO authenticated;`);
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

async function saveInstructions(method, details, scope = 'shared', target = client) {
  return (await db.query('SELECT public.admin_save_deposit_payment_instructions($1,$2,$3,$4,$5) AS result',
    [target, method, scope, details, 'Payment details configured'])).rows[0].result;
}
async function instructions(method) {
  return (await db.query('SELECT public.get_deposit_payment_instructions($1) AS result', [method])).rows[0].result;
}
async function requestDeposit(method = 'bank', amount = 100, currency = 'EUR', id = randomUUID()) {
  return (await db.query('SELECT public.request_manual_deposit($1,$2,$3,$4) AS result', [method, amount, currency, id])).rows[0].result;
}
async function reviewFunding(id, decision = 'approve', target = client, reason = 'Payment verified') {
  return (await db.query('SELECT public.admin_review_funding_request($1,$2,$3,$4) AS result', [target, id, decision, reason])).rows[0].result;
}

test('shared instructions apply to all company clients and client overrides take precedence for each method', async () => {
  const second = randomUUID();
  await db.query('INSERT INTO public.users(id,company_id) VALUES($1,$2)', [second, company]);
  for (const method of ['btc', 'crypto', 'bank']) {
    await login();
    await saveInstructions(method, { wallet_address: 'shared', instructions: 'Shared payment instructions' });
    await saveInstructions(method, { wallet_address: 'client-specific' }, 'client');
    await login(client);
    assert.equal((await instructions(method)).details.wallet_address, 'client-specific');
    await login(second);
    assert.equal((await instructions(method)).details.wallet_address, 'shared');
    await login(otherClient);
    assert.deepEqual((await instructions(method)).details, {});
    await login();
    await saveInstructions(method, null, 'client');
    await login(client);
    assert.equal((await instructions(method)).details.wallet_address, 'shared');
  }
});

test('existing client bank instructions remain available before new instructions are saved', async () => {
  await db.query("INSERT INTO public.client_bank_details(user_id,bank_name,iban,currency) VALUES($1,'Existing Bank','DE123','EUR')", [client]);
  await login(client);
  assert.equal((await instructions('bank')).details.iban, 'DE123');
});

test('all three deposit methods start pending, retain their instructions, and credit only their own wallet on approval', async () => {
  for (const [method, amount, currency, asset, expected] of [
    ['btc', 0.01, 'BTC', 'BTC', 1000.01], ['crypto', 100, 'USD', 'USD', 1100], ['bank', 100, 'EUR', 'USDT', 1110],
  ]) {
    await db.exec('SAVEPOINT method');
    await saveInstructions(method, { wallet_address: 'original-destination' });
    await login(client);
    const row = await requestDeposit(method, amount, currency);
    assert.equal(row.status, 'pending');
    assert.equal(row.user_id, client);
    assert.equal(row.deposit_details.method, method);
    assert.equal(row.deposit_details.instructions.wallet_address, 'original-destination');
    assert.equal(await wallet(asset), 1000);
    await login();
    await saveInstructions(method, { wallet_address: 'changed-destination' });
    const result = await reviewFunding(row.id);
    assert.equal(result.status, 'completed');
    assert.equal(result.deposit_details.instructions.wallet_address, 'original-destination');
    assert.equal(await wallet(asset), expected);
    await reviewFunding(row.id);
    assert.equal(await wallet(asset), expected, 'retry must not double-credit the wallet');
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.admin_action_logs WHERE action='update_transactions'")).rows[0].n, 1);
    await rejects(() => reviewFunding(row.id, 'reject'), /already been reviewed/);
    await db.exec('ROLLBACK TO SAVEPOINT method; RELEASE SAVEPOINT method');
  }
});

test('rejected deposits never credit funds; duplicate submissions return the original request', async () => {
  await login(client);
  const id = randomUUID();
  const first = await requestDeposit('bank', 100, 'EUR', id);
  assert.equal((await requestDeposit('bank', 100, 'EUR', id)).id, first.id);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.transactions')).rows[0].n, 1);
  await rejects(() => requestDeposit('bank', 200, 'EUR', id), /reference already used/);
  await login();
  assert.equal((await reviewFunding(id, 'reject')).status, 'failed');
  await reviewFunding(id, 'reject');
  assert.equal(await wallet(), 1000);
  await rejects(() => reviewFunding(id, 'approve'), /already been reviewed/);
});

test('BTC deposit reversal, reopening and deletion affect BTC without altering fiat balances', async () => {
  await login(client);
  const row = await requestDeposit('btc', 0.1, 'BTC');
  await login();
  await reviewFunding(row.id);
  assert.equal(await wallet('BTC'), 1000.1);
  await edit(row.id, { status: 'failed' });
  assert.equal(await wallet('BTC'), 1000);
  await edit(row.id, { status: 'completed' });
  assert.equal(await wallet('BTC'), 1000.1);
  await db.query('DELETE FROM public.transactions WHERE id=$1', [row.id]);
  assert.equal(await wallet('BTC'), 1000);
  assert.equal(await wallet(), 1000);
  assert.equal(await wallet('USD'), 1000);
});

async function requestWithdrawal(currency) {
  if (currency === 'BTC') return (await db.query("SELECT public.request_btc_withdrawal(0.01,'bc1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq','BTC') AS result")).rows[0].result;
  return (await db.query("SELECT public.request_fiat_withdrawal($1,100,'Test Bank','12345678','12345','Test Client') AS result", [currency])).rows[0].result;
}

test('real EUR, USD and BTC withdrawal RPCs reserve pending funds and approve without a second debit', async () => {
  for (const currency of ['EUR', 'USD', 'BTC']) {
    await db.exec('SAVEPOINT currency');
    await login(client);
    const row = await requestWithdrawal(currency);
    const asset = currency === 'EUR' ? 'USDT' : currency;
    const expected = currency === 'EUR' ? 890 : currency === 'USD' ? 900 : 999.99;
    assert.equal(row.status, 'pending');
    assert.equal(await wallet(asset), expected);
    await login();
    assert.equal((await reviewFunding(row.transaction_id)).status, 'completed');
    await reviewFunding(row.transaction_id);
    assert.equal(await wallet(asset), expected);
    await db.exec('ROLLBACK TO SAVEPOINT currency; RELEASE SAVEPOINT currency');
  }
});

test('rejecting EUR, USD and BTC pending withdrawals refunds their exact reservations only once', async () => {
  for (const currency of ['EUR', 'USD', 'BTC']) {
    await db.exec('SAVEPOINT currency');
    await login(client);
    const row = await requestWithdrawal(currency);
    await login();
    assert.equal((await reviewFunding(row.transaction_id, 'reject')).status, 'failed');
    await reviewFunding(row.transaction_id, 'reject');
    assert.equal(await wallet(currency === 'EUR' ? 'USDT' : currency), 1000);
    await db.exec('ROLLBACK TO SAVEPOINT currency; RELEASE SAVEPOINT currency');
  }
});

test('deposit creation and review reject anonymous, cross-company, wrong-client and unaudited access', async () => {
  await login(client);
  const row = await requestDeposit();
  await rejects(() => reviewFunding(row.id), /Administrator access required/);
  await rejects(() => saveInstructions('btc', { wallet_address: 'unauthorized' }), /Administrator access required/);
  await login();
  await rejects(() => reviewFunding(row.id, 'approve', otherClient), /Account belongs to another company/);
  await rejects(() => saveInstructions('btc', {}, 'shared', otherClient), /Account belongs to another company/);
  const wrongOwner = await withdrawal('USD', otherClient);
  await rejects(() => reviewFunding(wrongOwner), /not found for this client/);
  await rejects(() => reviewFunding(row.id, 'approve', client, ''), /reason is required/);
  await login('');
  await rejects(() => requestDeposit(), /Authentication required/);
  for (const signature of ['request_manual_deposit(text,numeric,text,uuid)', 'get_deposit_payment_instructions(text)',
    'admin_save_deposit_payment_instructions(uuid,text,text,jsonb,text)', 'admin_review_funding_request(uuid,uuid,text,text)']) {
    assert.equal((await db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') AS allowed", [`public.${signature}`])).rows[0].allowed, false);
  }
});

test('funding queue includes every pending request even when there are more than 50 newer completed records', async () => {
  await login(client);
  const row = await requestDeposit();
  await db.query("UPDATE public.transactions SET created_at=now()-interval '1 year' WHERE id=$1", [row.id]);
  await db.query("INSERT INTO public.transactions(user_id,type,amount,currency,status) SELECT $1,'deposit',10,'USD','completed' FROM generate_series(1,60)", [client]);
  await login();
  const result = (await db.query('SELECT public.admin_get_funding_requests($1) AS result', [client])).rows[0].result;
  assert.equal(result[0].id, row.id);
  assert.equal(result.length, 51);
  assert.ok(result.every(item => item.user_id === client));
});

test('database policies prevent clients from inserting, settling, deleting or relabeling funding transactions', async () => {
  await login(client);
  const row = await requestDeposit();
  await db.exec('SET LOCAL ROLE authenticated');
  assert.equal((await db.query("UPDATE public.transactions SET status='completed' WHERE id=$1 RETURNING id", [row.id])).rows.length, 0);
  assert.equal((await db.query('DELETE FROM public.transactions WHERE id=$1 RETURNING id', [row.id])).rows.length, 0);
  await rejects(() => db.query("INSERT INTO public.transactions(user_id,type,amount,currency,status) VALUES($1,'withdrawal',-100,'USD','completed')", [client]), /row-level security/);
  const regular = randomUUID();
  await db.query("INSERT INTO public.transactions(id,user_id,type,amount,status) VALUES($1,$2,'trade',0,'pending')", [regular, client]);
  await rejects(() => db.query("UPDATE public.transactions SET type='deposit' WHERE id=$1", [regular]), /row-level security/);
  await rejects(() => db.query('SELECT * FROM public.deposit_payment_instructions'), /permission denied/);
  assert.equal((await db.query('SELECT * FROM public.transactions WHERE user_id=$1', [otherClient])).rows.length, 0);
  // The authenticated RPC remains available even though direct INSERT is denied.
  const allowed = await requestDeposit('crypto', 100, 'USD');
  assert.equal(allowed.status, 'pending');
  await db.exec('RESET ROLE');
});

test('funding inputs reject non-finite values, unsupported methods, invalid precision and invalid destination data', async () => {
  await login(client);
  for (const amount of [NaN, Infinity, -Infinity, -1, 0, 9, 1000001, 10.001]) {
    await rejects(() => requestDeposit('bank', amount, 'EUR'), /Invalid deposit amount|Invalid amount precision/);
  }
  await rejects(() => requestDeposit('card', 100, 'EUR'), /Unsupported deposit method/);
  await rejects(() => requestDeposit('btc', 100, 'EUR'), /Unsupported deposit currency/);
  await rejects(() => requestDeposit('crypto', 0.01, 'BTC'), /Unsupported deposit currency/);
  for (const amount of ['NaN', 'Infinity', '-Infinity', '100.001']) {
    await rejects(() => db.query("SELECT public.request_fiat_withdrawal('EUR',$1,'Bank','123','123','Client')", [amount]), /Withdrawal amount/);
    await rejects(() => db.query("SELECT public.request_btc_withdrawal($1,'bc1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq','BTC')", [amount === '100.001' ? '0.001000001' : amount]), /Minimum BTC withdrawal/);
  }
  await rejects(() => db.query("SELECT public.request_btc_withdrawal(0.01,'not-a-valid-bitcoin-address','BTC')"), /valid BTC destination/);
  await login();
  await rejects(() => saveInstructions('btc', { wallet_address: 123 }), /must contain text/);
  await rejects(() => saveInstructions('btc', { instructions: 'x'.repeat(4001) }), /must contain text/);
});
