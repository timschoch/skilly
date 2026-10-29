import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hookEntries, mergeClaudeSettings, mergeLefthook, mergePackageJson, writeHooks } from '../engine/lib/hooks.js';
import { run } from '../engine/lib/run.js';
import { makeCheckout, writeFiles } from './fixtures/sync.js';

const LINT = 'node .skilly/engine/verify/check-commit-msg.mjs {1}';
const GUARD = 'bash "$CLAUDE_PROJECT_DIR"/.skilly/engine/verify/block-destructive-git.sh';
const commandHook = (command) => ({ type: 'command', command });
const bashGroup = (command) => ({ matcher: 'Bash', hooks: [commandHook(command)] });

function makeBundles() {
  const dir = mkdtempSync(join(tmpdir(), 'skilly-hook-bundles-'));
  writeFiles(dir, {
    'base/config.json': JSON.stringify({
      hooks: {
        lefthook: {
          'pre-commit': { commands: { 'skilly-lint-staged': { run: 'npx lint-staged' } } },
          'commit-msg': { commands: { 'skilly-conventional-commits': { run: LINT } } },
        },
        claude: { PreToolUse: [bashGroup(GUARD)] },
      },
    }),
    'gdd/config.json': JSON.stringify({
      includes: ['base'],
      hooks: {
        lefthook: {
          'pre-commit': { piped: true, commands: { 'skilly-gdd': { run: 'node .skilly/engine/gdd/x.mjs' } } },
        },
        claude: { PreToolUse: [bashGroup('node "$CLAUDE_PROJECT_DIR/.skilly/engine/gdd/check-pr.mjs"')] },
      },
    }),
    'plain/config.json': JSON.stringify({ sources: [] }),
  });
  return dir;
}

test('hookEntries: merges the lefthook commands and the Claude Code groups of the Bundles', () => {
  const entries = hookEntries(['base', 'gdd', 'plain'], makeBundles());
  assert.deepEqual(entries.lefthook['pre-commit'], {
    piped: true,
    commands: {
      'skilly-lint-staged': { run: 'npx lint-staged' },
      'skilly-gdd': { run: 'node .skilly/engine/gdd/x.mjs' },
    },
  });
  assert.deepEqual(Object.keys(entries.lefthook), ['pre-commit', 'commit-msg']);
  assert.equal(entries.claude.PreToolUse.length, 2);
});

test('mergeClaudeSettings: replaces the skilly entries and keeps the own entries and other settings', () => {
  const own = bashGroup('bash "$CLAUDE_PROJECT_DIR"/.claude/hooks/guard.sh');
  const settings = {
    model: 'opus',
    hooks: {
      PreToolUse: [
        own,
        // old setup-repo and gdd setup.mjs entries run skill-folder scripts
        bashGroup('bash "$CLAUDE_PROJECT_DIR"/.agents/skills/verify/scripts/block-destructive-git.sh'),
        bashGroup('node "$CLAUDE_PROJECT_DIR/.claude/skills/gdd/scripts/check-pr.mjs"'),
        { matcher: 'Bash', hooks: [commandHook('echo own'), commandHook(GUARD)] },
      ],
      Stop: [bashGroup('echo stop')],
    },
  };
  const merged = mergeClaudeSettings(settings, { PreToolUse: [bashGroup(GUARD)], PostToolUse: [bashGroup('x')] });
  assert.equal(merged.model, 'opus');
  assert.deepEqual(merged.hooks.PreToolUse, [
    own,
    { matcher: 'Bash', hooks: [commandHook('echo own')] },
    bashGroup(GUARD),
  ]);
  assert.deepEqual(merged.hooks.Stop, [bashGroup('echo stop')]);
  assert.deepEqual(merged.hooks.PostToolUse, [bashGroup('x')]);
  assert.deepEqual(
    mergeClaudeSettings(merged, { PreToolUse: [bashGroup(GUARD)], PostToolUse: [bashGroup('x')] }),
    merged,
  );
  assert.deepEqual(mergeClaudeSettings({ hooks: { PreToolUse: [bashGroup(GUARD)] } }, {}), {});
});

