import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { audit } from '../bundles/workflow/skills/audit-skilly-workflow/scripts/audit.mjs';
import { writeConsumer } from './fixtures/audit-skilly-workflow.js';

// A husky hook exports GIT_DIR to its children; the temp repos below must not inherit it.
for (const key of Object.keys(process.env)) if (key.startsWith('GIT_')) delete process.env[key];

const freshDirectory = () => realpathSync(mkdtempSync(join(tmpdir(), 'skilly-audit-')));
const git = (directory, ...parts) =>
  execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...parts], {
    cwd: directory,
    stdio: 'ignore',
  });

test('audit-skilly-workflow: each planted defect yields its finding', () => {
  const repo = freshDirectory();
  const home = freshDirectory();
  writeConsumer(repo, home);
  const result = audit(repo, home);

  const found = result.findings.map(({ kind, where }) => `${kind} ${where}`).sort();
  assert.deepEqual(found, [
    'dead-path CLAUDE.md:8',
    'hook-duplicate .claude/settings.json: PreToolUse [Bash]',
    'hook-matcher-gap .claude/settings.json: PreToolUse [Bash]',
    'hook-matcher-gap .claude/settings.json: PreToolUse [Write|Edit|mcp__lean-ctx__ctx_patch]',
    'hook-not-executable .claude/settings.json: "$CLAUDE_PROJECT_DIR"/.claude/hooks/guard.sh',
    'hook-target-missing .claude/settings.json: node "$CLAUDE_PROJECT_DIR/.claude/hooks/gone.mjs"',
    'overlay-orphan .claude/rules/workflow-retired.local.md',
    'skill-shadowed ~/.claude/skills/demo-skill',
    'synced-rule-edited .claude/rules/workflow-commits.md',
  ]);

  const owners = Object.fromEntries(result.sources.map(({ path, owner }) => [path, owner]));
  assert.equal(owners['.claude/rules/workflow-delegation.md'], 'skilly');
  assert.equal(owners['.claude/rules/workflow-delegation.local.md'], 'overlay');
  assert.equal(owners['CLAUDE.md'], 'repo');
  assert.equal(owners['~/.claude/CLAUDE.md'], 'global');

  assert.deepEqual(result.gates.commit.skilly.types.slice(0, 4), ['feat', 'fix', 'chore', 'docs']);
  assert.equal(result.gates.commit.skilly.descriptionMax, 72);
  // lefthook.yml is setup-repo's template, which runs the skilly commit hook: no second gate.
  assert.deepEqual(result.gates.commit.others, ['commitlint.config.js']);
  assert.equal(result.tier, 'tool');
  assert.equal(result.gates.verify.file, '.skilly/verify.json');
  assert.deepEqual(result.gates.verify.stages.push.steps, [{ name: 'unit', run: 'npm test' }]);
  assert.deepEqual(result.skills, [{ name: 'demo-skill', description: 'Shows a demo.' }]);
  assert.match(
    result.report.file,
    new RegExp(`^${join(repo, '.temp', 'audit-skilly-workflow')}/\\d{4}-\\d{2}-\\d{2}-${basename(repo)}\\.html$`),
  );
  assert.equal(result.report.ignored, false);
});

test('audit-skilly-workflow: a worktree reports into the main checkout', () => {
  const repo = freshDirectory();
  const home = freshDirectory();
  writeConsumer(repo, home);
  const worktree = join(freshDirectory(), 'side');
  git(repo, 'worktree', 'add', '-q', worktree);
  const { report } = audit(worktree, home);
  assert.equal(dirname(report.file), join(repo, '.temp', 'audit-skilly-workflow'));
  assert.ok(basename(report.file).endsWith(`-${basename(repo)}.html`));
});

test('audit-skilly-workflow: synced-rule-edited follows sync merges and uncommitted edits', () => {
  const repo = freshDirectory();
  const home = freshDirectory();
  writeConsumer(repo, home);
  const rule = '.claude/rules/workflow-sign-off.md';
  const edited = () =>
    audit(repo, home).findings.some(({ kind, where }) => kind === 'synced-rule-edited' && where === rule);
  assert.equal(edited(), false);

  writeFileSync(join(repo, rule), '# Sign-off\n\n1. Ship it.\n');
  assert.equal(edited(), true, 'uncommitted edit');

  git(repo, 'checkout', '-q', '--', rule);
  git(repo, 'checkout', '-q', '-b', 'sync');
  writeFileSync(join(repo, rule), '# Sign-off\n\n1. Stage and stop.\n');
  git(repo, 'commit', '-q', '--no-verify', '-am', 'chore(skilly): update skills');
  git(repo, 'checkout', '-q', '-');
  git(repo, 'merge', '-q', '--no-ff', '--no-edit', 'sync');
  assert.equal(edited(), false, 'a merged sync is the newest sync');
});

test('audit-skilly-workflow: parser edge cases stay quiet or load right', () => {
  const repo = freshDirectory();
  const home = freshDirectory();
  git(repo, 'init', '-q');
  const files = {
    // The layout before .skilly/config.json still counts as a consumer.
    '.skilly.json': JSON.stringify({ bundles: ['workflow'] }),
    '.claude/CLAUDE.md': '# Project\n\n- Read [the 100% plan](docs/100%.md).\n',
    'docs/100%.md': '# Plan\n',
    '.claude/rules/workflow-scoped.md': '---\npaths:\n  - src/**\n---\n\n# Scoped\n',
    '.claude/rules/workflow-later.md': '# Later\n\npaths: none, this line is body text\n',
    '.husky/pre-commit':
      '#!/bin/sh\n. "$(dirname -- "$0")/_/husky.sh"\n  # node .claude/hooks/gone.mjs\nsh $HOME/tools/lint.sh\nsh ~/tools/lint.sh\n',
    '.husky/_/husky.sh': 'node missing.mjs\n',
    'shared/crlf/SKILL.md': '---\r\nname: crlf\r\ndescription: >-\r\n  Folded over\r\n\r\n  two lines.\r\n---\r\n',
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  mkdirSync(join(repo, '.agents', 'skills'), { recursive: true });
  symlinkSync(join(repo, 'shared', 'crlf'), join(repo, '.agents', 'skills', 'crlf'));

  const result = audit(repo, home);
  assert.equal(result.consumer, true);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.skills, [{ name: 'crlf', description: 'Folded over two lines.' }]);
  const loaded = Object.fromEntries(result.sources.map(({ path, loaded }) => [path, loaded]));
  assert.equal(loaded['.claude/CLAUDE.md'], 'always');
  assert.equal(loaded['.claude/rules/workflow-scoped.md'], 'on-demand');
  assert.equal(loaded['.claude/rules/workflow-later.md'], 'always');
});

test('audit-skilly-workflow: a clean consumer has no findings, a plain repo is no consumer', () => {
  const repo = freshDirectory();
  const home = freshDirectory();
  execFileSync('git', ['init', '-q'], { cwd: repo });
  assert.deepEqual(audit(repo, home), {
    consumer: false,
    reason: 'no .skilly/config.json: not a skilly consumer, nothing to audit',
  });

  mkdirSync(join(repo, '.skilly'));
  writeFileSync(join(repo, '.skilly', 'config.json'), JSON.stringify({ tier: 'sandbox', bundles: ['workflow'] }));
  const result = audit(repo, home);
  assert.equal(result.consumer, true);
  assert.equal(result.tier, 'sandbox');
  assert.equal(result.gates.verify, null);
  assert.deepEqual(result.findings, []);
});
