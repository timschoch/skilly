import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeBundles, pickPrivateOwner } from '../bundles/setup-project/skills/setup-skilly/scripts/onboard.js';
import { scaffoldCallerWorkflow, setPrivateOwner, CALLER_WORKFLOW_PATH } from '../lib/caller-workflow.js';

test('mergeBundles keeps existing order, appends new, dedupes', () => {
  assert.deepEqual(mergeBundles(['a', 'b'], ['b', 'c']), ['a', 'b', 'c']);
  assert.deepEqual(mergeBundles([], ['x']), ['x']);
  assert.deepEqual(mergeBundles(['x'], ['x']), ['x']);
});

test('pickPrivateOwner: no private foreign sources -> null', () => {
  const isPrivate = (s) => s === 'me/private-thing';
  assert.equal(pickPrivateOwner(['me/private-thing', 'other/public-thing'], 'me', isPrivate), null);
});

test('pickPrivateOwner: one private foreign owner -> that owner', () => {
  const isPrivate = (s) => s.startsWith('other/');
  assert.equal(pickPrivateOwner(['me/a', 'other/b'], 'me', isPrivate), 'other');
});

test('pickPrivateOwner: two private foreign owners -> hard error', () => {
  assert.throws(
    () => pickPrivateOwner(['one/a', 'two/b'], 'me', () => true),
    /one private-owner per consumer/,
  );
});

test('scaffoldCallerWorkflow writes once, then skips', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'skilly-test-'));
  assert.equal(scaffoldCallerWorkflow(cwd), true);
  const path = join(cwd, CALLER_WORKFLOW_PATH);
  assert.equal(existsSync(path), true);
  const body = readFileSync(path, 'utf8');
  assert.match(body, /uses: timschoch\/skilly\/\.github\/workflows\/sync\.yml@main/);
  assert.match(body, /cron: "\d{1,2} 3 \* \* \*"/);
  assert.equal(scaffoldCallerWorkflow(cwd), false); // idempotent
});

test('setPrivateOwner inserts, is idempotent, replaces a stale owner', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'skilly-test-'));
  scaffoldCallerWorkflow(cwd);
  const path = join(cwd, CALLER_WORKFLOW_PATH);

  assert.equal(setPrivateOwner(cwd, 'admin-laicadev'), true);
  assert.match(readFileSync(path, 'utf8'), /with:\n      private-owner: admin-laicadev\n/);

  assert.equal(setPrivateOwner(cwd, 'admin-laicadev'), false); // idempotent

  assert.equal(setPrivateOwner(cwd, 'swissdesign-md'), true);
  const body = readFileSync(path, 'utf8');
  assert.match(body, /private-owner: swissdesign-md/);
  assert.doesNotMatch(body, /admin-laicadev/);
});
