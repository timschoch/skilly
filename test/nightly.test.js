import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { appJwt, EDITED_ENGINE_TITLE, nightly } from '../scripts/nightly.mjs';

// Two allowed accounts and one stranger. Each repo: its default branch and
// whether it holds .skilly/config.json.
const ACCOUNTS = {
  timschoch: [
    { name: 'timschoch/skilly', branch: 'main', consumer: true },
    { name: 'timschoch/app', branch: 'main', consumer: true },
    { name: 'timschoch/notes', branch: 'main', consumer: false },
  ],
  'admin-laicadev': [{ name: 'admin-laicadev/stack', branch: 'master', consumer: true }],
  stranger: [{ name: 'stranger/repo', branch: 'main', consumer: true }],
};

// Stands in for the App, gh, the clone, the Engine check and the delivery.
function world({ edited = [], failing = [], issues = [] } = {}) {
  const calls = { tokens: [], delivered: [], gh: [] };
  const installations = Object.keys(ACCOUNTS).map((owner, id) => ({ id, owner }));
  const app = {
    installations: () => installations,
    token: (id) => {
      calls.tokens.push(installations[id].owner);
      return `token-${installations[id].owner}`;
    },
  };
  const gh = (args, token) => {
    calls.gh.push({ args, token });
    const path = (args[0] === 'api' && args.find((arg) => arg.includes('/'))) || '';
    if (path === '/installation/repositories') {
      const owner = token.replace('token-', '');
      return ACCOUNTS[owner].map(({ name, branch }) => JSON.stringify({ name, branch })).join('\n');
    }
    if (path.endsWith('/contents/.skilly/config.json')) {
      const repo = Object.values(ACCOUNTS)
        .flat()
        .find(({ name }) => path === `repos/${name}/contents/.skilly/config.json`);
      if (!repo.consumer) throw new Error('gh api failed: gh: Not Found (HTTP 404)');
      return '.skilly/config.json';
    }
    if (args[0] === 'issue' && args[1] === 'list') return JSON.stringify(issues);
    return '';
  };
  return {
    calls,
    app,
    gh,
    clone: (repo) => ({ dir: `/clones/${repo.name}`, cleanup: () => {} }),
    engineEdited: (dir) => edited.some((name) => dir === `/clones/${name}`),
    deliver: ({ dir, token, branch }) => {
      if (failing.some((name) => dir === `/clones/${name}`)) throw new Error('push rejected');
      calls.delivered.push({ dir, token, branch });
    },
    release: 'v1.2.0',
    log: () => {},
  };
}

test('syncs each Consumer of an allowed owner with its own installation token and default branch', () => {
  const fixture = world();
  const result = nightly(fixture);
  assert.deepEqual(fixture.calls.delivered, [
    { dir: '/clones/timschoch/app', token: 'token-timschoch', branch: 'main' },
    { dir: '/clones/admin-laicadev/stack', token: 'token-admin-laicadev', branch: 'master' },
  ]);
  assert.deepEqual(result.synced, ['timschoch/app', 'admin-laicadev/stack']);
});

test('ignores an install by an owner not on the allowlist, and mints no token for it', () => {
  const fixture = world();
  const result = nightly(fixture);
  assert.ok(!fixture.calls.tokens.includes('stranger'));
  assert.ok(!result.synced.includes('stranger/repo'));
});

test('skips the Hub, which runs main, and repos without .skilly/config.json', () => {
  const fixture = world();
  const result = nightly(fixture);
  assert.ok(!result.synced.includes('timschoch/skilly'));
  assert.ok(!result.synced.includes('timschoch/notes'));
});

test('an edited Engine skips that Consumer and opens one issue there, the others still sync', () => {
  const fixture = world({ edited: ['timschoch/app'] });
  const result = nightly(fixture);
  assert.deepEqual(result.edited, ['timschoch/app']);
  assert.deepEqual(result.synced, ['admin-laicadev/stack']);
  const create = fixture.calls.gh.find(({ args }) => args[0] === 'issue' && args[1] === 'create');
  assert.ok(create.args.includes('timschoch/app'));
  assert.ok(create.args.includes(EDITED_ENGINE_TITLE));
  assert.equal(create.token, 'token-timschoch');
});

test('an edited Engine updates the open issue instead of opening a second one', () => {
  const fixture = world({ edited: ['timschoch/app'], issues: [{ number: 4, title: EDITED_ENGINE_TITLE }] });
  nightly(fixture);
  const verbs = fixture.calls.gh
    .filter(({ args }) => args[0] === 'issue')
    .map(({ args }) => args.slice(0, 3).join(' '));
  assert.deepEqual(verbs, ['issue list --repo', 'issue edit 4']);
});

test('a failing Consumer is reported and the others still sync', () => {
  const fixture = world({ failing: ['timschoch/app'] });
  const result = nightly(fixture);
  assert.deepEqual(result.failed, [{ repo: 'timschoch/app', error: 'push rejected' }]);
  assert.deepEqual(result.synced, ['admin-laicadev/stack']);
});

test('a dry run checks every Consumer and delivers nothing', () => {
  const fixture = world({ edited: ['timschoch/app'] });
  const result = nightly({ ...fixture, dryRun: true });
  assert.deepEqual(fixture.calls.delivered, []);
  assert.ok(!fixture.calls.gh.some(({ args }) => args[0] === 'issue'));
  assert.deepEqual(result.edited, ['timschoch/app']);
  assert.deepEqual(result.synced, ['admin-laicadev/stack']);
});

test('--repo limits the run to one Consumer', () => {
  const fixture = world();
  const result = nightly({ ...fixture, only: 'Admin-Laicadev/stack' });
  assert.deepEqual(result.synced, ['admin-laicadev/stack']);
});

test('appJwt signs an RS256 token the App public key verifies, issued by the App ID', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs1', format: 'pem' });
  const jwt = appJwt('4778931', pem, 1_000_000_000_000);
  const [header, payload, signature] = jwt.split('.');
  assert.ok(verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, 'base64url')));
  const claims = JSON.parse(Buffer.from(payload, 'base64url'));
  assert.equal(claims.iss, '4778931');
  assert.ok(claims.exp - claims.iat <= 600);
});
