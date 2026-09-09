import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBundles } from '../lib/resolve.js';
import { selfSource } from '../lib/self-source.js';
import { run } from '../lib/run.js';

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

test('a self-source consumer drops its own source, tree URL included', () => {
  const resolved = resolveBundles(['selfy'], bundlesDir, { selfSource: 'owner/two' });
  assert.deepEqual([...resolved.sources.keys()], ['owner/one']);
});

test('the self-source match ignores case', () => {
  const resolved = resolveBundles(['selfy'], bundlesDir, { selfSource: 'Owner/Two' });
  assert.deepEqual([...resolved.sources.keys()], ['owner/one']);
});

test('no self-source resolves every source', () => {
  const resolved = resolveBundles(['selfy'], bundlesDir);
  assert.deepEqual([...resolved.sources.keys()], ['https://github.com/owner/two/tree/main/skills', 'owner/one']);
});

test('a self-source that no bundle names changes nothing', () => {
  const resolved = resolveBundles(['selfy'], bundlesDir, { selfSource: 'owner/three' });
  assert.equal(resolved.sources.size, 2);
});

const gitRepo = (remote) => {
  const dir = mkdtempSync(join(tmpdir(), 'skilly-self-'));
  run('git', ['init', '-q', dir]);
  if (remote) run('git', ['-C', dir, 'remote', 'add', 'origin', remote]);
  return dir;
};

test('selfSource reads owner/repo from the git remote', () => {
  for (const [remote, expected] of [
    ['https://github.com/Habits-Family/habits.git', 'Habits-Family/habits'],
    ['https://github.com/Habits-Family/habits', 'Habits-Family/habits'],
    ['https://timschoch@github.com/Habits-Family/habits.git', 'Habits-Family/habits'],
    ['git@github.com:Habits-Family/habits.git', 'Habits-Family/habits'],
    ['https://gitlab.com/Habits-Family/habits.git', null], // non-GitHub remote
  ]) {
    const dir = gitRepo(remote);
    try {
      assert.equal(selfSource(dir), expected, remote);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('selfSource is null without a remote and outside git', () => {
  const noRemote = gitRepo(null);
  const noGit = mkdtempSync(join(tmpdir(), 'skilly-nogit-'));
  try {
    assert.equal(selfSource(noRemote), null);
    assert.equal(selfSource(noGit), null);
  } finally {
    rmSync(noRemote, { recursive: true, force: true });
    rmSync(noGit, { recursive: true, force: true });
  }
});
