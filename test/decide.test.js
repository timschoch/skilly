import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listBundles, listPreflightChecks, listUnmatchedDependencies, setConfig } from '../engine/lib/decide.js';
import { listManagedSecrets } from '../engine/lib/managed-files.js';
import { useFakeGitHub } from './fixtures/fake-github.js';
import { makeSnapshot, writeFiles } from './fixtures/sync.js';

// The decide phase of Setup (ADR-0009 decisions 1, 2 and 4): each script runs
// on a fixture folder, without the chat. GitHub is the fake gh on the PATH.
const REPO = 'timschoch/consumer';
const BIN = fileURLToPath(new URL('../bin/skilly.js', import.meta.url));

function makeSnapshotDir() {
  const { dir } = makeSnapshot();
  writeFiles(dir, {
    'bundles/workflow/config.json': JSON.stringify({ detect: { always: true } }),
    'bundles/tech-drizzle/config.json': JSON.stringify({ detect: { dependencies: ['drizzle-orm', 'drizzle-kit'] } }),
    'bundles/tech-tanstack/config.json': JSON.stringify({ detect: { dependencies: ['@tanstack/*'] } }),
    'bundles/tech-shadcn/config.json': JSON.stringify({ detect: { files: ['components.json'] } }),
    'bundles/tech-resend/config.json': JSON.stringify({
      detect: { dependencies: ['resend'] },
      secrets: ['RESEND_KEY'],
    }),
  });
  return dir;
}

function makeRepo(files = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'skilly-decide-'));
  writeFiles(cwd, files);
  return cwd;
}

const packageJson = (dependencies, devDependencies = {}) => JSON.stringify({ dependencies, devDependencies });
const ticked = (bundles) => bundles.filter((bundle) => bundle.ticked).map(({ name }) => name);

test('listBundles pre-ticks the Bundles whose detect hints match', () => {
  const snapshotDir = makeSnapshotDir();
  const cwd = makeRepo({
    'package.json': packageJson({ 'drizzle-orm': '1', '@tanstack/react-query': '5' }, { vitest: '3' }),
    'components.json': '{}',
  });
  const bundles = listBundles({ cwd, snapshotDir });

  assert.deepEqual(ticked(bundles), ['tech-drizzle', 'tech-shadcn', 'tech-tanstack', 'workflow']);
  assert.deepEqual(bundles.find(({ name }) => name === 'tech-drizzle').reasons, ['dependency drizzle-orm']);
  assert.deepEqual(bundles.find(({ name }) => name === 'tech-tanstack').reasons, ['dependency @tanstack/react-query']);
  assert.deepEqual(bundles.find(({ name }) => name === 'tech-shadcn').reasons, ['file components.json']);
  assert.deepEqual(bundles.find(({ name }) => name === 'workflow').reasons, ['every Consumer']);
  // Every Bundle of the Release is listed, ticked or not, by name.
  assert.deepEqual(
    bundles.map(({ name }) => name),
    ['extra', 'hubby', 'other', 'tech-drizzle', 'tech-resend', 'tech-shadcn', 'tech-tanstack', 'workflow'],
  );
});

test('listBundles on a second run ticks what .skilly/config.json holds', () => {
  const snapshotDir = makeSnapshotDir();
  const cwd = makeRepo({ '.skilly/config.json': JSON.stringify({ tier: 'tool', bundles: ['other'] }) });
  const bundles = listBundles({ cwd, snapshotDir });

  assert.deepEqual(ticked(bundles), ['other', 'workflow']);
  assert.deepEqual(bundles.find(({ name }) => name === 'other').reasons, ['in .skilly/config.json']);
});

test('listUnmatchedDependencies names the dependencies no Bundle hint covers', () => {
  const snapshotDir = makeSnapshotDir();
  const cwd = makeRepo({ 'package.json': packageJson({ 'drizzle-orm': '1', stripe: '1' }, { vitest: '3' }) });

  assert.deepEqual(listUnmatchedDependencies({ cwd, snapshotDir }), ['stripe', 'vitest']);
  assert.deepEqual(listUnmatchedDependencies({ cwd: makeRepo(), snapshotDir }), []);
});

test('setConfig writes the tier and Bundles and keeps the other keys', () => {
  const snapshotDir = makeSnapshotDir();
  const cwd = makeRepo({ '.skilly/config.json': JSON.stringify({ tier: 'sandbox', bundles: [], gdd: { on: true } }) });
  setConfig({ cwd, snapshotDir, tier: 'tool', bundles: ['workflow', 'tech-drizzle'] });

  assert.deepEqual(JSON.parse(readFileSync(join(cwd, '.skilly/config.json'), 'utf8')), {
    tier: 'tool',
    bundles: ['workflow', 'tech-drizzle'],
    review: { bots: [] },
    gdd: { on: true },
  });
});

test('setConfig refuses an unknown Bundle or tier and writes nothing', () => {
  const snapshotDir = makeSnapshotDir();
  const cwd = makeRepo();
  assert.throws(() => setConfig({ cwd, snapshotDir, tier: 'tool', bundles: ['nope'] }), /unknown bundle "nope"/);
  assert.throws(() => setConfig({ cwd, snapshotDir, tier: 'huge', bundles: [] }), /unknown tier "huge"/);
  assert.equal(existsSync(join(cwd, '.skilly/config.json')), false);
});

test('listManagedSecrets names the secrets the Managed files of a tier read', () => {
  const templatesDir = join(makeSnapshotDir(), 'engine', 'templates');
  assert.deepEqual(listManagedSecrets(templatesDir, 'sandbox'), []);
  assert.deepEqual(listManagedSecrets(templatesDir, 'tool'), ['CLAUDE_CODE_OAUTH_TOKEN']);
  assert.deepEqual(listManagedSecrets(templatesDir, 'product'), ['CLAUDE_CODE_OAUTH_TOKEN']);
});