test('mergeLefthook: adds the extends line once and keeps the own commands and comments', () => {
  const own = '# own hooks\npre-commit:\n  commands:\n    test:\n      run: npm test\n';
  const merged = mergeLefthook(own, new Set());
  assert.equal(merged, `extends:\n  - .skilly/lefthook.json\n\n${own}`);
  assert.equal(mergeLefthook(merged, new Set()), merged);
  assert.equal(mergeLefthook('', new Set()), 'extends:\n  - .skilly/lefthook.json\n');
  assert.equal(
    mergeLefthook('extends:\n    - other.yml\nx: 1\n', new Set()),
    'extends:\n    - .skilly/lefthook.json\n    - other.yml\nx: 1\n',
  );
  assert.throws(() => mergeLefthook('extends: [other.yml]\n', new Set()), /extends/);
});

test('mergeLefthook: drops the old setup-repo commands and the empty hooks they leave', () => {
  const old = [
    '# The gate ladder lives in .skilly/verify.json.',
    'pre-commit:',
    '  commands:',
    '    lint-staged:',
    '      run: npx lint-staged',
    '    test:',
    '      run: npm test',
    'commit-msg:',
    '  commands:',
    '    conventional:',
    '      run: node .agents/skills/verify/scripts/check-commit-msg.mjs {1}',
    'pre-push:',
    '  commands:',
    '    # Trunk guard first.',
    '    no-main:',
    "      run: 'node .agents/skills/verify/scripts/check-push-branch.mjs'",
    '      use_stdin: true',
    '    verify:',
    '      run: node .agents/skills/verify/scripts/verify.mjs push',
    '',
  ].join('\n');
  assert.equal(
    mergeLefthook(old, new Set(['npx lint-staged'])),
    [
      'extends:',
      '  - .skilly/lefthook.json',
      '',
      '# The gate ladder lives in .skilly/verify.json.',
      'pre-commit:',
      '  commands:',
      '    test:',
      '      run: npm test',
      '',
    ].join('\n'),
  );
});

test('mergePackageJson: swaps husky for lefthook and installs it in prepare', () => {
  const merged = mergePackageJson({
    name: 'x',
    scripts: { prepare: 'husky', test: 'vitest' },
    devDependencies: { husky: '^9.1.7', vitest: '^3.0.0' },
  });
  assert.deepEqual(merged.scripts, { prepare: 'lefthook install --reset-hooks-path', test: 'vitest' });
  assert.deepEqual(Object.keys(merged.devDependencies), ['lefthook', 'vitest']);
  assert.equal(mergePackageJson(merged), merged, 'a second merge changes nothing');
  assert.equal(
    mergePackageJson({ scripts: { prepare: 'husky install && npm run build' } }).scripts.prepare,
    'lefthook install --reset-hooks-path && npm run build',
  );
  assert.equal(
    mergePackageJson({ scripts: { prepare: 'npm run build' } }).scripts.prepare,
    'npm run build && lefthook install --reset-hooks-path',
  );
  const lefthookUser = { scripts: { prepare: 'lefthook install' }, devDependencies: { lefthook: '^1.0.0' } };
  assert.equal(mergePackageJson(lefthookUser), lefthookUser);
});

function makeHuskyConsumer() {
  const cwd = makeCheckout({ bundles: ['gdd'] });
  writeFiles(cwd, {
    '.husky/pre-commit': '#!/usr/bin/env sh\n. "$(dirname -- "$0")/_/husky.sh"\n\nnpx lint-staged\nnpm run typecheck\n',
    '.husky/commit-msg': 'node .agents/skills/verify/scripts/check-commit-msg.mjs "$1"\n',
    '.husky/pre-push':
      '# Trunk guard first.\nnode .agents/skills/verify/scripts/check-push-branch.mjs\nnode scripts/own.mjs "$1"\n',
    '.husky/_/husky.sh': '# husky internals\n',
    '.claude/settings.json': JSON.stringify({ hooks: { PreToolUse: [bashGroup('echo own')] } }),
    'package.json': JSON.stringify({ name: 'x', scripts: { prepare: 'husky' }, devDependencies: { husky: '^9.0.0' } }),
    'package-lock.json': '{}\n',
  });
  return cwd;
}

// Records the lockfile refreshes instead of running a package manager.
function recordRefreshes() {
  const refreshed = [];
  return { refreshed, refreshLock: (cwd) => refreshed.push(cwd) };
}

