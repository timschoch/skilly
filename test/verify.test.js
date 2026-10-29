import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillDir = fileURLToPath(new URL('../bundles/workflow/skills/verify/', import.meta.url));
const engineDir = fileURLToPath(new URL('../engine/verify/', import.meta.url));
const shippedScript = join(engineDir, 'verify.mjs');
const shippedDefaults = join(engineDir, 'verify.json');

// Writes a fake Consumer and returns its root. The Engine's verify folder is copied in
// with `defaults` as its verify.json, so a test sees only its own steps.
// `bundles` maps a Bundle name to its config.json under `bundlesDir`; `uses`
// lists the Bundles the Consumer names in .skilly/config.json.
const makeRepo = ({ verify, defaults = {}, tier, files = [], bundles = {}, bundlesDir = 'bundles', uses } = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'skilly-verify-'));
  const engine = join(root, '.skilly', 'engine', 'verify');
  mkdirSync(engine, { recursive: true });
  for (const file of readdirSync(engineDir)) copyFileSync(join(engineDir, file), join(engine, file));
  writeFileSync(join(engine, 'verify.json'), JSON.stringify(defaults));
  if (verify) writeFileSync(join(root, '.skilly', 'verify.json'), JSON.stringify(verify));
  if (tier || uses) writeFileSync(join(root, '.skilly', 'config.json'), JSON.stringify({ tier, bundles: uses }));
  for (const [name, config] of Object.entries(bundles)) {
    mkdirSync(join(root, bundlesDir, name), { recursive: true });
    writeFileSync(join(root, bundlesDir, name, 'config.json'), JSON.stringify(config));
  }
  for (const file of files) writeFileSync(join(root, file), '');
  return root;
};

const scriptIn = (root) => join(root, '.skilly', 'engine', 'verify', 'verify.mjs');
const run = (root, ...args) => spawnSync(process.execPath, [scriptIn(root), ...args], { cwd: root, encoding: 'utf8' });

const shippedStages = () => JSON.parse(readFileSync(shippedDefaults, 'utf8')).stages;

// Consumers' ci.yml and hooks still call verify at its old skill-folder path.
const installSkillShims = (root) => {
  const scripts = join(root, '.agents', 'skills', 'verify', 'scripts');
  mkdirSync(scripts, { recursive: true });
  for (const file of readdirSync(join(skillDir, 'scripts')))
    copyFileSync(join(skillDir, 'scripts', file), join(scripts, file));
  return join(scripts, 'verify.mjs');
};

test('the default branch name step runs in a Consumer that has the verify skill and the Engine', () => {
  const step = shippedStages().push.steps.find(({ name }) => name === 'branch name');
  const root = makeRepo({ defaults: { stages: { push: { steps: [step] } } }, tier: 'sandbox' });
  installSkillShims(root);
  spawnSync('git', ['init', '--quiet', '--initial-branch', 'wip', root]);
  const { GITHUB_HEAD_REF, ...env } = process.env;
  const result = spawnSync(process.execPath, [scriptIn(root), 'push'], { cwd: root, encoding: 'utf8', env });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Invalid branch name: "wip"/);
});

test('the old skill-folder path runs the Engine verify with its arguments and exit code', () => {
  const failing = { name: 'red', run: 'exit 3' };
  const root = makeRepo({ defaults: { stages: { commit: { steps: [failing] } } }, tier: 'sandbox' });
  const shim = installSkillShims(root);
  const steps = spawnSync(process.execPath, [shim, 'commit', '--steps'], { cwd: root, encoding: 'utf8' });
  assert.equal(steps.status, 0, steps.stderr);
  assert.deepEqual(JSON.parse(steps.stdout).steps, [failing]);
  assert.equal(spawnSync(process.execPath, [shim, 'commit'], { cwd: root, encoding: 'utf8' }).status, 3);
});

