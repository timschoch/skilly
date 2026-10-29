import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listToolchains, pickCiStage, pickNightlyStage } from '../engine/verify/plan.mjs';

const engineDir = fileURLToPath(new URL('../engine/verify/', import.meta.url));
const DAY = 86_400_000;
const NOW = Date.parse('2026-10-29T03:00:00Z');
// The CLI reads the real clock, so its dates count back from now.
const ago = (days) => new Date(Date.now() - days * DAY).toISOString();

test('ci: a product PR runs pr only when a nightly and a release PR run the full suites', () => {
  const net = { tier: 'product', branch: 'feat/x', hasNightly: true, hasReleasePlease: true };
  assert.equal(pickCiStage(net), 'pr');
  assert.equal(pickCiStage({ ...net, branch: 'release-please--branches--main' }), 'ci');
  assert.equal(pickCiStage({ ...net, hasNightly: false }), 'ci');
  assert.equal(pickCiStage({ ...net, hasReleasePlease: false }), 'ci');
  assert.equal(pickCiStage({ ...net, tier: 'tool' }), 'ci');
  assert.equal(pickCiStage({ ...net, event: 'workflow_dispatch' }), 'ci');
});

test('nightly: ADR-0004 decision 1, and a manual run runs everything', () => {
  const commit = NOW - DAY;
  const cases = [
    [{ lastCommitAt: commit, lastFinishedAt: commit + 1000 }, 'nightly-scan'],
    [{ lastCommitAt: commit, lastFinishedAt: commit - 1000 }, 'nightly'],
    [{ lastCommitAt: NOW - 3 * DAY, lastFinishedAt: NOW - 4 * DAY }, 'stop'],
    [{ lastCommitAt: NOW - 30 * DAY, lastFinishedAt: null }, 'nightly'],
    [{ lastCommitAt: NOW - 3 * DAY, lastFinishedAt: NOW - 4 * DAY, event: 'workflow_dispatch' }, 'nightly'],
  ];
  for (const [input, stage] of cases) {
    assert.equal(pickNightlyStage({ event: 'schedule', now: NOW, ...input }), stage, JSON.stringify(input));
  }
});

test('toolchains: each once, sorted; an unknown one throws', () => {
  const steps = [{ toolchain: ['playwright'] }, { name: 'plain' }, { toolchain: ['playwright'] }];
  assert.deepEqual(listToolchains(steps), ['playwright']);
  assert.throws(() => listToolchains([{ name: 'scan', toolchain: ['cobol'] }]), /step scan needs toolchain cobol/);
});

// A Consumer with the Engine's verify folder, a fake gh that logs its calls, and one commit.
const makeConsumer = ({ tier, stages, workflows = {}, runs = [], openIssues = [], commitDate = ago(0) }) => {
  const root = mkdtempSync(join(tmpdir(), 'skilly-plan-'));
  const engine = join(root, '.skilly', 'engine', 'verify');
  mkdirSync(engine, { recursive: true });
  for (const file of readdirSync(engineDir)) copyFileSync(join(engineDir, file), join(engine, file));
  writeFileSync(join(engine, 'verify.json'), JSON.stringify({ stages }));
  writeFileSync(join(root, '.skilly', 'config.json'), JSON.stringify({ tier }));
  mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
  for (const [name, text] of Object.entries(workflows)) writeFileSync(join(root, '.github', 'workflows', name), text);
  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(join(root, 'runs.json'), JSON.stringify({ workflow_runs: runs }));
  writeFileSync(join(root, 'issues.json'), JSON.stringify(openIssues));
  writeFileSync(
    join(bin, 'gh'),
    [
      '#!/bin/sh',
      `echo "$*" >> "${join(root, 'gh.log')}"`,
      `case "$1" in api) cat "${join(root, 'runs.json')}" ;; issue) [ "$2" = list ] && cat "${join(root, 'issues.json')}" ;; esac`,
      'exit 0',
    ].join('\n'),
  );
  chmodSync(join(bin, 'gh'), 0o755);
  const git = (...args) =>
    spawnSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      env: { ...process.env, GIT_COMMITTER_DATE: commitDate, GIT_AUTHOR_DATE: commitDate },
    });
  git('init', '--quiet', '--initial-branch', 'main');
  git('add', '--all');
  git('-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '--message', 'base');
  return root;
};

