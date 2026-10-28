import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// Execute the real migration and existing access/review functions in PostgreSQL.
// Only Supabase's auth helpers and unrelated table columns are fixture-specific.
const db = new PGlite();
const company = '10000000-0000-0000-0000-000000000001';
const otherCompany = '10000000-0000-0000-0000-000000000002';
const admin = '20000000-0000-0000-0000-000000000001';
const client = '20000000-0000-0000-0000-000000000002';
const otherClient = '20000000-0000-0000-0000-000000000003';
const platformAdmin = '20000000-0000-0000-0000-000000000004';
const migration = async name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');

function sqlFunction(sql, name) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  assert.ok(start >= 0, `Missing SQL function ${name}`);
  const end = sql.indexOf('$$;', sql.indexOf('AS $$', start)) + 3;
  return sql.slice(start, end);
}

async function login(id = admin, ip = '192.0.2.1') {
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false),
    set_config('request.jwt.claim.role', 'authenticated', false),
    set_config('request.headers', $2, false)`, [id, JSON.stringify({ 'cf-connecting-ip': ip })]);
}

async function setStatus(status, reason = 'Manual CRM correction', target = client) {
  await db.query('SELECT public.admin_set_user_kyc_status($1, $2, $3)', [target, status, reason]);
}

async function statusOf(id = client) {
  return (await db.query('SELECT kyc_status FROM public.users WHERE id = $1', [id])).rows[0].kyc_status;
}

async function rejects(action, expected) {
  await db.exec('SAVEPOINT expected_error');
  try {
    await assert.rejects(action, expected);
  } finally {
    await db.exec('ROLLBACK TO SAVEPOINT expected_error; RELEASE SAVEPOINT expected_error');
  }
}

before(async () => {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE SCHEMA crm_private;
    CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT current_setting('request.jwt.claim.role', true)
    $$;
    CREATE TABLE public.users (
      id uuid PRIMARY KEY, company_id uuid, is_admin boolean DEFAULT false,
      kyc_status text DEFAULT 'not_verified' CHECK (kyc_status IN ('not_verified', 'pending', 'verified')),
      document_id_path text, document_selfie_path text, updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE crm_private.admin_ip_allowlist (address inet, access_scope text, company_id uuid);
    INSERT INTO crm_private.admin_ip_allowlist VALUES
      ('192.0.2.1', 'company', '${company}'), ('192.0.2.2', 'company', '${otherCompany}'),
      ('192.0.2.3', 'platform', NULL);
    CREATE TABLE public.admin_action_logs (
      admin_user_id uuid, target_user_id uuid, company_id uuid, action text,
      before_data jsonb, after_data jsonb, reason text
    );
    CREATE TABLE storage.objects (bucket_id text, name text);
  `);
  const tenancy = await migration('20260925120000_add_crm_company_tenancy');
  const review = await migration('20261014140000_allow_company_admins_to_manage_kyc');
  const tax = await migration('20260921120000_add_kyc_tax_id_review');
  const onboarding = await migration('20260923130000_automated_client_onboarding');
  for (const [sql, table] of [[tax, 'kyc_tax_id_submissions'], [onboarding, 'client_documents']]) {
    const start = sql.indexOf(`CREATE TABLE IF NOT EXISTS public.${table} (`);
    await db.exec(sql.slice(start, sql.indexOf('\n);', start) + 3));
  }
  for (const name of ['crm_private.request_ip', 'crm_private.request_network_context',
    'crm_private.is_platform_request', 'public.check_admin_role']) {
    await db.exec(sqlFunction(tenancy, name));
  }
  for (const name of ['public.require_admin', 'crm_private.admin_can_manage_user',
    'crm_private.assert_actor_user_access', 'public.admin_review_kyc_application']) {
    await db.exec(sqlFunction(review, name));
  }
  await db.exec(await migration('20261028150000_allow_crm_kyc_status_edits'));
  await db.exec(`
    CREATE TRIGGER protect_user_kyc_status BEFORE INSERT OR UPDATE OF kyc_status ON public.users
      FOR EACH ROW EXECUTE FUNCTION public.protect_user_kyc_status();
    INSERT INTO public.users(id, company_id, is_admin) VALUES
      ('${admin}', '${company}', true), ('${client}', '${company}', false),
      ('${otherClient}', '${otherCompany}', false), ('${platformAdmin}', NULL, true);
  `);
});

beforeEach(async () => {
  await db.exec('BEGIN');
  await login();
});
afterEach(async () => { await db.exec('ROLLBACK'); });
after(async () => { await db.close(); });

test('company admin can make every status transition without uploaded documents', async () => {
  for (const initial of ['not_verified', 'pending', 'verified']) {
    for (const next of ['not_verified', 'pending', 'verified']) {
      await setStatus(initial);
      await setStatus(next);
      assert.equal(await statusOf(), next);
    }
  }
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.kyc_tax_id_submissions')).rows[0].count, 0);
});

test('status changes persist with actor, company, before/after values and trimmed reason', async () => {
  await setStatus('verified', '  Manual approval  ');
  const log = (await db.query('SELECT * FROM public.admin_action_logs')).rows[0];
  assert.equal(log.admin_user_id, admin);
  assert.equal(log.target_user_id, client);
  assert.equal(log.company_id, company);
  assert.equal(log.action, 'set_kyc_status');
  assert.deepEqual(log.before_data, { kyc_status: 'not_verified', tax_id_status: null });
  assert.deepEqual(log.after_data, { kyc_status: 'verified', tax_id_status: null });
  assert.equal(log.reason, 'Manual approval');
  await setStatus('verified');
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.admin_action_logs')).rows[0].count, 1);
});

