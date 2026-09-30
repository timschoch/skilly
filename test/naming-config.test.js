import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadNamingConfig, migrateAllow } from '../bundles/workflow/skills/naming/scripts/config.mjs';
import { validateNaming } from '../bundles/workflow/skills/naming/scripts/check.mjs';
import { validateAndUpdateSkilly } from '../lib/validate-and-update-skilly.js';

// A consumer root holding `.skilly/naming.json` with the given content.
const consumerWith = (override) => {
  const root = mkdtempSync(join(tmpdir(), 'skilly-naming-config-'));
  mkdirSync(join(root, '.skilly'), { recursive: true });
  writeFileSync(join(root, '.skilly', 'naming.json'), JSON.stringify(override, null, 2));
  return root;
};
const readOverride = (root) => JSON.parse(readFileSync(join(root, '.skilly', 'naming.json'), 'utf8'));

test('migrateAllow converts the old flat list and keeps the same effect', () => {
  const files = {
    'src/opts/a.ts': 'const opts = 1;\nconst err = 2;\n',
    '.env.example': 'stripeKey=1\n',
  };
  const root = consumerWith({ discriminant: 'kind', allow: ['^opts$', 'stripeKey', '-ignored'] });
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), source);
  }
  // What the old gate did with this list: `opts` exempt as name and as path, `err` flagged.
  const oldResult = ['short-word err'];

  assert.equal(migrateAllow(root), join(root, '.skilly', 'naming.json'));
  const migrated = readOverride(root);
  assert.equal(migrated.discriminant, 'kind');
  assert.deepEqual(Object.keys(migrated.allow), ['^opts$', '^opts$ (path)', 'stripeKey', 'stripeKey (path)']);
  assert.deepEqual(migrated.allow['^opts$ (path)'].rules, ['file-case']);
  assert.ok(!migrated.allow['^opts$'].rules.includes('discriminant'));

  const { failures } = validateNaming({ root, files: Object.keys(files) });
  assert.deepEqual(
    failures.map((finding) => `${finding.rule} ${finding.name}`),
    oldResult,
  );
  assert.equal(migrateAllow(root), null, 'a file already in the new shape is left alone');
});

test('validateAndUpdateSkilly converts the old allow list on every skilly verb', () => {
  const root = consumerWith({ allow: ['^opts$'] });
  writeFileSync(join(root, 'skills-lock.json'), '{}');
  writeFileSync(join(root, '.skilly', 'config.json'), JSON.stringify({ bundles: [] }));
  validateAndUpdateSkilly(root);
  assert.ok(!Array.isArray(readOverride(root).allow));
});

test('loadNamingConfig reads the defaults and merges the repo override', () => {
  const root = mkdtempSync(join(tmpdir(), 'skilly-naming-config-'));
  const defaults = loadNamingConfig(root);
  assert.equal(defaults.discriminant, 'kind');
  assert.equal(defaults.shortWords.opts, 'options');
  assert.equal(defaults.$comment, undefined);

  mkdirSync(join(root, '.skilly'), { recursive: true });
  writeFileSync(join(root, '.skilly', 'naming.json'), JSON.stringify({ discriminant: 'type' }));
  assert.equal(loadNamingConfig(root).discriminant, 'type');
});

test('loadNamingConfig falls back to the pre-.skilly override path', () => {
  const root = mkdtempSync(join(tmpdir(), 'skilly-naming-config-'));
  mkdirSync(join(root, 'docs', 'agents'), { recursive: true });
  writeFileSync(join(root, 'docs', 'agents', 'naming.json'), JSON.stringify({ discriminant: 'type' }));
  assert.equal(loadNamingConfig(root).discriminant, 'type');

  // The new path wins wherever both exist.
  mkdirSync(join(root, '.skilly'), { recursive: true });
  writeFileSync(join(root, '.skilly', 'naming.json'), JSON.stringify({ discriminant: 'sort' }));
  assert.equal(loadNamingConfig(root).discriminant, 'sort');
});

test('loadNamingConfig names the file when the override is malformed', () => {
  const root = mkdtempSync(join(tmpdir(), 'skilly-naming-config-'));
  mkdirSync(join(root, '.skilly'), { recursive: true });
  writeFileSync(join(root, '.skilly', 'naming.json'), '{ not json');
  assert.throws(() => loadNamingConfig(root), /\.skilly\/naming\.json/);
});
