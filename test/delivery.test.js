import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { autoMerge, deliver, prBody, SYNC_BRANCH, startSync } from '../engine/lib/delivery.js';
import { fakeSkills, makeCheckout, makeSnapshot } from './fixtures/sync.js';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

// A Consumer clone with a bare origin, so delivery pushes for real.
function makeClone(config) {
  const cwd = makeCheckout(config);
  const origin = mkdtempSync(join(tmpdir(), 'skilly-origin-'));
  git(origin, 'init', '-q', '--bare', '-b', 'main');
  git(cwd, 'init', '-q', '-b', 'main');
  git(cwd, 'config', 'user.name', 'test');
  git(cwd, 'config', 'user.email', 'test@example.com');
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'init');
  git(cwd, 'remote', 'add', 'origin', origin);
  git(cwd, 'push', '-q', 'origin', 'main');
  git(cwd, 'remote', 'set-head', 'origin', 'main');
  return { cwd, origin };
}

// Stands in for gh: records each call and keeps the open Sync PR.
function fakeGh() {
  const calls = [];
  let pr = null;
  const gh = (args) => {
    calls.push(args);
    if (args[0] === 'pr' && args[1] === 'list') return JSON.stringify(pr ? [pr] : []);
    if (args[0] === 'pr' && args[1] === 'create') {
      pr = { number: 7, url: 'https://github.com/owner/repo/pull/7' };
      return pr.url;
    }
    return '';
  };
  return { gh, calls, verbs: () => calls.map((args) => args.slice(0, 2).join(' ')) };
}

const report = (overrides = {}) => ({
  release: { before: 'v1.0.0', after: 'v1.1.0' },
  bundles: { removed: [] },
  skills: { added: [], removed: [], updated: [] },
  files: [],
  engine: { hash: 'abc' },
  ...overrides,
});

test('auto-merge is on for a minor or patch Release without removals', () => {
  assert.equal(autoMerge(report()).on, true);
});

test('auto-merge is off for a new major Release', () => {
  const result = autoMerge(report({ release: { before: 'v1.4.0', after: 'v2.0.0' } }));
  assert.equal(result.on, false);
  assert.match(result.reason, /major/);
});

test('auto-merge is off when the Sync removes a skill or the Release drops a Bundle', () => {
  assert.equal(autoMerge(report({ skills: { added: [], removed: ['x'], updated: [] } })).on, false);
  assert.equal(autoMerge(report({ bundles: { removed: ['old'] } })).on, false);
});

test('auto-merge is off for the first Sync, which has no Release to compare', () => {
  assert.equal(autoMerge(report({ release: { before: null, after: 'v1.0.0' } })).on, false);
});

test('the PR body comes from the Sync report and names removals first', () => {
  const body = prBody(report({ skills: { added: ['a'], removed: ['r'], updated: ['u'] }, files: ['f1'] }));
  assert.match(body, /v1\.0\.0 → v1\.1\.0/);
  assert.ok(body.indexOf('Removed') < body.indexOf('Added'));
  assert.match(body, /- `f1`/);
  assert.match(body, /Auto-merge: off/);
});

test('delivery twice opens one Sync PR, then updates it', () => {
  const { cwd, origin } = makeClone({ hub: 'v1.0.0', bundles: ['hubby'] });
  const { gh, calls, verbs } = fakeGh();
  const first = deliver({ cwd, snapshot: makeSnapshot('v1.1.0'), skills: fakeSkills(), gh });
  const second = deliver({ cwd, snapshot: makeSnapshot('v1.1.0'), skills: fakeSkills(), gh });

  assert.equal(first.pr.created, true);
  assert.equal(second.pr.created, false);
  assert.equal(second.pr.url, first.pr.url);
  assert.equal(verbs().filter((verb) => verb === 'pr create').length, 1);
  assert.equal(verbs().filter((verb) => verb === 'pr edit').length, 1);
  assert.deepEqual(calls.find((args) => args[1] === 'create').slice(0, 6), [
    'pr',
    'create',
    '--base',
    'main',
    '--head',
    SYNC_BRANCH,
  ]);
  // The branch holds one Sync commit on top of the default branch.
  assert.equal(git(origin, 'rev-list', '--count', `main..${SYNC_BRANCH}`), '1');
  assert.match(git(origin, 'show', `${SYNC_BRANCH}:.skilly/engine/bin/skilly.js`), /engine v1\.1\.0/);
});

test('delivery leaves the person checkout as it was', () => {
  const { cwd } = makeClone({ hub: 'v1.0.0', bundles: ['hubby'] });
  git(cwd, 'checkout', '-q', '-b', 'feat/mine');
  deliver({ cwd, snapshot: makeSnapshot('v1.1.0'), skills: fakeSkills(), gh: fakeGh().gh });
  assert.equal(git(cwd, 'branch', '--show-current'), 'feat/mine');
  assert.equal(git(cwd, 'status', '--porcelain'), '');
  assert.equal(git(cwd, 'worktree', 'list').split('\n').length, 1);
});

test('delivery applies the auto-merge rule to the Sync PR', () => {
  const on = fakeGh();
  deliver({ cwd: makeClone({ hub: 'v1.0.0' }).cwd, snapshot: makeSnapshot('v1.1.0'), skills: fakeSkills(), gh: on.gh });
  assert.ok(on.calls.some((args) => args[1] === 'merge' && args.includes('--auto')));

  const off = fakeGh();
  deliver({
    cwd: makeClone({ hub: 'v1.0.0' }).cwd,
    snapshot: makeSnapshot('v2.0.0'),
    skills: fakeSkills(),
    gh: off.gh,
  });
  assert.ok(off.calls.some((args) => args[1] === 'merge' && args.includes('--disable-auto')));
  assert.ok(!off.calls.some((args) => args.includes('--auto')));
});

test('delivery with nothing to sync pushes nothing and opens no PR', () => {
  const { cwd, origin } = makeClone({ hub: 'v1.1.0' });
  const { gh, calls } = fakeGh();
  // The first Sync writes the Engine; land it on main so the second has nothing left.
  deliver({ cwd, snapshot: makeSnapshot('v1.1.0'), skills: fakeSkills(), gh });
  git(origin, 'update-ref', 'refs/heads/main', `refs/heads/${SYNC_BRANCH}`);
  calls.length = 0;
  const result = deliver({ cwd, snapshot: makeSnapshot('v1.1.0'), skills: fakeSkills(), gh });
  assert.equal(result.pr, null);
  assert.deepEqual(calls, []);
});

test('skilly sync runs the newest Release Engine, not the pinned or local one', () => {
  const cwd = makeCheckout({ hub: 'v1.0.0' });
  const fetched = [];
  const ran = [];
  const status = startSync({
    cwd,
    latestRelease: () => 'v1.2.0',
    fetchSnapshot: (tag) => (fetched.push(tag), { ...makeSnapshot(tag), cleanup: () => ran.push('cleanup') }),
    runEngine: (bin, args) => (ran.push([bin, args]), 0),
  });
  assert.equal(status, 0);
  assert.deepEqual(fetched, ['v1.2.0']);
  const [bin, args] = ran[0];
  assert.match(bin, /skilly-snapshot-.*\/engine\/bin\/skilly\.js$/);
  assert.equal(args[0], 'deliver');
  assert.equal(args[2], 'v1.2.0');
  assert.equal(ran[1], 'cleanup');
});
