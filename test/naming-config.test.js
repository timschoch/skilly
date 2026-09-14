import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadNamingConfig, mergeNamingConfig } from '../bundles/workflow/skills/naming/scripts/config.mjs';

test('objects merge by key, at every depth', () => {
  const merged = mergeNamingConfig(
    { shortWords: { opts: 'options', err: 'error' }, discriminant: 'kind' },
    { shortWords: { dto: 'data transfer object' } },
  );
  assert.deepEqual(merged, {
    shortWords: { opts: 'options', err: 'error', dto: 'data transfer object' },
    discriminant: 'kind',
  });
});

test('null in the override drops the key', () => {
  assert.deepEqual(mergeNamingConfig({ shortWords: { opts: 'options' } }, { shortWords: { opts: null } }), {
    shortWords: {},
  });
  assert.deepEqual(mergeNamingConfig({ allow: ['^opts$'], discriminant: 'kind' }, { allow: null }), {
    discriminant: 'kind',
  });
});

test('arrays append, dedupe and keep their order', () => {
  assert.deepEqual(mergeNamingConfig({ noiseWords: ['Data', 'Info'] }, { noiseWords: ['Info', 'Wrapper'] }), {
    noiseWords: ['Data', 'Info', 'Wrapper'],
  });
});

test('a leading dash in the override removes the entry it names', () => {
  assert.deepEqual(mergeNamingConfig({ noiseWords: ['Data', 'Info'] }, { noiseWords: ['-Data', 'Wrapper'] }), {
    noiseWords: ['Info', 'Wrapper'],
  });
});

test('a scalar override replaces the base value', () => {
  assert.deepEqual(mergeNamingConfig({ discriminant: 'kind' }, { discriminant: 'type' }), { discriminant: 'type' });
});

test('$comment is dropped from the base and from the override', () => {
  const merged = mergeNamingConfig(
    { $comment: 'the defaults', synonyms: { $comment: 'keyed by the wrong prefix', retrieve: 'get' } },
    { $comment: 'my repo', synonyms: { $comment: 'mine', grab: 'get' } },
  );
  assert.deepEqual(merged, { synonyms: { retrieve: 'get', grab: 'get' } });
});

test('example arrays hold objects, so they append without dedupe', () => {
  const example = { good: 'getUser', bad: 'grabUser' };
  const merged = mergeNamingConfig({ examples: [example] }, { examples: [example, { good: 'listUsers' }] });
  assert.deepEqual(merged.examples, [example, example, { good: 'listUsers' }]);
});

test('loadNamingConfig reads the defaults and merges the repo override', () => {
  const root = mkdtempSync(join(tmpdir(), 'skilly-naming-config-'));
  const defaults = loadNamingConfig(root);
  assert.equal(defaults.discriminant, 'kind');
  assert.equal(defaults.shortWords.opts, 'options');
  assert.equal(defaults.$comment, undefined);

  mkdirSync(join(root, 'docs', 'agents'), { recursive: true });
  writeFileSync(join(root, 'docs', 'agents', 'naming.json'), JSON.stringify({ discriminant: 'type' }));
  assert.equal(loadNamingConfig(root).discriminant, 'type');
});

test('loadNamingConfig names the file when the override is malformed', () => {
  const root = mkdtempSync(join(tmpdir(), 'skilly-naming-config-'));
  mkdirSync(join(root, 'docs', 'agents'), { recursive: true });
  writeFileSync(join(root, 'docs', 'agents', 'naming.json'), '{ not json');
  assert.throws(() => loadNamingConfig(root), /docs\/agents\/naming\.json/);
});
