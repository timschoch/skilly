import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolveBundles } from '../lib/resolve.js';
import { planAdds, planPrunes } from '../lib/sync.js';

const bundlesDir = fileURLToPath(new URL('./fixtures/bundles', import.meta.url));

test('resolves includes recursively and unions sources', () => {
  const resolved = resolveBundles(['alpha'], bundlesDir);
  assert.deepEqual(resolved.bundles, ['gamma', 'beta', 'alpha']);
  assert.deepEqual([...resolved.sources.get('owner/one')].sort(), ['a-skill', 'b-skill', 'shared-skill']);
  assert.deepEqual([...resolved.sources.get('owner/two')], ['c-skill']);
  assert.deepEqual([...resolved.rules], ['conventional-commits']);
  assert.deepEqual([...resolved.ruleFiles.keys()], ['alpha-rule']);
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

test('duplicate rule-file name across bundles is a hard error', () => {
  assert.throws(() => resolveBundles(['dup-b'], bundlesDir), /"same-name\.md" declared by both "dup-a" and "dup-b"/);
});

test('planAdds lists only unpinned skills, grouped by source', () => {
  const sources = new Map([['owner/one', new Set(['a-skill', 'b-skill'])]]);
  const lock = { 'a-skill': { source: 'owner/one' } };
  assert.deepEqual(planAdds(sources, lock), [{ source: 'owner/one', skills: ['b-skill'] }]);
  assert.deepEqual(planAdds(sources, { 'a-skill': {}, 'b-skill': {} }), []);
});

test('planPrunes flags unwanted pins from bundled sources only', () => {
  const sources = new Map([['owner/one', new Set(['a-skill'])]]);
  const lock = {
    'a-skill': { source: 'owner/one' },
    'stale-skill': { source: 'owner/one' },
    'hand-pin': { source: 'owner/elsewhere' },
  };
  assert.deepEqual(planPrunes(sources, lock), ['stale-skill']);
});
