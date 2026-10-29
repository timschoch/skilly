import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { writeManagedFiles } from '../engine/lib/managed-files.js';
import { run } from '../engine/lib/run.js';
import { makeCheckout, writeFiles } from './fixtures/sync.js';

const templatesDir = fileURLToPath(new URL('../engine/templates/', import.meta.url));
const read = (cwd, path) => readFileSync(join(cwd, '.github', path), 'utf8');
const stepsOf = (cwd, workflow) => Object.values(parse(read(cwd, `workflows/${workflow}`)).jobs)[0].steps;

test('every Managed file renders to YAML with no placeholder left', () => {
  const cwd = makeCheckout({});
  writeManagedFiles(cwd, templatesDir, 'product');
  for (const path of [
    'workflows/ci.yml',
    'workflows/nightly.yml',
    'workflows/ai-review.yml',
    'workflows/release.yml',
    'dependabot.yml',
  ]) {
    const text = read(cwd, path);
    assert.doesNotMatch(text, /@\{/, path);
    assert.match(text, /^# Managed by skilly\./, path);
    assert.ok(parse(text), path);
  }
});

test('ci.yml runs plan and verify from .skilly/engine/ with the npm install by default', () => {
  const cwd = makeCheckout({});
  writeManagedFiles(cwd, templatesDir, 'sandbox');
  const runs = stepsOf(cwd, 'ci.yml').map((step) => step.run ?? step.uses);
  assert.ok(runs.includes('npm ci'), runs.join('\n'));
  assert.ok(runs.includes('node .skilly/engine/verify/plan.mjs ci >> "$GITHUB_OUTPUT"'));
  assert.ok(runs.includes('node .skilly/engine/verify/verify.mjs ${{ steps.plan.outputs.stage }}'));
  assert.ok(runs.includes('npx playwright install --with-deps chromium'));
  const setupNode = stepsOf(cwd, 'ci.yml').find((step) => step.uses?.startsWith('actions/setup-node@'));
  assert.deepEqual(setupNode.with, { 'node-version': 'lts/*', cache: 'npm' });
  assert.match(read(cwd, 'workflows/ci.yml'), /hashFiles\('package-lock\.json'\)/);
});

test('a pnpm Consumer gets pnpm, its version from packageManager when it pins one', () => {
  const lockfile = makeCheckout({});
  writeFiles(lockfile, { 'pnpm-lock.yaml': '', '.nvmrc': '22\n' });
  writeManagedFiles(lockfile, templatesDir, 'sandbox');
  const steps = stepsOf(lockfile, 'ci.yml');
  const pnpm = steps.find((step) => step.uses?.startsWith('pnpm/action-setup@'));
  assert.deepEqual(pnpm.with, { version: 'latest' });
  assert.ok(steps.indexOf(pnpm) < steps.findIndex((step) => step.uses?.startsWith('actions/setup-node@')));
  assert.deepEqual(steps.find((step) => step.uses?.startsWith('actions/setup-node@')).with, {
    'node-version-file': '.nvmrc',
    cache: 'pnpm',
  });
  assert.ok(steps.some((step) => step.run === 'pnpm install --frozen-lockfile'));
  assert.ok(steps.some((step) => step.run === 'pnpm exec playwright install --with-deps chromium'));

  const pinned = makeCheckout({});
  writeFiles(pinned, { 'package.json': JSON.stringify({ packageManager: 'pnpm@9.12.0' }), 'pnpm-lock.yaml': '' });
  writeManagedFiles(pinned, templatesDir, 'sandbox');
  assert.equal(stepsOf(pinned, 'ci.yml').find((step) => step.uses?.startsWith('pnpm/action-setup@')).with, undefined);
});

test('a package manager without a template stops the Sync with its name', () => {
  const cwd = makeCheckout({});
  writeFiles(cwd, { 'yarn.lock': '' });
  assert.throws(() => writeManagedFiles(cwd, templatesDir, 'sandbox'), /no Managed workflow for yarn/);
});

test('ci.yml and release.yml run on a push to the default branch of the checkout', () => {
  const cwd = makeCheckout({});
  run('git', ['init', '-q', '--initial-branch', 'trunk'], { cwd });
  run('git', ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk'], { cwd });
  writeManagedFiles(cwd, templatesDir, 'product');
  assert.deepEqual(parse(read(cwd, 'workflows/ci.yml')).on.push.branches, ['trunk']);
  assert.deepEqual(parse(read(cwd, 'workflows/release.yml')).on.push.branches, ['trunk']);
});

// ADR-0009 decision 11: a check run from workflow_dispatch does not count for the release PR,
// a commit status does.
test('a workflow_dispatch run of ci.yml writes the verify commit status, only after verify', () => {
  const cwd = makeCheckout({});
  writeManagedFiles(cwd, templatesDir, 'sandbox');
  const ci = parse(read(cwd, 'workflows/ci.yml'));
  assert.equal(ci.permissions.statuses, 'write');
  const steps = stepsOf(cwd, 'ci.yml');
  const status = steps.at(-1);
  assert.equal(status.if, "github.event_name == 'workflow_dispatch'");
  assert.match(status.run, /statuses\/\$\{\{ github\.sha \}\} -f state=success -f context=verify$/);
  assert.match(steps.at(-2).run, /^node \.skilly\/engine\/verify\/verify\.mjs /);
});

test('release.yml runs release-please with the default token, then starts ci.yml on the release branch', () => {
  const cwd = makeCheckout({});
  writeManagedFiles(cwd, templatesDir, 'product');
  const release = parse(read(cwd, 'workflows/release.yml'));
  assert.deepEqual(release.permissions, { contents: 'write', 'pull-requests': 'write', actions: 'write' });
  const [releasePlease, dispatch] = stepsOf(cwd, 'release.yml');
  assert.match(releasePlease.uses, /^googleapis\/release-please-action@/);
  assert.deepEqual(releasePlease.with, { 'release-type': 'simple' });
  assert.match(dispatch.run, /^gh workflow run ci\.yml --ref /);
  assert.equal(dispatch.env.GH_TOKEN, '${{ github.token }}');

  writeFiles(cwd, { 'package.json': '{}' });
  writeManagedFiles(cwd, templatesDir, 'product');
  assert.deepEqual(stepsOf(cwd, 'release.yml')[0].with, { 'release-type': 'node' });
});

test("a Consumer's own release.yml stays: it can hold deploy steps", () => {
  const cwd = makeCheckout({});
  writeFiles(cwd, { '.github/workflows/release.yml': 'name: Release\n' });
  writeManagedFiles(cwd, templatesDir, 'product');
  assert.equal(read(cwd, 'workflows/release.yml'), 'name: Release\n');

  writeManagedFiles(cwd, templatesDir, 'tool');
  assert.equal(read(cwd, 'workflows/release.yml'), 'name: Release\n');
});
