import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const engineDir = fileURLToPath(new URL('../engine/verify/', import.meta.url));

const git = (root, ...gitArguments) => {
  const result = spawnSync('git', gitArguments, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
};

const commit = (root, message) =>
  git(root, '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '--message', message);

// A git repo under a dot folder, as a worktree in `~/.t3/worktrees/` is, with the Engine's verify folder
// copied in and one commit on the branch `base`.
const makeRepo = ({ fullSuiteTriggers }) => {
  const root = join(mkdtempSync(join(tmpdir(), 'skilly-changed-')), '.worktrees', 'repo');
  const engine = join(root, '.skilly', 'engine', 'verify');
  mkdirSync(engine, { recursive: true });
  for (const file of [
    'verify.mjs',
    'merge-config.mjs',
    'bundle-steps.mjs',
    'default-branch.mjs',
    'run-changed-tests.mjs',
    'changed-files.mjs',
  ])
    copyFileSync(join(engineDir, file), join(engine, file));
  writeFileSync(join(engine, 'verify.json'), JSON.stringify({ fullSuiteTriggers, stages: {} }));
  writeFileSync(join(root, '.skilly', 'config.json'), '{}');
  git(root, 'init', '--quiet', '--initial-branch', 'base');
  git(root, 'add', '--all');
  commit(root, 'base');
  return root;
};

const write = (root, path) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), 'changed');
};

// `echo` stands in for the test runner and prints the arguments it would get.
const run = (root, { base = 'base', command = ['echo', 'tests'], cwd = root } = {}) =>
  spawnSync(process.execPath, [join(root, '.skilly', 'engine', 'verify', 'run-changed-tests.mjs'), base, ...command], {
    cwd,
    encoding: 'utf8',
  });

const TRIGGERS = ['package.json', 'pnpm-lock.yaml', 'vitest.config.*', 'drizzle/', 'src/schema.sql'];

test('a diff with only source files runs the changed tests', () => {
  const root = makeRepo({ fullSuiteTriggers: TRIGGERS });
  write(root, 'src/user.ts');
  write(root, 'src/drizzle/notes.md');
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'tests --changed base\n');
});

for (const path of [
  'pnpm-lock.yaml',
  'packages/app/package.json',
  'vitest.config.mts',
  'drizzle/0001_add.sql',
  'src/schema.sql',
]) {
  test(`a diff with ${path} runs the full suite`, () => {
    const root = makeRepo({ fullSuiteTriggers: TRIGGERS });
    write(root, 'src/user.ts');
    write(root, path);
    const result = run(root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `full suite: ${path} changed\ntests\n`);
  });
}

test('a committed trigger counts, not only the working tree', () => {
  const root = makeRepo({ fullSuiteTriggers: TRIGGERS });
  git(root, 'checkout', '--quiet', '-b', 'feat/migration');
  write(root, 'drizzle/0001_add.sql');
  git(root, 'add', '--all');
  commit(root, 'migration');
  assert.match(run(root).stdout, /^full suite: drizzle\/0001_add\.sql changed\ntests\n$/);
});

test('an untracked trigger at the git root counts for a Consumer in a subfolder', () => {
  const root = makeRepo({ fullSuiteTriggers: TRIGGERS });
  const consumer = join(root, 'packages', 'app');
  mkdirSync(join(consumer, '.skilly'), { recursive: true });
  writeFileSync(join(consumer, '.skilly', 'config.json'), '{}');
  git(root, 'add', '--all');
  commit(root, 'consumer');
  write(root, 'pnpm-lock.yaml');
  const result = run(root, { base: 'HEAD', cwd: consumer });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'full suite: pnpm-lock.yaml changed\ntests\n');
});

test('an unknown base runs the full suite', () => {
  const root = makeRepo({ fullSuiteTriggers: TRIGGERS });
  const result = run(root, { base: 'origin/missing' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'full suite: git cannot list the changes against origin/missing\ntests\n');
});

test('the exit code of the test command comes through', () => {
  const root = makeRepo({ fullSuiteTriggers: [] });
  assert.equal(run(root, { command: ['false'] }).status, 1);
});
