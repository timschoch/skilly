import { run, tryRun } from './run.js';

// The conventional-commits gate caps subjects at 72 chars — a long name
// list moves to the body.
export function skillyMessage(verb, names) {
  const subject = `chore(skilly): ${verb} ${names.join(', ')}`;
  if (subject.length <= 72) return subject;
  return `chore(skilly): ${verb} ${names.length} skills\n\n${names.join(', ')}`;
}

// Commit everything, push, ensure a PR exists (docs/commit.mmd). The PR is
// opened only after a push — GitHub refuses PRs from zero-commit branches.
export function commit(cwd, message, { forcePush = false } = {}) {
  const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });

  if (run('git', ['status', '--porcelain'], { cwd })) {
    run('git', ['add', '-A'], { cwd });
    // --no-verify: skilly commits only skilly-owned files with conventional
    // messages; consumer pre-commit hooks must not touch them (lint-staged's
    // stash backup dies when an indexed path moves behind a skills-CLI
    // symlink, and formatters would invalidate lock hashes). The PR gate
    // still checks every commit message.
    run('git', ['commit', '--no-verify', '-m', message], { cwd });
    run('git', ['push', '-u', 'origin', branch, ...(forcePush ? ['--force-with-lease'] : [])], { cwd });
    console.log(`committed and pushed: ${message}`);
  }

  const open = tryRun('gh', ['pr', 'list', '--head', branch, '--state', 'open', '--json', 'url', '--jq', '.[].url'], { cwd });
  if (open) return open;

  const pushed = tryRun('git', ['rev-parse', '--verify', '--quiet', `origin/${branch}`], { cwd });
  if (!pushed) return null;
  const url = run('gh', ['pr', 'create', '--fill', '--head', branch], { cwd });
  console.log(`opened PR: ${url}`);
  return url;
}
