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
// push: false commits locally and stops — update's per-verb commits defer to
// ONE push + PR at the end of the run, so the gate never sees (or merges) a
// half-built Sync PR while the update job is still working (#17).
export function commit(cwd, message, { forcePush = false, push = true } = {}) {
  const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });

  if (run('git', ['status', '--porcelain'], { cwd })) {
    run('git', ['add', '-A'], { cwd });
    // --no-verify: skilly commits only skilly-owned files with conventional
    // messages; consumer pre-commit hooks must not touch them (lint-staged's
    // stash backup dies when an indexed path moves behind a skills-CLI
    // symlink, and formatters would invalidate lock hashes). The PR gate
    // still checks every commit message.
    run('git', ['commit', '--no-verify', '-m', message], { cwd });
    console.log(`committed: ${message}`);
  }
  if (!push) return null;

  // Deferred commits mean the tree can be clean with the branch still ahead —
  // push whatever origin lacks, not just what this call committed.
  const unpushed = Number(run('git', ['rev-list', '--count', 'HEAD', '--not', '--remotes=origin'], { cwd }));
  if (unpushed > 0) {
    run('git', ['push', '-u', 'origin', branch, ...(forcePush ? ['--force-with-lease'] : [])], { cwd });
    console.log(`pushed ${unpushed} commit(s) to ${branch}`);
  }

  const open = tryRun('gh', ['pr', 'list', '--head', branch, '--state', 'open', '--json', 'url', '--jq', '.[].url'], {
    cwd,
  });
  if (open) return open;

  const pushed = tryRun('git', ['rev-parse', '--verify', '--quiet', `origin/${branch}`], { cwd });
  if (!pushed) return null;
  const url = run('gh', ['pr', 'create', '--fill', '--head', branch], { cwd });
  console.log(`opened PR: ${url}`);
  return url;
}
