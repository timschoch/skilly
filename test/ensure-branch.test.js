import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBranch } from '../lib/ensure-branch.js';
import { run } from '../lib/run.js';

const GATE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'bundles/setup-project/skills/setup-repo/scripts/check-branch-name.mjs',
);

// A repo on `branch` that the user already blessed for skilly changes.
function repo(branch, { gate = true } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'skilly-branch-'));
  run('git', ['init', '--quiet', '--initial-branch', 'main'], { cwd });
  run(
    'git',
    [
      '-c',
      'user.name=test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '--quiet',
      '--allow-empty',
      '-m',
      'chore: init',
    ],
    { cwd },
  );
  run('git', ['switch', '--quiet', '-c', branch], { cwd });
  run('git', ['config', '--local', 'skilly.use-current-branch', 'true'], { cwd });
  if (gate) {
    mkdirSync(join(cwd, '.claude', 'hooks'), { recursive: true });
    copyFileSync(GATE, join(cwd, '.claude', 'hooks', 'check-branch-name.mjs'));
  }
  return cwd;
}

test('ensureBranch: a branch the push gate refuses stops skilly before the commit', async () => {
  await assert.rejects(ensureBranch(repo('prototype/glue-house')), /Invalid branch name: "prototype\/glue-house"/);
});

test('ensureBranch: a branch the push gate accepts passes', async () => {
  await ensureBranch(repo('feat/glue-house'));
});

test('ensureBranch: a repo without the push gate has no name to fail', async () => {
  await ensureBranch(repo('prototype/glue-house', { gate: false }));
});
