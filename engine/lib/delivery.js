import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultBranch } from '../verify/default-branch.mjs';
import { cloneRelease, latestRelease } from './add-remove.js';
import { run, tryRun } from './run.js';
import * as skillsCli from './skills-cli.js';
import { sync } from './sync.js';

// The delivery for one Consumer (ADR-0008 decisions 8, 11, 20 and 21): run the
// Sync on a fresh copy of the default branch, push the Sync PR branch, open
// or update the one Sync PR, apply the auto-merge rule. The Hub nightly and
// `skilly sync` both call it. All GitHub calls go through gh.
export const SYNC_BRANCH = 'chore/skilly-sync';

const major = (release) => release?.match(/^v(\d+)\./)?.[1];

// The one auto-merge rule. No Release before counts as a new major.
export function autoMerge({ release, skills, bundles }) {
  if (skills.removed.length || bundles.removed.length) return { on: false, reason: 'the Sync removes skills or Bundles' };
  if (major(release.after) !== major(release.before)) return { on: false, reason: 'new major Release' };
  return { on: true, reason: 'merges when `ci / verify` is green' };
}

export function prBody(report) {
  const { release, skills, bundles, files } = report;
  const merge = autoMerge(report);
  const section = (title, items, format = (item) => item) =>
    items.length ? ['', `## ${title}`, ...items.map((item) => `- ${format(item)}`)] : [];
  return [
    `Sync to Release ${release.before ?? 'none'} → ${release.after}.`,
    ...section('⚠️ Removed', skills.removed),
    ...section('⚠️ Bundles the Release dropped', bundles.removed),
    ...section('Added', skills.added),
    ...section('Updated', skills.updated),
    ...section(`Files (${files.length})`, files, (file) => `\`${file}\``),
    '',
    `Auto-merge: ${merge.on ? 'on' : 'off'}, ${merge.reason}.`,
    '',
  ].join('\n');
}

const ghCli = (cwd) => (args) => run('gh', args, { cwd });

// Returns { report, pr, autoMerge }. pr is null when the Sync changed nothing.
// The person's checkout stays as it was: the Sync runs in a temporary worktree.
export function deliver({ cwd, snapshot, skills = skillsCli, gh = ghCli(cwd) }) {
  const base = defaultBranch(cwd);
  run('git', ['fetch', '--quiet', 'origin', base], { cwd });
  const tree = join(mkdtempSync(join(tmpdir(), 'skilly-sync-')), 'checkout');
  try {
    run('git', ['worktree', 'add', '--quiet', '--detach', tree, `origin/${base}`], { cwd });
    const report = sync({ cwd: tree, snapshot, skills });
    if (!report.files.length) return { report, pr: null, autoMerge: null };

    const title = `chore(skilly): sync to ${report.release.after}`;
    // The Sync PR is checked by `ci / verify`; local hooks do not run on it.
    run('git', ['add', '--all', '--', ...report.files], { cwd: tree });
    run('git', ['commit', '--quiet', '--no-verify', '-m', title], { cwd: tree });
    run('git', ['push', '--quiet', '--force', '--no-verify', 'origin', `HEAD:refs/heads/${SYNC_BRANCH}`], { cwd: tree });

    const body = prBody(report);
    const [open] = JSON.parse(gh(['pr', 'list', '--head', SYNC_BRANCH, '--state', 'open', '--json', 'number,url']));
    const pr = open
      ? { url: open.url, created: false }
      : { url: gh(['pr', 'create', '--base', base, '--head', SYNC_BRANCH, '--title', title, '--body', body]), created: true };
    if (open) gh(['pr', 'edit', pr.url, '--title', title, '--body', body]);

    // Turning auto-merge on fails when the repo does not allow it; that leaves
    // the PR open for a person. Turning it off fails when it was never on, which
    // does not matter.
    const merge = autoMerge(report);
    const done = tryGh(gh, ['pr', 'merge', pr.url, ...(merge.on ? ['--auto', '--squash'] : ['--disable-auto'])]);
    const applied = !merge.on || done;
    return { report, pr, autoMerge: { ...merge, applied } };
  } finally {
    tryRun('git', ['worktree', 'remove', '--force', tree], { cwd });
    rmSync(join(tree, '..'), { recursive: true, force: true });
  }
}

function tryGh(gh, args) {
  try {
    gh(args);
    return true;
  } catch {
    return false;
  }
}

// `skilly sync`: fetch the newest Release and run its Engine's delivery. The
// local Engine only starts it, so old Engine code never writes a newer Release.
export function startSync({
  cwd,
  latestRelease: newest = latestRelease,
  fetchSnapshot = cloneRelease,
  runEngine = (bin, args) => spawnSync('node', [bin, ...args], { cwd, stdio: 'inherit' }).status ?? 1,
}) {
  const snapshot = fetchSnapshot(newest());
  try {
    return runEngine(join(snapshot.dir, 'engine', 'bin', 'skilly.js'), ['deliver', snapshot.dir, snapshot.release]);
  } finally {
    snapshot.cleanup();
  }
}
