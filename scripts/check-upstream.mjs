// Weekly Upstream check for a fork; the shared workflow check-upstream.yml
// runs it. One standing Upstream PR per fork: its branch follows the newest
// Upstream release, one comment per release, title
// `New upstream release <newest> (<ours>)`. Closing the PR skips its
// releases; the next newer release opens a fresh PR. On a change it writes
// the agent's context to CONTEXT_DIR and sets `changed=true` in GITHUB_OUTPUT.
// A rerun finishes a failed run: the context is gathered before the first
// GitHub write, release comments carry markers, and an open PR whose body is
// still the placeholder gets a fresh analysis.
// Usage: check-upstream.mjs <owner/repo> <tag-prefix> [--dry-run]
// cwd: the fork checkout, full history. Env: GH_TOKEN (fork write),
// GITHUB_REPOSITORY, DEFAULT_BRANCH, CONTEXT_DIR, GITHUB_OUTPUT.
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { run } from '../lib/run.js';

export const BRANCH = 'chore/upstream-release';
const API = 'https://api.github.com';
const COMMENT_MAX_LENGTH = 60000; // GitHub caps a comment at 65536 characters
const RELEASE_COMMENT_LIMIT = 10; // a long-stale fork gets the newest ten, not a hundred comments
const RELEASE_PAGE_LIMIT = 5;
export const PLACEHOLDER_BODY = 'The analysis follows. Release notes are in the comments.';

// `twenty/v2.51.0` with prefix `twenty/v` → [2, 51, 0]. Pre-releases and
// other tag families return null.
export function parseVersion(tag, prefix) {
  if (!tag.startsWith(prefix)) return null;
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(tag.slice(prefix.length));
  return match ? match.slice(1).map(Number) : null;
}

export function compareVersions(left, right) {
  for (let index = 0; index < 3; index++) if (left[index] !== right[index]) return left[index] - right[index];
  return 0;
}

// kind: `release` (one comment per release) or `conflict` (one per release
// that does not merge onto the open PR's branch).
export function listMarkers(comments, kind = 'release') {
  const marker = new RegExp(`<!-- upstream-${kind}: (\\S+) -->`, 'g');
  return comments.flatMap(({ body }) => [...(body ?? '').matchAll(marker)].map((match) => match[1]));
}

// The newest release the fork holds, or null: an ancestor of the default
// branch, or a tag of the last merged Upstream PR. A squash or rebase merge
// leaves no Upstream tag in the history. releases: newest first.
export function findOurs({ releases, merged, isAncestor }) {
  return releases.find(({ tag }) => merged.includes(tag) || isAncestor(tag)) ?? null;
}

// releases: newest first, each { tag, version }. ours: from findOurs.
// skipped: tags of the last closed, unmerged Upstream PR. openPull:
// { number, postedTags, body } or null.
export function planRun({ releases, ours, skipped, openPull }) {
  const newest = releases[0];
  const isNewer = (release, than) => !than || compareVersions(release.version, than.version) > 0;
  if (!newest || !isNewer(newest, ours)) return openPull ? { kind: 'close', newest } : { kind: 'none' };
  const posted = openPull?.postedTags ?? [];
  // Releases older than the oldest posted one were dropped by the comment limit.
  const oldestPosted = releases.findLast((release) => posted.includes(release.tag));
  const floor = releases
    .filter((release) => skipped.includes(release.tag) || release === oldestPosted)
    .reduce((highest, release) => (isNewer(release, highest) ? release : highest), ours);
  const fresh = releases.filter((release) => isNewer(release, floor) && !posted.includes(release.tag)).reverse();
  if (!fresh.length && openPull?.body !== PLACEHOLDER_BODY) return { kind: 'none' };
  return {
    kind: 'update',
    newest,
    ours,
    fresh: fresh.slice(-RELEASE_COMMENT_LIMIT),
    dropped: Math.max(0, fresh.length - RELEASE_COMMENT_LIMIT),
  };
}

export function formatTitle({ newest, ours }) {
  return `New upstream release ${newest.version.join('.')} (${ours ? ours.version.join('.') : 'unknown'})`;
}