test('the old skill-folder path names the missing Engine', () => {
  const root = mkdtempSync(join(tmpdir(), 'skilly-verify-'));
  const result = spawnSync(process.execPath, [installSkillShims(root), 'push'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no \.skilly\/engine\/verify\/verify\.mjs/);
});

// Sync delivers the verify skill and nothing beside it. A default step that
// runs a file from somewhere else fails in every Consumer that lacks the file.
test('a default step runs a file only when the verify skill ships it or a target guards it', () => {
  const installed = '.agents/skills/verify/';
  for (const { steps = [] } of Object.values(shippedStages()))
    for (const { name, run: command, target } of steps) {
      const file = /^node (\S+)/.exec(command)?.[1];
      if (!file || file === target) continue;
      assert.ok(file.startsWith(installed), `${name}: ${file} is outside the verify skill and has no target`);
      assert.ok(existsSync(join(skillDir, file.slice(installed.length))), `${name}: the skill does not ship ${file}`);
    }
});

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

test('a step gets the default branch from the GitHub event payload as DEFAULT_BRANCH', () => {
  const root = makeRepo({
    verify: { stages: { commit: { steps: [{ name: 'env', run: 'echo "default=[$DEFAULT_BRANCH]"' }] } } },
  });
  const event = join(root, 'event.json');
  writeFileSync(event, JSON.stringify({ repository: { default_branch: 'v2-rebuild' } }));
  const { DEFAULT_BRANCH, ...env } = process.env;
  const result = spawnSync(process.execPath, [scriptIn(root), 'commit'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...env, GITHUB_EVENT_PATH: event },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /default=\[v2-rebuild\]/);
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

test('a step that runs replaces the step it names, so the tests run one time', () => {
  const verify = {
    stages: {
      push: { steps: [{ name: 'unit (changed)', run: 'echo ran-changed' }] },
      ci: { extends: 'push', steps: [{ name: 'unit', run: 'echo ran-full', replaces: 'unit (changed)' }] },
    },
  };
  const root = makeRepo({ verify });

  const ci = run(root, 'ci');
  assert.equal(ci.status, 0, ci.stderr);
  assert.match(ci.stdout, /ran-full/);
  assert.doesNotMatch(ci.stdout, /ran-changed/);
  assert.match(ci.stdout, /skip +unit \(changed\): replaced by unit/);

  // The stage below still runs its own step.
  assert.match(run(root, 'push').stdout, /ran-changed/);
});

test('a skipped step replaces nothing', () => {
  const verify = {
    stages: {
      push: { steps: [{ name: 'unit (changed)', run: 'echo ran-changed' }] },
      ci: {
        extends: 'push',
        steps: [{ name: 'unit', run: 'echo ran-full', replaces: 'unit (changed)', target: 'vitest.config.ts' }],
      },
    },
  };
  const result = run(makeRepo({ verify }), 'ci');
  assert.match(result.stdout, /ran-changed/);
  assert.doesNotMatch(result.stdout, /ran-full/);
});

test('a stage runs without the inherited steps it names, and the replaced step comes back', () => {
  const verify = {
    stages: {
      push: { steps: [{ name: 'unit (changed)', run: 'echo ran-changed' }] },
      ci: {
        extends: 'push',
        steps: [
          { name: 'lint', run: 'echo ran-lint' },
          { name: 'unit', run: 'echo ran-full', replaces: 'unit (changed)' },
          { name: 'e2e smoke', run: 'echo ran-smoke' },
        ],
      },
      pr: { extends: 'ci', without: ['unit', 'e2e smoke'] },
    },
  };
  const listed = JSON.parse(run(makeRepo({ verify }), 'pr', '--steps').stdout);
  assert.deepEqual(
    listed.steps.map(({ name }) => name),
    ['unit (changed)', 'lint'],
  );
  assert.deepEqual(listed.skipped, [
    { name: 'unit', reason: 'stage pr runs without it' },
    { name: 'e2e smoke', reason: 'stage pr runs without it' },
  ]);
});

const stepNames = (tier, stage) => {
  const root = makeRepo({ tier, defaults: JSON.parse(readFileSync(shippedDefaults, 'utf8')) });
  for (const file of ['vitest.config.ts', 'playwright.config.ts']) writeFileSync(join(root, file), '');
  return JSON.parse(run(root, stage, '--steps').stdout).steps.map(({ name }) => name);
};

test('the shipped ci stage runs the full suites and each unit test one time', () => {
  assert.deepEqual(stepNames('product', 'ci'), [
    'branch name',
    'typecheck',
    'lint',
    'unit',
    'build',
    'audit',
    'e2e smoke',
  ]);
  assert.deepEqual(stepNames('sandbox', 'ci'), ['branch name', 'typecheck', 'lint', 'unit', 'build']);
});

test('the shipped pr stage runs the changed tests and no full suite', () => {
  assert.deepEqual(stepNames('product', 'pr'), [
    'branch name',
    'typecheck',
    'unit (changed)',
    'lint',
    'build',
    'audit',
  ]);
});

test('the shipped nightly stage runs the full unit suite', () => {
  assert.ok(stepNames('product', 'nightly').includes('unit'));
});

test('a step above the repo tier is skipped and listed in --steps', () => {
  const root = makeRepo({ verify: { stages: { ci: { steps: [{ name: 'audit', run: 'exit 3', tier: 'tool' }] } } } });

  const result = run(root, 'ci');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /skip +audit: needs tool, repo is sandbox/);

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
  assert.match(without.stdout, /skip +e2e: no e2e\.config\.ts/);
  assert.doesNotMatch(without.stdout, /ran-e2e/);

  const present = run(makeRepo({ verify, files: ['e2e.config.ts'] }), 'ci');
  assert.equal(present.status, 0);
  assert.match(present.stdout, /ran-e2e/);
});

test('a red step does not stop the stage: every step runs and the summary lists each result', () => {
  const root = makeRepo({
    verify: {
      stages: {
        ci: {
          steps: [
            { name: 'typecheck', run: 'true' },
            { name: 'unit', run: 'exit 3', why: 'a red unit test means the change is wrong' },
            { name: 'lint', run: 'exit 4' },
            { name: 'build', run: 'echo ran-build' },
            { name: 'e2e', run: 'true', target: 'e2e.config.ts' },
          ],
        },
      },
    },
  });
  const result = run(root, 'ci');
  // The first red step's exit code, so a caller sees the same code as before.
  assert.equal(result.status, 3);
  assert.match(result.stdout, /ran-build/);
  assert.match(result.stderr, /FAILED ci: unit/);
  assert.match(result.stderr, /a red unit test means the change is wrong/);
  assert.match(result.stderr, /FAILED ci: lint/);
  const summary = result.stdout.slice(result.stdout.indexOf('ci failed'));
  assert.match(summary, /^ci failed: 2 of 4 steps red in [\d.]+s$/m);
  assert.match(summary, /^ {2}ok +[\d.]+s {2}typecheck$/m);
  assert.match(summary, /^ {2}FAILED +[\d.]+s {2}unit$/m);
  assert.match(summary, /^ {2}FAILED +[\d.]+s {2}lint$/m);
  assert.match(summary, /^ {2}ok +[\d.]+s {2}build$/m);
  assert.match(summary, /^ {2}skip +e2e: no e2e\.config\.ts$/m);
});

test('a green stage lists each step in its summary', () => {
  const root = makeRepo({ verify: { stages: { ci: { steps: [{ name: 'lint', run: 'true' }] } } } });
  const result = run(root, 'ci');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^ci passed in [\d.]+s$/m);
  assert.match(result.stdout, /^ {2}ok +[\d.]+s {2}lint$/m);
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

test('verify merges 3 layers: Engine defaults, Bundle steps, then .skilly/verify.json by step name', () => {
  const root = makeRepo({
    uses: ['web'],
    defaults: {
      fullSuiteTriggers: ['package.json'],
      stages: {
        push: { steps: [{ name: 'typecheck', run: 'tsc' }] },
        ci: { extends: 'push', steps: [{ name: 'build', run: 'npm run build' }] },
      },
    },
    bundles: {
      web: {
        includes: ['db'],
        verify: {
          fullSuiteTriggers: ['next.config.*'],
          steps: [
            { name: 'naming', stage: 'push', run: 'node naming.mjs', why: 'names' },
            { name: 'e2e smoke', stage: 'ci', tier: 'product', run: 'npx playwright test', toolchain: ['playwright'] },
          ],
        },
      },
      db: {
        verify: {
          fullSuiteTriggers: ['drizzle/'],
          steps: [{ name: 'migrations', stage: 'ci', run: 'drizzle-kit check', paths: ['drizzle/**'] }],
        },
      },
    },
    verify: {
      fullSuiteTriggers: ['migrations/'],
      stages: {
        push: { steps: [{ name: 'naming', run: 'node own-naming.mjs' }] },
        ci: { steps: ['-migrations'] },
      },
    },
  });
  assert.deepEqual(JSON.parse(run(root, '--config').stdout), {
    fullSuiteTriggers: ['package.json', 'drizzle/', 'next.config.*', 'migrations/'],
    stages: {
      push: {
        steps: [
          { name: 'typecheck', run: 'tsc' },
          { name: 'naming', run: 'node own-naming.mjs', why: 'names' },
        ],
      },
      ci: {
        extends: 'push',
        steps: [
          { name: 'build', run: 'npm run build' },
          { name: 'e2e smoke', tier: 'product', run: 'npx playwright test', toolchain: ['playwright'] },
        ],
      },
    },
  });
});

test('a Bundle step lands in a stage the defaults do not have', () => {
  const root = makeRepo({
    uses: ['web'],
    bundles: { web: { verify: { steps: [{ name: 'lighthouse', stage: 'nightly', run: 'echo ran-lighthouse' }] } } },
  });
  const result = run(root, 'nightly');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ran-lighthouse/);
});

test('the Engine copy of the Bundle configs wins over a bundles/ folder of the repo', () => {
  const step = (name) => ({ verify: { steps: [{ name, stage: 'commit', run: 'true' }] } });
  const root = makeRepo({
    uses: ['web'],
    bundlesDir: join('.skilly', 'engine', 'bundles'),
    bundles: { web: step('engine') },
  });
  mkdirSync(join(root, 'bundles', 'web'), { recursive: true });
  writeFileSync(join(root, 'bundles', 'web', 'config.json'), JSON.stringify(step('own folder')));
  const listed = JSON.parse(run(root, 'commit', '--steps').stdout);
  assert.deepEqual(
    listed.steps.map(({ name }) => name),
    ['engine'],
  );
});

test('without Bundle configs verify runs the other layers and says the Bundle steps are missing', () => {
  const defaults = { stages: { commit: { steps: [{ name: 'lint', run: 'echo ran-default' }] } } };
  const result = run(makeRepo({ uses: ['workflow'], defaults }), 'commit');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ran-default/);
  assert.match(result.stderr, /no Bundle configs .* Bundle steps of workflow do not run/);
});

test('a Bundle with no config, an include cycle or a step without a stage exits 2', () => {
  const cases = [
    [{ uses: ['ghost'], bundles: { web: {} } }, /unknown Bundle "ghost"/],
    [{ uses: ['a'], bundles: { a: { includes: ['b'] }, b: { includes: ['a'] } } }, /Bundle include cycle: a -> b -> a/],
    [
      { uses: ['web'], bundles: { web: { verify: { steps: [{ name: 'x', run: 'true' }] } } } },
      /step x of Bundle web has no stage/,
    ],
  ];
  for (const [options, message] of cases) {
    const result = run(makeRepo(options), '--config');
    assert.equal(result.status, 2, result.stdout);
    assert.match(result.stderr, message);
  }
});

// The Hub is a Consumer of itself: its ci stage runs the Rules of the workflow
// Bundle from bundles/.
test('the Hub ci stage runs the Rules of the workflow Bundle as steps', () => {
  const hubRoot = fileURLToPath(new URL('..', import.meta.url));
  const result = spawnSync(process.execPath, [shippedScript, 'ci', '--steps'], { cwd: hubRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const names = JSON.parse(result.stdout).steps.map(({ name }) => name);
  for (const rule of ['naming', 'conventional-commits']) assert.ok(names.includes(rule), `${rule} in ${names}`);
});
