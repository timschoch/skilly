import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../bundles/workflow/skills/verify/scripts/default-branch.mjs', import.meta.url));

// A repo whose origin/HEAD points at `originHead`, or is unset.
const repo = (originHead) => {
  const cwd = mkdtempSync(join(tmpdir(), 'skilly-default-branch-'));
  spawnSync('git', ['init', '--quiet', '--initial-branch', 'wip', cwd]);
  if (originHead)
    spawnSync('git', ['-C', cwd, 'symbolic-ref', 'refs/remotes/origin/HEAD', `refs/remotes/origin/${originHead}`]);
  return cwd;
};

const eventFile = (payload) => {
  const path = join(mkdtempSync(join(tmpdir(), 'skilly-event-')), 'event.json');
  writeFileSync(path, JSON.stringify(payload));
  return path;
};

// Runs the script as a step would, with only the given resolution inputs set.
const resolve = (cwd, env = {}) => {
  const { DEFAULT_BRANCH, GITHUB_EVENT_PATH, ...base } = process.env;
  const result = spawnSync(process.execPath, [script], { cwd, encoding: 'utf8', env: { ...base, ...env } });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};

test('default branch: DEFAULT_BRANCH wins over everything else', () => {
  const event = eventFile({ repository: { default_branch: 'v2-rebuild' } });
  assert.equal(resolve(repo('develop'), { DEFAULT_BRANCH: 'trunk', GITHUB_EVENT_PATH: event }), 'trunk');
});

test('default branch: the GitHub event payload, where actions/checkout sets no origin/HEAD', () => {
  const event = eventFile({ repository: { default_branch: 'v2-rebuild' } });
  assert.equal(resolve(repo(), { GITHUB_EVENT_PATH: event }), 'v2-rebuild');
});

test('default branch: origin/HEAD when there is no event payload or it has no repository', () => {
  assert.equal(resolve(repo('develop')), 'develop');
  assert.equal(resolve(repo('develop'), { GITHUB_EVENT_PATH: eventFile({ schedule: '0 8 * * *' }) }), 'develop');
});

test('default branch: main when nothing else answers', () => {
  assert.equal(resolve(repo()), 'main');
});