test('writeHooks: a husky Consumer ends up on lefthook with its own lines and no .husky/', () => {
  const cwd = makeHuskyConsumer();
  const { refreshed, refreshLock } = recordRefreshes();
  writeHooks(cwd, { bundles: ['base', 'gdd'], bundlesDir: makeBundles(), refreshLock });

  assert.ok(!existsSync(join(cwd, '.husky')));
  assert.equal(
    readFileSync(join(cwd, 'lefthook.yml'), 'utf8'),
    [
      'extends:',
      '  - .skilly/lefthook.json',
      '',
      'pre-commit:',
      '  commands:',
      '    husky:',
      '      run: npm run typecheck',
      'pre-push:',
      '  commands:',
      '    husky:',
      '      run: node scripts/own.mjs {1}',
      '',
    ].join('\n'),
  );
  const skilly = JSON.parse(readFileSync(join(cwd, '.skilly/lefthook.json'), 'utf8'));
  assert.equal(skilly['commit-msg'].commands['skilly-conventional-commits'].run, LINT);
  const settings = JSON.parse(readFileSync(join(cwd, '.claude/settings.json'), 'utf8'));
  assert.deepEqual(
    settings.hooks.PreToolUse.map((group) => group.hooks[0].command),
    ['echo own', GUARD, 'node "$CLAUDE_PROJECT_DIR/.skilly/engine/gdd/check-pr.mjs"'],
  );
  const manifest = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.devDependencies), ['lefthook']);
  assert.deepEqual(refreshed, [cwd]);

  // A second run writes the same files and leaves the lockfile alone.
  const before = ['lefthook.yml', '.skilly/lefthook.json', '.claude/settings.json', 'package.json'].map((path) =>
    readFileSync(join(cwd, path), 'utf8'),
  );
  writeHooks(cwd, { bundles: ['base', 'gdd'], bundlesDir: makeBundles(), refreshLock });
  assert.deepEqual(
    ['lefthook.yml', '.skilly/lefthook.json', '.claude/settings.json', 'package.json'].map((path) =>
      readFileSync(join(cwd, path), 'utf8'),
    ),
    before,
  );
  assert.equal(refreshed.length, 1);
});

test('writeHooks: a removed Bundle takes its hook entries with it', () => {
  const cwd = makeHuskyConsumer();
  const bundlesDir = makeBundles();
  const { refreshLock } = recordRefreshes();
  writeHooks(cwd, { bundles: ['base', 'gdd'], bundlesDir, refreshLock });
  writeHooks(cwd, { bundles: ['base'], bundlesDir, refreshLock });
  const settings = JSON.parse(readFileSync(join(cwd, '.claude/settings.json'), 'utf8'));
  assert.deepEqual(
    settings.hooks.PreToolUse.map((group) => group.hooks[0].command),
    ['echo own', GUARD],
  );
  const skilly = JSON.parse(readFileSync(join(cwd, '.skilly/lefthook.json'), 'utf8'));
  assert.ok(!('skilly-gdd' in skilly['pre-commit'].commands));
});

test('writeHooks: a husky hook whose name the own lefthook.yml already has stops the Sync', () => {
  const cwd = makeHuskyConsumer();
  writeFiles(cwd, { 'lefthook.yml': 'pre-commit:\n  commands:\n    own:\n      run: echo own\n' });
  assert.throws(
    () => writeHooks(cwd, { bundles: ['base'], bundlesDir: makeBundles(), refreshLock: recordRefreshes().refreshLock }),
    /\.husky\/pre-commit/,
  );
  assert.ok(existsSync(join(cwd, '.husky/pre-commit')), 'nothing deleted');
});

test('writeHooks: a Consumer without Bundle hook entries gets no hook files', () => {
  const cwd = makeCheckout({});
  writeHooks(cwd, { bundles: ['plain'], bundlesDir: makeBundles(), refreshLock: recordRefreshes().refreshLock });
  for (const path of ['lefthook.yml', '.skilly/lefthook.json', '.claude/settings.json']) {
    assert.ok(!existsSync(join(cwd, path)), path);
  }
});

test('writeHooks: skips the Hub, which wires engine/ itself', () => {
  const cwd = makeCheckout({});
  run('git', ['init', '-q'], { cwd });
  run('git', ['remote', 'add', 'origin', 'https://timschoch@github.com/timschoch/skilly.git'], { cwd });
  mkdirSync(join(cwd, '.husky'));
  writeFileSync(join(cwd, '.husky/pre-commit'), 'npx lint-staged\n');
  writeHooks(cwd, { bundles: ['base'], bundlesDir: makeBundles(), refreshLock: recordRefreshes().refreshLock });
  assert.ok(existsSync(join(cwd, '.husky/pre-commit')));
  assert.ok(!existsSync(join(cwd, 'lefthook.yml')));
});
