import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const actor = '82000000-0000-0000-0000-000000000001';
const client = '82000000-0000-0000-0000-000000000002';
const outside = '82000000-0000-0000-0000-000000000003';
const company = '82000000-0000-0000-0000-000000000004';

async function edge(name, { isAdmin = false, allowed = true } = {}) {
  const calls = [];
  let handler;
  const result = data => ({ data, error: null });
  const admin = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'crm_is_ip_allowlisted') return result(true);
      if (name === 'crm_service_can_manage_account') return result(allowed && args.p_actor_id === actor && args.p_target_user_id === client);
      if (name === 'crm_service_actor_context') return result({ company_id: company, is_admin: isAdmin, access_scope: 'company' });
      throw new Error(`Unexpected RPC ${name}`);
    },
    auth: {
      getUser: async () => result({ user: { id: actor } }),
      admin: {
        updateUserById: async (id, changes) => { calls.push({ name: 'authPassword', id, changes }); return result(null); },
        deleteUser: async id => { calls.push({ name: 'authDelete', id }); return result(null); },
      },
    },
    storage: { from: () => ({ download: async path => {
      calls.push({ name: 'download', path });
      return result(new Blob(['private document'], { type: 'application/pdf' }));
    } }) },
    from: table => {
      const filters = {};
      let operation = 'select';
      const query = {
        select: () => query,
        eq: (key, value) => { filters[key] = value; return query; },
        in: () => query,
        update: data => { operation = 'update'; calls.push({ name: 'update', table, data }); return query; },
        delete: () => { operation = 'delete'; calls.push({ name: 'delete', table }); return query; },
        insert: data => { operation = 'insert'; calls.push({ name: 'insert', table, data }); return query; },
        single: () => query,
        maybeSingle: () => query,
        then: resolve => Promise.resolve(result(operation === 'select' && table === 'users'
          ? filters.id === actor ? { id: actor, is_admin: isAdmin }
            : { id: client, company_id: company, email: 'client@example.invalid' }
          : table === 'events' ? [] : null)).then(resolve),
      };
      return query;
    },
  };
  const source = (await readFile(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8'))
    .replace(/^import .*;\r?$/gm, '');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(js, {
    createClient: () => admin,
    Deno: { env: { get: () => 'test-value' }, serve: fn => { handler = fn; } },
    Request, Response, Blob, console: { error: () => {} },
  });
  return {
    calls,
    request: (body, headers = {}) => handler(new Request('https://test.invalid', {
      method: 'POST', headers: { Authorization: 'Bearer verified-actor-token', 'cf-connecting-ip': '192.0.2.1', ...headers },
      body: JSON.stringify(body),
    })),
  };
}

test('scoped staff can reset the selected client password with real actor authorization and company audit', async () => {
  const app = await edge('admin-user-management');
  const response = await app.request({ action: 'set_password', target_user_id: client, password: 'New password 123', reason: 'Client request', actor_id: outside, company_id: outside });
  assert.equal(response.status, 200);
  assert.deepEqual(app.calls.filter(c => c.name === 'authPassword').map(c => c.id), [client]);
  const guard = app.calls.find(c => c.name === 'crm_service_can_manage_account');
  assert.equal(guard.args.p_actor_id, actor);
  assert.equal(guard.args.p_target_user_id, client);
  assert.equal(guard.args.p_ip, '192.0.2.1');
  assert.ok(app.calls.indexOf(guard) < app.calls.findIndex(c => c.name === 'authPassword'));
  const audit = app.calls.find(c => c.name === 'insert' && c.table === 'admin_action_logs');
  assert.equal(audit.data.company_id, company);
  assert.equal(audit.data.admin_user_id, actor);
});

for (const action of ['set_password', 'delete_user']) {
  test(`${action} rejects out-of-scope clients before any mutation`, async () => {
    const app = await edge('admin-user-management');
    const response = await app.request({ action, target_user_id: outside, password: 'Password 123', confirmation_email: 'client@example.invalid', reason: 'Scope test' });
    assert.equal(response.status, 403);
    assert.equal(app.calls.some(c => ['authPassword','authDelete','update','delete','insert'].includes(c.name)), false);
  });
}

test('authorized staff deletion preserves shared events and uses exact target and company audit', async () => {
  const app = await edge('admin-user-management');
  const response = await app.request({ action: 'delete_user', target_user_id: client, confirmation_email: 'client@example.invalid', reason: 'Confirmed deletion' });
  assert.equal(response.status, 200);
  assert.deepEqual(app.calls.filter(c => c.name === 'authDelete').map(c => c.id), [client]);
  assert.ok(app.calls.findIndex(c => c.name === 'update' && c.table === 'events') < app.calls.findIndex(c => c.name === 'authDelete'));
  assert.equal(app.calls.find(c => c.name === 'insert' && c.table === 'admin_action_logs').data.company_id, company);
});

for (const action of ['create_user','delete_company','delete_office']) {
  test(`staff cannot invoke global ${action}`, async () => {
    const app = await edge('admin-user-management');
    assert.equal((await app.request({ action, target_user_id: client, reason: 'Denied global action' })).status, 403);
    assert.equal(app.calls.some(c => ['authPassword','authDelete','update','delete','insert'].includes(c.name)), false);
  });
}

test('document downloads authorize the UUID in the storage path for the verified actor', async () => {
  const app = await edge('admin-kyc-document');
  assert.equal((await app.request({ path: `${client}/id.pdf`, actor_id: outside })).status, 200);
  const guard = app.calls.find(c => c.name === 'crm_service_can_manage_account');
  assert.equal(guard.args.p_actor_id, actor);
  assert.equal(guard.args.p_target_user_id, client);
  assert.deepEqual(app.calls.filter(c => c.name === 'download').map(c => c.path), [`${client}/id.pdf`]);
});

test('document access denies unassigned clients and invalid paths without storage reads', async () => {
  const app = await edge('admin-kyc-document');
  assert.equal((await app.request({ path: `${outside}/id.pdf` })).status, 403);
  for (const path of [`${client}/../id.pdf`, '/id.pdf', 'no-client/id.pdf']) {
    assert.equal((await app.request({ path })).status, 400);
  }
  assert.equal(app.calls.some(c => c.name === 'download'), false);
});

test('account and document handlers require trusted network header before authorizing mutations', async () => {
  for (const name of ['admin-user-management','admin-kyc-document']) {
    const app = await edge(name);
    assert.equal((await app.request({ action: 'set_password', target_user_id: client, path: `${client}/id.pdf` }, { 'cf-connecting-ip': '', 'x-forwarded-for': '192.0.2.1' })).status, 403);
    assert.equal(app.calls.length, 0);
  }
});
