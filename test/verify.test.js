import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillDir = fileURLToPath(new URL('../bundles/workflow/skills/verify/', import.meta.url));
const shippedScript = join(skillDir, 'scripts', 'verify.mjs');

// Writes a fake Consumer and returns its root. The verify skill is copied in
// with `defaults` as its references/verify.json, so a test sees only its own steps.
const makeRepo = ({ verify, defaults = {}, tier, files = [] } = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'skilly-verify-'));
  const scripts = join(root, '.agents', 'skills', 'verify', 'scripts');
  mkdirSync(scripts, { recursive: true });
  mkdirSync(join(root, '.agents', 'skills', 'verify', 'references'));
  for (const file of ['verify.mjs', 'merge-config.mjs'])
    copyFileSync(join(skillDir, 'scripts', file), join(scripts, file));
  writeFileSync(join(root, '.agents', 'skills', 'verify', 'references', 'verify.json'), JSON.stringify(defaults));
  if (verify || tier) mkdirSync(join(root, '.skilly'), { recursive: true });
  if (verify) writeFileSync(join(root, '.skilly', 'verify.json'), JSON.stringify(verify));
  if (tier) writeFileSync(join(root, '.skilly', 'config.json'), JSON.stringify({ tier }));
  for (const file of files) writeFileSync(join(root, file), '');
  return root;
};

const scriptIn = (root) => join(root, '.agents', 'skills', 'verify', 'scripts', 'verify.mjs');
const run = (root, ...args) => spawnSync(process.execPath, [scriptIn(root), ...args], { cwd: root, encoding: 'utf8' });

test('a step does not inherit the git hook env', () => {
  const root = makeRepo({
    verify: { stages: { commit: { steps: [{ name: 'env', run: 'echo "dir=[$GIT_DIR] home=[$HOME]"' }] } } },
  });
  const result = spawnSync(process.execPath, [scriptIn(root), 'commit'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GIT_DIR: '/elsewhere/.git', GIT_INDEX_FILE: '/elsewhere/index' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /dir=\[\] home=\[.+\]/);
});

test('extends is cumulative: push runs the commit steps first', () => {
  const root = makeRepo({
    verify: {
      stages: {
        commit: { steps: [{ name: 'first', run: 'echo step-commit' }] },
        push: { extends: 'commit', steps: [{ name: 'second', run: 'echo step-push' }] },
      },
    },
  });
  const result = run(root, 'push');
  assert.equal(result.status, 0);
  const commitAt = result.stdout.indexOf('step-commit');
  const pushAt = result.stdout.indexOf('step-push');
  assert.ok(commitAt >= 0 && pushAt >= 0, result.stdout);
  assert.ok(commitAt < pushAt, result.stdout);
});

test('a step above the repo tier is skipped and listed in --steps', () => {
  const root = makeRepo({ verify: { stages: { ci: { steps: [{ name: 'audit', run: 'exit 3', tier: 'tool' }] } } } });

  const result = run(root, 'ci');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /skip audit: needs tool, repo is sandbox/);

  const listed = JSON.parse(run(root, 'ci', '--steps').stdout);
  assert.deepEqual(listed.steps, []);
  assert.deepEqual(listed.skipped, [{ name: 'audit', reason: 'needs tool, repo is sandbox' }]);
  assert.equal(listed.tier, 'sandbox');
});

test('a stage above the repo tier runs nothing and exits 0', () => {
  const root = makeRepo({
    tier: 'tool',
    verify: { stages: { nightly: { tier: 'product', steps: [{ name: 'e2e', run: 'exit 3' }] } } },
  });
  const result = run(root, 'nightly');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /stage nightly needs product, repo is tool: nothing to run/);
  assert.doesNotMatch(result.stdout, /> nightly:/);
});

