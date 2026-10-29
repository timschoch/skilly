import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareBranch } from '../lib/prepare-branch.js';
import { run } from '../engine/lib/run.js';

const GATE = join(dirname(fileURLToPath(import.meta.url)), '..', 'engine/verify/check-branch-name.mjs');

// A repo on `branch`, by default one the user already blessed for skilly changes.
function repo(branch, { gate = true, blessed = true } = {}) {
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
  if (blessed) run('git', ['config', '--local', 'skilly.use-current-branch', 'true'], { cwd });
  if (gate) {
    const scripts = join(cwd, '.agents', 'skills', 'verify', 'scripts');
    mkdirSync(scripts, { recursive: true });
    copyFileSync(GATE, join(scripts, 'check-branch-name.mjs'));
    copyFileSync(join(dirname(GATE), 'default-branch.mjs'), join(scripts, 'default-branch.mjs'));
  }
  return cwd;
}

test('prepareBranch: a branch the push gate refuses stops skilly before the commit', async () => {
  await assert.rejects(prepareBranch(repo('prototype/glue-house')), /Invalid branch name: "prototype\/glue-house"/);
});

test('prepareBranch: a branch the push gate accepts passes', async () => {
  await prepareBranch(repo('feat/glue-house'));
});

test('prepareBranch: a repo without the push gate has no name to fail', async () => {
  await prepareBranch(repo('prototype/glue-house', { gate: false }));
});

test('prepareBranch: the skilly branches pass without a blessing', async () => {
  await prepareBranch(repo('chore/skilly-setup', { blessed: false }));
  await prepareBranch(repo('chore/skilly-update', { blessed: false }));
});

test('prepareBranch: a feature branch that mentions skilly still needs a blessing', async () => {
  await assert.rejects(prepareBranch(repo('chore/rewire-skilly-hooks', { blessed: false })), /needs a terminal/);
});