const runPlan = (root, kind, env = {}) =>
  spawnSync(process.execPath, [join(root, '.skilly', 'engine', 'verify', 'plan.mjs'), kind], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(root, 'bin')}:${process.env.PATH}`,
      GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_RUN_ID: '99',
      GITHUB_HEAD_REF: '',
      GITHUB_REF_NAME: 'feat/x',
      ...env,
    },
  });

const e2e = { name: 'e2e smoke', run: 'true', toolchain: ['playwright'] };

test('plan ci prints the stage and the toolchains of its steps for $GITHUB_OUTPUT', () => {
  const root = makeConsumer({
    tier: 'product',
    stages: { ci: { steps: [e2e] }, pr: { extends: 'ci', without: ['e2e smoke'] } },
    workflows: { 'nightly.yml': 'name: Nightly\n', 'release.yml': 'uses: googleapis/release-please-action@v5\n' },
  });
  const pr = runPlan(root, 'ci', { GITHUB_HEAD_REF: 'feat/x' });
  assert.equal(pr.status, 0, pr.stderr);
  assert.equal(pr.stdout, 'stage=pr\ntoolchains=[]\n');
  const release = runPlan(root, 'ci', { GITHUB_HEAD_REF: '', GITHUB_REF_NAME: 'release-please--branches--main' });
  assert.equal(release.stdout, 'stage=ci\ntoolchains=["playwright"]\n');
});

const nightlyStages = {
  'nightly-scan': { steps: [{ name: 'security scan', run: 'true' }] },
  nightly: { extends: 'nightly-scan', steps: [{ name: 'e2e full', run: 'true', toolchain: ['playwright'] }] },
};

test('plan nightly reads the last finished night, not a cancelled one or this run', () => {
  const runs = [
    { id: 99, conclusion: null, run_started_at: ago(0) },
    { id: 98, conclusion: 'cancelled', run_started_at: ago(1) },
    { id: 97, conclusion: 'failure', run_started_at: ago(2) },
  ];
  const changed = makeConsumer({ tier: 'product', stages: nightlyStages, runs, commitDate: ago(1.5) });
  const result = runPlan(changed, 'nightly', { GITHUB_EVENT_NAME: 'schedule' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'stage=nightly\ntoolchains=["playwright"]\n');
  assert.match(
    readFileSync(join(changed, 'gh.log'), 'utf8'),
    /api repos\/owner\/repo\/actions\/workflows\/nightly\.yml\/runs/,
  );

  const quiet = makeConsumer({ tier: 'product', stages: nightlyStages, runs, commitDate: ago(3) });
  assert.equal(
    runPlan(quiet, 'nightly', { GITHUB_EVENT_NAME: 'schedule' }).stdout,
    'stage=nightly-scan\ntoolchains=[]\n',
  );
});

test('plan nightly stops when stuck and opens one nightly-stuck issue, unless one is open', () => {
  const runs = [{ id: 1, conclusion: 'success', run_started_at: ago(20) }];
  const stuck = makeConsumer({ tier: 'product', stages: nightlyStages, runs, commitDate: ago(5) });
  const result = runPlan(stuck, 'nightly', { GITHUB_EVENT_NAME: 'schedule' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'stage=stop\ntoolchains=[]\n');
  assert.match(readFileSync(join(stuck, 'gh.log'), 'utf8'), /issue create .*--label nightly-stuck/);

  const known = makeConsumer({
    tier: 'product',
    stages: nightlyStages,
    runs,
    openIssues: [{ number: 5 }],
    commitDate: ago(5),
  });
  runPlan(known, 'nightly', { GITHUB_EVENT_NAME: 'schedule' });
  assert.doesNotMatch(readFileSync(join(known, 'gh.log'), 'utf8'), /issue create/);
});