const failed = (checks) => checks.filter(({ ok }) => !ok).map(({ check, detail }) => `${check}: ${detail}`);

function preflight(config, { repo = REPO, files = {}, github = {} } = {}) {
  const fake = useFakeGitHub(github);
  const cwd = makeRepo({ '.skilly/config.json': JSON.stringify(config), ...files });
  return { checks: listPreflightChecks({ cwd, snapshotDir: makeSnapshotDir(), repo }), fake };
}

test('the preflight is green when every check passes', () => {
  const { checks, fake } = preflight(
    { tier: 'tool', bundles: ['workflow'] },
    { github: { secrets: ['CLAUDE_CODE_OAUTH_TOKEN'] } },
  );
  assert.deepEqual(failed(checks), []);
  assert.deepEqual(
    checks.map(({ check }) => check),
    ['config', 'gh login', 'Hub read access', 'repo', 'skilly App', 'repo settings', 'secrets', 'package manager'],
  );
  // The preflight only reads.
  assert.deepEqual(fake.writes(), []);
});

test('the preflight fails on a missing secret and names it', () => {
  const { checks } = preflight({ tier: 'tool', bundles: ['tech-resend'] });
  assert.deepEqual(failed(checks), [
    `secrets: missing CLAUDE_CODE_OAUTH_TOKEN, RESEND_KEY. Set each: gh secret set <name> --repo ${REPO}`,
  ]);
});

test('a sandbox Consumer needs no secret', () => {
  assert.deepEqual(failed(preflight({ tier: 'sandbox', bundles: ['workflow'] }).checks), []);
});

test('the preflight fails without Hub read access and prints the invite', () => {
  const { checks } = preflight({ tier: 'sandbox', bundles: [] }, { github: { hubPermissions: { pull: false } } });
  assert.deepEqual(failed(checks), [
    'Hub read access: this gh login cannot read timschoch/skilly. The Hub owner runs: gh api -X PUT repos/timschoch/skilly/collaborators/person -f permission=pull',
  ]);
});

test('the preflight fails on an account the Hub does not sync', () => {
  const { checks } = preflight({ tier: 'sandbox', bundles: [] }, { repo: 'stranger/repo' });
  assert.match(failed(checks).join('\n'), /^skilly App: the Hub syncs only timschoch, admin-laicadev, swissdesign-md/);
});

test('the preflight fails on a plan without rulesets', () => {
  const { checks } = preflight(
    { tier: 'sandbox', bundles: [] },
    { github: { forbidden: ['GET /rulesets?includes_parents=false'] } },
  );
  const [red, ...more] = failed(checks);
  assert.deepEqual(more, []);
  assert.match(red, /^repo settings: ruleset protect-trunk: .*\(HTTP 403\)$/);
});

test('the preflight fails without a GitHub repo and names the command', () => {
  const { checks } = preflight({ tier: 'sandbox', bundles: [] }, { repo: null });
  assert.equal(checks.find(({ check }) => check === 'repo').ok, false);
  assert.match(
    checks.find(({ check }) => check === 'repo').detail,
    /gh repo create <owner>\/<name> --private --source \. --push/,
  );
  // The checks that need the repo are skipped, not run against nothing.
  assert.equal(
    checks.some(({ check }) => check === 'secrets'),
    false,
  );
});

test('the preflight fails on a package manager without a Managed workflow', () => {
  const { checks } = preflight({ tier: 'sandbox', bundles: [] }, { files: { 'yarn.lock': '' } });
  assert.deepEqual(failed(checks), ['package manager: no Managed workflow for yarn: the Engine knows npm and pnpm']);
});

test('the preflight fails without .skilly/config.json', () => {
  useFakeGitHub();
  const checks = listPreflightChecks({ cwd: makeRepo(), snapshotDir: makeSnapshotDir(), repo: REPO });
  assert.match(failed(checks)[0], /^config: no \.skilly\/config\.json/);
});

// The scripts work without the chat: the porcelain runs them from a terminal.
const runBin = (cwd, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' });

test('skilly detect prints the Bundles and the unmatched dependencies as JSON', () => {
  const cwd = makeRepo({ 'package.json': packageJson({ 'drizzle-orm': '1', stripe: '1' }) });
  const { status, stdout } = runBin(cwd, 'detect');
  assert.equal(status, 0);
  const result = JSON.parse(stdout);
  assert.ok(result.bundles.find(({ name }) => name === 'tech-drizzle').ticked);
  assert.deepEqual(result.unmatchedDependencies, ['stripe']);
  assert.equal(result.tier, 'tool');
});

test('skilly config writes .skilly/config.json', () => {
  const cwd = makeRepo();
  const { status } = runBin(cwd, 'config', 'product', 'workflow');
  assert.equal(status, 0);
  assert.deepEqual(JSON.parse(readFileSync(join(cwd, '.skilly/config.json'), 'utf8')).bundles, ['workflow']);
});

test('skilly preflight exits 1 on a red check and names it', () => {
  useFakeGitHub();
  const cwd = makeRepo({ '.skilly/config.json': JSON.stringify({ tier: 'tool', bundles: ['workflow'] }) });
  const { status, stdout } = runBin(cwd, 'preflight');
  assert.equal(status, 1);
  assert.match(stdout, /✗ repo: no GitHub origin/);
});

test('skilly setup without .skilly/config.json points at the decide phase', () => {
  const { status, stderr } = runBin(makeRepo(), 'setup');
  assert.equal(status, 1);
  assert.match(stderr, /read .*bundles\/setup-project\/skills\/setup-project\/SKILL\.md in full/);
});
