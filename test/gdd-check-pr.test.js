import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blocks } from '../bundles/gdd/skills/gdd/scripts/check-pr.mjs';

// A husky hook exports GIT_DIR to its children; the temp repo below must not inherit it.
for (const key of Object.keys(process.env)) if (key.startsWith('GIT_')) delete process.env[key];

const SCRIPT = fileURLToPath(new URL('../bundles/gdd/skills/gdd/scripts/check-pr.mjs', import.meta.url));
const active = { branch: 'feat/x', status: 'active', guidance: 'keep it small', checked: false };

test('gdd check-pr: blocks gh pr create only while active, unchecked, same branch', () => {
  assert.equal(blocks('gh pr create --fill', active, 'feat/x'), true);
  assert.equal(blocks('git push && gh pr create', active, 'feat/x'), true);
  assert.equal(blocks('gh pr create', { ...active, checked: true }, 'feat/x'), false);
  assert.equal(blocks('gh pr create', { ...active, status: 'declined' }, 'feat/x'), false);
  assert.equal(blocks('gh pr create', active, 'feat/y'), false);
  assert.equal(blocks('gh pr create', null, 'feat/x'), false);
  assert.equal(blocks('gh pr view', active, 'feat/x'), false);
});

test('gdd check-pr: the hook exits 2 on an open check and 0 once checked', () => {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'skilly-gdd-')));
  execFileSync('git', ['init', '-q', '-b', 'feat/x'], { cwd: repo });
  mkdirSync(join(repo, '.temp'));
  const run = (state, command = 'gh pr create') => {
    writeFileSync(join(repo, '.temp', 'gdd.json'), JSON.stringify(state));
    return spawnSync('node', [SCRIPT], {
      input: JSON.stringify({ cwd: repo, tool_input: { command } }),
      encoding: 'utf8',
    });
  };

  const held = run(active);
  assert.equal(held.status, 2);
  assert.match(held.stderr, /pre-PR check/);
  assert.equal(run({ ...active, checked: true }).status, 0);
  assert.equal(run({ ...active, status: 'declined' }).status, 0);
  assert.equal(run(active, 'gh pr view').status, 0);
});
