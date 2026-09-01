import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchName } from '../lib/match.js';
import { planRemovals } from '../lib/remove.js';
import { pickPrivateOwner } from '../lib/add.js';
import { updateRules } from '../lib/update-rules.js';
import * as skillyFile from '../lib/skilly-file.js';

const bundlesDir = fileURLToPath(new URL('./fixtures/bundles', import.meta.url));
const freshDir = () => mkdtempSync(join(tmpdir(), 'skilly-test-'));

test('matchName: bundle beats skill, skills resolve to their source, unknown is null', () => {
  assert.deepEqual(matchName('alpha', bundlesDir), { type: 'bundle', name: 'alpha' });
  assert.deepEqual(matchName('c-skill', bundlesDir), { type: 'skill', name: 'c-skill', source: 'owner/two' });
  assert.equal(matchName('nope', bundlesDir), null);
});

test('planRemovals keeps claimed skills and skips names not in the lock', () => {
  const candidates = new Set(['gone', 'claimed', 'never-installed']);
  const claimed = new Set(['claimed']);
  const lock = { gone: {}, claimed: {} };
  assert.deepEqual(planRemovals(candidates, claimed, lock), ['gone']);
});

test('pickPrivateOwner: one foreign private owner passes, two are a hard error', () => {
  const isPrivate = (source) => source.startsWith('priv');
  assert.equal(pickPrivateOwner(['me/a', 'pub/b'], 'me', isPrivate), null);
  assert.equal(pickPrivateOwner(['me/a', 'priv/b'], 'me', isPrivate), 'priv');
  assert.throws(() => pickPrivateOwner(['priv/a', 'priv2/b'], 'me', isPrivate), /one private-owner per consumer/);
});

test('skilly-file: create, add and remove bundles, empty bundles stay legal', () => {
  const cwd = freshDir();
  assert.equal(skillyFile.create(cwd), true);
  assert.deepEqual(skillyFile.read(cwd), { bundles: [] });
  assert.equal(skillyFile.addBundle(cwd, 'alpha'), true);
  assert.equal(skillyFile.addBundle(cwd, 'alpha'), false);
  assert.deepEqual(skillyFile.read(cwd), { bundles: ['alpha'] });
  assert.equal(skillyFile.removeBundle(cwd, 'alpha'), true);
  assert.deepEqual(skillyFile.read(cwd), { bundles: [] });
  assert.match(readFileSync(join(cwd, '.skilly.json'), 'utf8'), /\n$/);
});

test('updateRules wipes {name}-*.md, installs matching rules, leaves the rest', () => {
  const cwd = freshDir();
  const outDir = join(cwd, '.claude', 'rules');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'alpha-stale.md'), 'stale');
  writeFileSync(join(outDir, 'other-rule.md'), 'not mine');

  const skillDir = join(cwd, 'skill-src');
  mkdirSync(join(skillDir, 'rules'), { recursive: true });
  writeFileSync(join(skillDir, 'rules', 'alpha-fresh.md'), 'fresh');
  writeFileSync(join(skillDir, 'rules', 'payload.md'), 'skill-internal, no prefix');

  const installed = updateRules(cwd, 'alpha', skillDir);
  assert.deepEqual(installed, ['alpha-fresh.md']);
  assert.deepEqual(readdirSync(outDir).sort(), ['alpha-fresh.md', 'other-rule.md']);
  assert.equal(existsSync(join(outDir, 'alpha-stale.md')), false);
});

test('updateRules with null source only deletes', () => {
  const cwd = freshDir();
  const outDir = join(cwd, '.claude', 'rules');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'alpha-gone.md'), 'x');
  assert.deepEqual(updateRules(cwd, 'alpha', null), []);
  assert.equal(existsSync(join(outDir, 'alpha-gone.md')), false);
});
