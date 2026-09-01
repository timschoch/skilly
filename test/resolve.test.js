import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBundles } from '../lib/resolve.js';

const bundlesDir = fileURLToPath(new URL('./fixtures/bundles', import.meta.url));

test('resolves includes recursively and unions sources', () => {
  const resolved = resolveBundles(['alpha'], bundlesDir);
  assert.deepEqual(resolved.bundles, ['gamma', 'beta', 'alpha']);
  assert.deepEqual([...resolved.sources.get('owner/one')].sort(), ['a-skill', 'b-skill', 'shared-skill']);
  assert.deepEqual([...resolved.sources.get('owner/two')], ['c-skill']);
});

test('rules map to their declaring bundle and its check script', () => {
  const resolved = resolveBundles(['alpha'], bundlesDir);
  assert.deepEqual([...resolved.rules.keys()], ['conventional-commits']);
  const { bundle, script } = resolved.rules.get('conventional-commits');
  assert.equal(bundle, 'gamma');
  assert.equal(script, join(bundlesDir, 'gamma', 'rules', 'conventional-commits.sh'));
});

test('a bundle listed twice resolves once', () => {
  const resolved = resolveBundles(['alpha', 'beta'], bundlesDir);
  assert.deepEqual(resolved.bundles, ['gamma', 'beta', 'alpha']);
});

test('include cycle is a hard error', () => {
  assert.throws(() => resolveBundles(['cycle-x'], bundlesDir), /cycle: cycle-x -> cycle-y -> cycle-x/);
});

test('unknown bundle is a hard error', () => {
  assert.throws(() => resolveBundles(['nope'], bundlesDir), /unknown bundle "nope"/);
});

test('a rule without its check script is a hard error', () => {
  assert.throws(() => resolveBundles(['norule'], bundlesDir), /rule "ghost" declared by "norule" has no /);
});