test('a step whose target is missing is skipped, and runs once the target is there', () => {
  const verify = { stages: { ci: { steps: [{ name: 'e2e', run: 'echo ran-e2e', target: 'e2e.config.ts' }] } } };

  const without = run(makeRepo({ verify }), 'ci');
  assert.equal(without.status, 0);
  assert.match(without.stdout, /skip e2e: no e2e\.config\.ts/);
  assert.doesNotMatch(without.stdout, /ran-e2e/);

  const present = run(makeRepo({ verify, files: ['e2e.config.ts'] }), 'ci');
  assert.equal(present.status, 0);
  assert.match(present.stdout, /ran-e2e/);
});

test('a failing step propagates its exit code and prints its why', () => {
  const root = makeRepo({
    verify: {
      stages: {
        ci: {
          steps: [
            { name: 'typecheck', run: 'true' },
            { name: 'unit', run: 'exit 3', why: 'a red unit test means the change is wrong' },
            { name: 'build', run: 'echo never-runs' },
          ],
        },
      },
    },
  });
  const result = run(root, 'ci');
  assert.equal(result.status, 3);
  assert.match(result.stderr, /FAILED ci: unit/);
  assert.match(result.stderr, /a red unit test means the change is wrong/);
  assert.doesNotMatch(result.stdout, /never-runs/);
});

test('a stage over its budget warns and still passes', () => {
  const root = makeRepo({
    verify: { stages: { commit: { budgetSeconds: 0, steps: [{ name: 'noop', run: 'true' }] } } },
  });
  const result = run(root, 'commit');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /WARNING: commit took .*over its 0s budget/);
  assert.match(result.stdout, /never fails the gate/);
  // The ticket line is the config's, so an unset ticket prints no line at all.
  assert.doesNotMatch(result.stdout, /Split the stage/);
});

test('an unknown stage exits 2 and lists the known stages', () => {
  const root = makeRepo({ verify: { stages: { commit: { steps: [] }, push: { extends: 'commit', steps: [] } } } });
  const result = run(root, 'nightly');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown stage "nightly"/);
  assert.match(result.stderr, /known stages are commit, push/);
});

test('no .skilly/ marker up the tree exits 2', () => {
  const result = run(makeRepo(), 'commit');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /no \.skilly\/config\.json or \.skilly\/verify\.json/);
});

test('without a repo file the defaults run', () => {
  const defaults = { stages: { commit: { steps: [{ name: 'lint', run: 'echo ran-default' }] } } };
  const result = run(makeRepo({ defaults, tier: 'sandbox' }), 'commit');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ran-default/);
});

test('the repo file changes, drops and adds default steps by name', () => {
  const defaults = {
    stages: {
      push: {
        steps: [
          { name: 'lint', run: 'npm run lint', why: 'style' },
          { name: 'unit', run: 'npm test' },
        ],
      },
    },
  };
  const verify = {
    stages: { push: { steps: [{ name: 'lint', run: 'pnpm lint' }, '-unit', { name: 'e2e', run: 'x' }] } },
  };
  const listed = JSON.parse(run(makeRepo({ defaults, verify }), 'push', '--steps').stdout);
  assert.deepEqual(listed.steps, [
    { name: 'lint', run: 'pnpm lint', why: 'style' },
    { name: 'e2e', run: 'x' },
  ]);
});

test('a repo file that copies the defaults in full resolves to the defaults', () => {
  const defaults = {
    stages: {
      push: {
        steps: [
          { name: 'lint', run: 'a' },
          { name: 'unit', run: 'b' },
        ],
      },
    },
  };
  const root = makeRepo({ defaults, verify: defaults });
  assert.deepEqual(JSON.parse(run(root, '--config').stdout), defaults);
});

test('the shipped defaults put the naming gate in the push stage', () => {
  const root = mkdtempSync(join(tmpdir(), 'skilly-verify-'));
  mkdirSync(join(root, '.skilly'));
  writeFileSync(join(root, '.skilly', 'config.json'), '{}');
  const result = spawnSync(process.execPath, [shippedScript, 'push', '--steps'], { cwd: root, encoding: 'utf8' });
  const { skipped } = JSON.parse(result.stdout);
  assert.ok(
    skipped.some(({ name }) => name === 'naming'),
    result.stdout,
  );
});
