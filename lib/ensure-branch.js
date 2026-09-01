import { run, tryRun, confirm } from './run.js';

export const SETUP_BRANCH = 'chore/skilly-setup';
export const UPDATE_BRANCH = 'chore/skilly-update';

function defaultBranch(cwd) {
  const ref = tryRun('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { cwd });
  return ref ? ref.replace(/^origin\//, '') : 'main';
}

// Branch guard (docs/ensure-branch.mmd): skilly writes on a skilly-* branch,
// on a branch the user blessed once, or on a fresh branch off main. The
// blessing lives in .git/config — never committed.
export async function ensureBranch(cwd, { branch = SETUP_BRANCH } = {}) {
  const current = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
  if (current.includes('skilly-')) return;
  if (current === defaultBranch(cwd)) {
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