export function formatReleaseComment(release) {
  const head = `<!-- upstream-release: ${release.tag} -->\n## [${release.tag}](${release.url})\n\n`;
  const notes = release.body.trim() || '_No release notes._';
  return notes.length + head.length > COMMENT_MAX_LENGTH
    ? `${head}${notes.slice(0, COMMENT_MAX_LENGTH - head.length - 100)}\n\n… cut. [Full notes](${release.url})`
    : head + notes;
}

// A comment, not only the body: a comment notifies the fork's owners.
export function formatConflictComment(tag) {
  return `<!-- upstream-conflict: ${tag} -->\n${tag} conflicts with the commits on \`${BRANCH}\`. Merge it by hand: \`git merge ${tag}\`.`;
}

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${API}/${path}`, {
    method,
    headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: 'application/vnd.github+json' },
    body: body && JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

const isAncestor = (ref, of) => spawnSync('git', ['merge-base', '--is-ancestor', ref, of]).status === 0;

async function main() {
  const [upstream, prefix, flag] = process.argv.slice(2);
  if (!upstream || !prefix) {
    console.error('usage: check-upstream.mjs <owner/repo> <tag-prefix> [--dry-run]');
    process.exit(1);
  }
  const dryRun = flag === '--dry-run';
  const {
    GITHUB_REPOSITORY: fork,
    DEFAULT_BRANCH: base,
    CONTEXT_DIR: contextDir,
    GITHUB_OUTPUT: outputPath,
  } = process.env;
  const output = (values) =>
    outputPath &&
    appendFileSync(
      outputPath,
      Object.entries(values)
        .map(([key, value]) => `${key}=${value}\n`)
        .join(''),
    );

  const [owner] = fork.split('/');
  const pulls = await api(`repos/${fork}/pulls?head=${owner}:${BRANCH}&state=all&per_page=30`);
  const comments = (pull) => api(`repos/${fork}/issues/${pull.number}/comments?per_page=100`);
  const open = pulls.find((pull) => pull.state === 'open');
  const lastClosed = pulls.find((pull) => pull.state === 'closed' && !pull.merged_at);
  const lastMerged = pulls.find((pull) => pull.merged_at);
  const openComments = open ? await comments(open) : [];
  const openPull = open
    ? {
        number: open.number,
        postedTags: listMarkers(openComments),
        conflictTags: listMarkers(openComments, 'conflict'),
        body: open.body,
      }
    : null;
  const skipped = lastClosed ? listMarkers(await comments(lastClosed)) : [];
  const merged = lastMerged ? listMarkers(await comments(lastMerged)) : [];

  // A named remote with a filter becomes a promisor: the test merge fetches
  // the blobs it needs, not all of them.
  if (spawnSync('git', ['remote', 'get-url', 'upstream']).status !== 0) {
    run('git', ['remote', 'add', 'upstream', `https://github.com/${upstream}.git`]);
  }
  const isOnBase = (tag) => isAncestor(`refs/tags/${tag}`, `origin/${base}`);
  // Other tag families share the list (Twenty: sdk/v*), so page back until a
  // page reaches a release the fork holds.
  const releases = [];
  for (let page = 1; page <= RELEASE_PAGE_LIMIT; page++) {
    const batch = await api(`repos/${upstream}/releases?per_page=100&page=${page}`);
    const found = batch
      .filter((release) => !release.draft && !release.prerelease)
      .map((release) => ({
        tag: release.tag_name,
        version: parseVersion(release.tag_name, prefix),
        url: release.html_url,
        body: release.body ?? '',
      }))
      .filter((release) => release.version);
    if (found.length) {
      run('git', [
        'fetch',
        '--quiet',
        '--no-tags',
        '--filter=blob:none',
        'upstream',
        ...found.map(({ tag }) => `+refs/tags/${tag}:refs/tags/${tag}`),
      ]);
    }
    releases.push(...found);
    if (batch.length < 100 || findOurs({ releases: found, merged, isAncestor: isOnBase })) break;
  }
  releases.sort((left, right) => compareVersions(right.version, left.version));
  if (!releases.length) return console.log(`no ${prefix}* release in ${upstream}`);
  const ours = findOurs({ releases, merged, isAncestor: isOnBase });

  const plan = planRun({ releases, ours, skipped, openPull });
  console.log(
    `ours ${ours?.tag ?? 'unknown'}, newest ${releases[0].tag}, plan ${plan.kind}${plan.fresh ? `: ${plan.fresh.map(({ tag }) => tag).join(', ')}` : ''}`,
  );
  if (dryRun || plan.kind === 'none') return;

  if (plan.kind === 'close') {
    await api(`repos/${fork}/issues/${openPull.number}/comments`, {
      method: 'POST',
      body: { body: `The fork already has ${plan.newest.tag}. Closing.` },
    });
    await api(`repos/${fork}/pulls/${openPull.number}`, { method: 'PATCH', body: { state: 'closed' } });
    return;
  }

  // The agent's context first: every release since ours, the test merge
  // against the default branch, the Upstream's published advisories. A
  // failure here leaves GitHub untouched.
  mkdirSync(contextDir, { recursive: true });
  const since = releases.filter((release) => !ours || compareVersions(release.version, ours.version) > 0);
  writeFileSync(
    join(contextDir, 'releases.md'),
    since.map((release) => `# ${release.tag}\n\n${release.body}`).join('\n\n'),
  );
  const mergeTree = spawnSync(
    'git',
    ['merge-tree', '--write-tree', '--name-only', '--no-messages', `origin/${base}`, `refs/tags/${plan.newest.tag}`],
    { encoding: 'utf8' },
  );
  const conflicts = mergeTree.status === 1 ? mergeTree.stdout.split('\n').slice(1).filter(Boolean) : [];
  writeFileSync(join(contextDir, 'conflicts.txt'), conflicts.join('\n'));
  const advisories = await api(`repos/${upstream}/security-advisories?state=published&per_page=50`);
  writeFileSync(
    join(contextDir, 'advisories.json'),
    JSON.stringify(
      advisories.map(({ ghsa_id, severity, summary, published_at, vulnerabilities }) => ({
        ghsa_id,
        severity,
        summary,
        published_at,
        vulnerabilities,
      })),
      null,
      2,
    ),
  );

  let number = openPull?.number;
  if (openPull) {
    // Never force-push an open Upstream PR: it may hold a human's conflict fixes.
    run('git', ['fetch', '--quiet', 'origin', BRANCH]);
    run('git', ['checkout', '--quiet', '-B', BRANCH, `origin/${BRANCH}`]);
    const merge = spawnSync('git', ['merge', '--no-edit', `refs/tags/${plan.newest.tag}`], { encoding: 'utf8' });
    if (merge.status === 0) run('git', ['push', '--quiet', 'origin', BRANCH]);
    else {
      spawnSync('git', ['merge', '--abort']);
      const conflict = formatConflictComment(plan.newest.tag);
      writeFileSync(join(contextDir, 'branch-conflict.txt'), `${conflict}\n`);
      if (!openPull.conflictTags.includes(plan.newest.tag)) {
        await api(`repos/${fork}/issues/${number}/comments`, { method: 'POST', body: { body: conflict } });
      }
    }
    // The placeholder marks the analysis as unfinished until the agent's body lands.
    await api(`repos/${fork}/pulls/${number}`, {
      method: 'PATCH',
      body: { title: formatTitle(plan), body: PLACEHOLDER_BODY },
    });
  } else {
    // No open PR: the branch is the bot's alone, a leftover from a closed one.
    run('git', ['push', '--quiet', '--force', 'origin', `refs/tags/${plan.newest.tag}^{commit}:refs/heads/${BRANCH}`]);
    const pull = await api(`repos/${fork}/pulls`, {
      method: 'POST',
      body: { title: formatTitle(plan), head: BRANCH, base, body: PLACEHOLDER_BODY },
    });
    number = pull.number;
  }
  for (const [index, release] of plan.fresh.entries()) {
    // The dropped note rides in the first comment, so a rerun never posts it twice.
    const note =
      index === 0 && plan.dropped
        ? `${plan.dropped} older releases have no comment. See https://github.com/${upstream}/releases.\n\n`
        : '';
    await api(`repos/${fork}/issues/${number}/comments`, {
      method: 'POST',
      body: { body: note + formatReleaseComment(release) },
    });
  }
  output({ changed: true, pull: number, ours: ours?.tag ?? '', newest: plan.newest.tag });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