test('updates existing submissions and current documents, preserving unrelated documents', async () => {
  await db.query(`UPDATE public.users SET document_id_path = $2, document_selfie_path = $3 WHERE id = $1`,
    [client, `${client}/id.pdf`, `${client}/selfie.jpg`]);
  await db.query(`INSERT INTO public.kyc_tax_id_submissions(user_id, tax_id) VALUES ($1, 'TAX-1234')`, [client]);
  for (const [type, path] of [['identity', 'id.pdf'], ['selfie', 'selfie.jpg'], ['other', 'other.pdf']]) {
    await db.query(`INSERT INTO public.client_documents(user_id, document_type, storage_bucket, object_path)
      VALUES ($1, $2, 'kyc-documents', $3)`, [client, type, `${client}/${path}`]);
  }
  for (const [status, taxStatus, documentStatus] of [
    ['verified', 'verified', 'verified'], ['pending', 'pending', 'pending_review'],
    ['not_verified', 'rejected', 'rejected']
  ]) {
    await setStatus(status);
    const tax = (await db.query('SELECT * FROM public.kyc_tax_id_submissions')).rows[0];
    assert.equal(tax.status, taxStatus);
    assert.equal(tax.tax_id, 'TAX-1234');
    assert.equal(tax.reviewed_by, status === 'pending' ? null : admin);
    assert.equal(tax.review_reason, status === 'pending' ? null : 'Manual CRM correction');
    assert.equal(tax.reviewed_at === null, status === 'pending');
    const documents = (await db.query('SELECT document_type, status FROM public.client_documents')).rows;
    for (const doc of documents) assert.equal(doc.status, doc.document_type === 'other' ? 'uploaded' : documentStatus);
  }
});

test('company admin cannot edit another company or use an unapproved network', async () => {
  await rejects(() => setStatus('verified', 'Cross company', otherClient), /Account belongs to another company/);
  await login(admin, '192.0.2.2');
  await rejects(() => setStatus('verified'), /Administrator account and network belong to different companies/);
  await login(admin, '192.0.2.99');
  await rejects(() => setStatus('verified'), /Administrator network access required/);
  assert.equal(await statusOf(), 'not_verified');
  assert.equal(await statusOf(otherClient), 'not_verified');
});

test('platform admin can manage clients across companies on the platform network', async () => {
  await login(platformAdmin, '192.0.2.3');
  await setStatus('verified');
  await setStatus('verified', 'Platform approval', otherClient);
  assert.equal(await statusOf(otherClient), 'verified');
  await login(platformAdmin);
  await rejects(() => setStatus('pending', 'Cross company', otherClient), /Account belongs to another company/);
});

test('rejects non-admins, invalid status, missing client, and missing or short reasons', async () => {
  await login(client);
  await rejects(() => setStatus('verified'), /Administrator access required/);
  await login();
  for (const status of [null, '', 'rejected', 'unknown']) {
    await rejects(() => setStatus(status), /Invalid KYC status/);
  }
  for (const reason of [null, '', '  ', 'ab']) {
    await rejects(() => setStatus('verified', reason), /A reason of at least 3 characters is required/);
  }
  await rejects(() => setStatus('verified', 'Missing client', '20000000-0000-0000-0000-000000000099'), /Account not found/);
  assert.equal(await statusOf(), 'not_verified');
});

test('manual authorization is cleared and clients still cannot self-verify', async () => {
  await setStatus('verified');
  assert.equal((await db.query("SELECT current_setting('crm.kyc_status_edit_target', true) AS target")).rows[0].target, '');
  await setStatus('not_verified');
  await login(client);
  await rejects(() => db.query("UPDATE public.users SET kyc_status = 'verified' WHERE id = $1", [client]),
    /Administrator approval of identity documents and Tax ID is required/);
  // Even a forged target setting still requires administrator and tenant checks.
  await db.query("SELECT set_config('crm.kyc_status_edit_target', $1, false)", [client]);
  await rejects(() => db.query("UPDATE public.users SET kyc_status = 'verified' WHERE id = $1", [client]),
    /Administrator access required/);
});

test('existing review approval and rejection still work after manually reopening a submission', async () => {
  await db.query('UPDATE public.users SET document_id_path = $2, document_selfie_path = $3 WHERE id = $1',
    [client, `${client}/id.pdf`, `${client}/selfie.jpg`]);
  await db.query("INSERT INTO storage.objects VALUES ('kyc-documents', $1), ('kyc-documents', $2)",
    [`${client}/id.pdf`, `${client}/selfie.jpg`]);
  await db.query("INSERT INTO public.kyc_tax_id_submissions(user_id, tax_id) VALUES ($1, 'TAX-1234')", [client]);
  await setStatus('pending');
  await db.query("SELECT public.admin_review_kyc_application($1, 'approve', 'Reviewed documents')", [client]);
  assert.equal(await statusOf(), 'verified');
  await setStatus('pending');
  await db.query("SELECT public.admin_review_kyc_application($1, 'reject', 'Please resubmit')", [client]);
  assert.equal(await statusOf(), 'not_verified');
});

test('RPC permissions exclude anonymous users', async () => {
  const { rows } = await db.query(`SELECT
    has_function_privilege('anon', 'public.admin_set_user_kyc_status(uuid,text,text)', 'EXECUTE') AS anon,
    has_function_privilege('authenticated', 'public.admin_set_user_kyc_status(uuid,text,text)', 'EXECUTE') AS authenticated`);
  assert.deepEqual(rows[0], { anon: false, authenticated: true });
});
