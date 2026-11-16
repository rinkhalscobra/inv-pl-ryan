import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = (await readFile(new URL('../src/hooks/useAuth.ts', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?$/gm, '');
const code = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

// Exercise the actual auth subscription with React's functional-setter
// semantics. User reference changes drive the dependent workspace effects.
async function authSubscription(initialSession) {
  const values = [];
  const changes = [];
  const presence = [];
  let stateIndex = 0;
  let callback;
  let cleanup;
  let unsubscribed = false;
  const context = {
    exports: {},
    useState: initial => {
      const index = stateIndex++;
      values[index] = initial;
      return [initial, update => {
        const next = typeof update === 'function' ? update(values[index]) : update;
        if (!Object.is(values[index], next)) changes.push(index);
        values[index] = next;
      }];
    },
    useEffect: effect => { cleanup = effect(); },
    supabase: { auth: {
      getSession: async () => ({ data: { session: initialSession } }),
      onAuthStateChange: listener => {
        callback = listener;
        return { data: { subscription: { unsubscribe: () => { unsubscribed = true; } } } };
      },
    } },
    syncClientPresence: (id, token) => presence.push({ id, token }),
    endClientPresence: async () => {},
  };
  vm.runInNewContext(code, context);
  context.exports.useAuth();
  await Promise.resolve();
  return {
    user: () => values[0],
    session: () => values[1],
    loading: () => values[2],
    userChanges: () => changes.filter(index => index === 0).length,
    presence,
    emit: (event, session) => callback(event, session),
    close: () => { cleanup(); return unsubscribed; },
  };
}

const profile = { id: 'client-a', email: 'client-a@example.invalid', user_metadata: { name: 'Client A' } };
const session = (user = profile, token = 'initial-token') => ({ user, access_token: token });

test('returning-tab auth events keep the same User reference without restarting workspace effects', async () => {
  const auth = await authSubscription(session());
  assert.equal(auth.user(), profile);
  assert.equal(auth.loading(), false);
  for (let visit = 0; visit < 3; visit++) {
    for (const event of ['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED']) {
      const next = session(structuredClone(profile), `${event}-${visit}`);
      auth.emit(event, next);
      assert.equal(auth.user(), profile, `${event} must preserve the account reference`);
      assert.equal(auth.session(), next, 'Refreshed tokens must still be installed');
      assert.equal(auth.loading(), false);
    }
  }
  assert.equal(auth.userChanges(), 1, 'Only the initial login changes the workspace identity');
  assert.equal(auth.presence.at(-1).token, 'TOKEN_REFRESHED-2');
  assert.equal(auth.close(), true);
});

test('explicit profile updates remain visible for the same account', async () => {
  const auth = await authSubscription(session());
  const updated = { ...profile, email: 'updated@example.invalid', user_metadata: { name: 'Updated name' } };
  auth.emit('USER_UPDATED', session(updated, 'updated-token'));
  assert.equal(auth.user(), updated);
  assert.equal(auth.userChanges(), 2);
  auth.emit('TOKEN_REFRESHED', session(structuredClone(updated), 'refreshed-token'));
  assert.equal(auth.user(), updated);
  assert.equal(auth.userChanges(), 2);
});

test('switching accounts and signing out change the workspace identity', async () => {
  const auth = await authSubscription(session());
  const other = { ...profile, id: 'client-b', email: 'client-b@example.invalid' };
  auth.emit('SIGNED_IN', session(other));
  assert.equal(auth.user(), other);
  auth.emit('SIGNED_OUT', null);
  assert.equal(auth.user(), null);
  assert.equal(auth.session(), null);
  assert.equal(auth.userChanges(), 3);
  auth.emit('SIGNED_IN', session(profile));
  assert.equal(auth.user(), profile);
  assert.equal(auth.userChanges(), 4);
});

test('an empty session still clears a previously authenticated account', async () => {
  const auth = await authSubscription(session());
  auth.emit('TOKEN_REFRESHED', null);
  assert.equal(auth.user(), null);
  assert.equal(auth.session(), null);
  assert.equal(auth.userChanges(), 2);
});

test('an initially signed-out user can sign in normally', async () => {
  const auth = await authSubscription(null);
  assert.equal(auth.user(), null);
  assert.equal(auth.userChanges(), 0);
  auth.emit('SIGNED_IN', session(profile));
  assert.equal(auth.user(), profile);
  assert.equal(auth.userChanges(), 1);
});
