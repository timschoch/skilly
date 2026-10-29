import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Two callers check the same Rule: the gate script and the workflow Bundle's verify step.
const callers = {
  gate: ['bash', [fileURLToPath(new URL('../bundles/workflow/rules/conventional-commits.sh', import.meta.url))]],
  'verify step': [
    process.execPath,
    [fileURLToPath(new URL('../engine/verify/check-commit-msg.mjs', import.meta.url)), '--branch'],
  ],
};

// A git hook (husky pre-commit → npm test) exports GIT_DIR / GIT_INDEX_FILE to
// its children; inherited, `git -C <tmp>` would act on the repo being committed.
for (const key of Object.keys(process.env)) if (key.startsWith('GIT_')) delete process.env[key];

const git = (root, ...args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });

// A `main` base with one feature-branch commit per subject on top of it.
const branchWith = ([command, args], subjects) => {
  const root = mkdtempSync(join(tmpdir(), 'skilly-commits-'));
  git(root, 'init', '-q', '--initial-branch=main');
  git(root, 'config', 'user.name', 'test');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'commit', '--no-verify', '--allow-empty', '-q', '-m', 'chore: seed');
  git(root, 'checkout', '-q', '-b', 'feature');
  for (const [index, subject] of subjects.entries()) {
    writeFileSync(join(root, 'file'), String(index));
    git(root, 'add', '-A');
    git(root, 'commit', '--no-verify', '-q', '-m', subject);
  }
  return spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, DEFAULT_BRANCH: 'main', GITHUB_BASE_REF: '' },
  });
};

for (const [name, caller] of Object.entries(callers)) {
  test(`the ${name} lets through what the commit-msg hook lets through`, () => {
    const result = branchWith(caller, ['feat: add a thing', 'Revert "feat: add a thing"', 'fixup! feat: add a thing']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.doesNotMatch(result.stdout, /FAIL/);
  });

  test(`the ${name} fails a commit the hook rejects and names it`, () => {
    const result = branchWith(caller, ['feat: add a thing', 'Added stuff']);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /^FAIL \w+ Added stuff$/m);
    assert.match(result.stdout, /^ok {3}\w+ feat: add a thing$/m);
  });

  test(`the ${name} passes a branch with no commits over its base`, () => {
    const result = branchWith(caller, []);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /no commits over main/);
  });
}
