import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { run, tryRun, confirm } from './run.js';

export const SETUP_BRANCH = 'chore/skilly-setup';
export const UPDATE_BRANCH = 'chore/skilly-update';

function defaultBranch(cwd) {
  const ref = tryRun('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { cwd });
  return ref ? ref.replace(/^origin\//, '') : 'main';
}

// The push gate setup-repo installs. Run it before skilly commits, so a branch
// the push would refuse fails here and not after the commit. The rule lives in
// that file only; a repo without it has no gate to fail.
function validateBranchName(cwd) {
  const gate = join(cwd, '.claude', 'hooks', 'check-branch-name.mjs');
  if (!existsSync(gate)) return;
  const result = spawnSync('node', [gate], { cwd, encoding: 'utf8', env: { ...process.env, GITHUB_HEAD_REF: '' } });
  if (result.status !== 0)
    throw new Error(`${result.stderr.trim()}\n\nskilly committed nothing. Rename, then run it again.`);
}

// Branch guard (docs/prepare-branch.mmd): skilly writes on a skilly-* branch,
// on a branch the user blessed once, or on a fresh branch off main. The
// blessing lives in .git/config — never committed.
export async function prepareBranch(cwd, { branch = SETUP_BRANCH } = {}) {
  const current = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
  const trunk = defaultBranch(cwd);
  if (current !== trunk) validateBranchName(cwd);
  if (current.includes('skilly-')) return;
  if (current === trunk) {
    const exists = tryRun('git', ['rev-parse', '--verify', '--quiet', branch], { cwd }) !== null;
    run('git', exists ? ['checkout', branch] : ['checkout', '-b', branch], { cwd });
    console.log(`switched to ${branch} (PR opens after the first push)`);
    return;
  }
  if (tryRun('git', ['config', '--local', 'skilly.use-current-branch'], { cwd }) !== null) return;
  if (await confirm(`on branch "${current}" — use it for skilly changes?`)) {
    run('git', ['config', '--local', 'skilly.use-current-branch', 'true'], { cwd });
    return;
  }
  throw new Error('aborted: run skilly from main or a skilly-* branch');
}
