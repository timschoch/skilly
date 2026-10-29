import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { editedPaths } from '../engine/verify/lint-edited-file.mjs';

const SCRIPT = fileURLToPath(new URL('../engine/verify/lint-edited-file.mjs', import.meta.url));

// A repo with fake oxlint and prettier bins: each logs its call; oxlint fails on a file holding "error".
function makeRepo() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'skilly-lint-edit-')));
  mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true });
  const bin = (name, body) => {
    const path = join(root, 'node_modules', '.bin', name);
    writeFileSync(path, `#!/bin/sh\necho "${name} $*" >> "${join(root, 'calls.log')}"\n${body}\n`);
    chmodSync(path, 0o755);
  };
  bin(
    'oxlint',
    'for last; do :; done; if grep -q error "$last"; then echo "x  no-error: found an error in $last"; exit 1; fi',
  );
  bin('prettier', 'exit 0');
  return root;
}

const runHook = (root, toolInput, toolName = 'Write') =>
  spawnSync('node', [SCRIPT], {
    input: JSON.stringify({ cwd: root, tool_name: toolName, tool_input: toolInput }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });

const calls = (root) => {
  try {
    return readFileSync(join(root, 'calls.log'), 'utf8').trim().split('\n');
  } catch {
    return [];
  }
};

test('editedPaths: reads the path of each write tool, and none from a ctx_call read', () => {
  assert.deepEqual(editedPaths('Edit', { file_path: 'a.ts' }), ['a.ts']);
  assert.deepEqual(editedPaths('mcp__lean-ctx__ctx_patch', { path: 'a.ts', ops: [{ path: 'b.ts' }] }), [
    'a.ts',
    'b.ts',
  ]);
  assert.deepEqual(editedPaths('mcp__lean-ctx__ctx_call', { name: 'ctx_edit', arguments: { path: 'c.ts' } }), ['c.ts']);
  assert.deepEqual(editedPaths('mcp__lean-ctx__ctx_call', { name: 'ctx_read', arguments: { path: 'c.ts' } }), []);
});

test('the edit hook fixes and formats a clean file in silence', () => {
  const root = makeRepo();
  writeFileSync(join(root, 'clean.ts'), 'export const a = 1;\n');
  const result = runHook(root, { file_path: join(root, 'clean.ts') });
  assert.equal(result.status, 0);
  assert.equal(result.stdout + result.stderr, '');
  assert.deepEqual(calls(root), [
    `oxlint --fix ${join(root, 'clean.ts')}`,
    `prettier --write --ignore-unknown --log-level warn ${join(root, 'clean.ts')}`,
  ]);
});

test('the edit hook exits 2 with the errors left, so the agent sees them', () => {
  const root = makeRepo();
  writeFileSync(join(root, 'bad.ts'), 'error\n');
  const result = runHook(root, { file_path: 'bad.ts' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /no-error: found an error/);
});

test('the edit hook runs only Prettier on a file oxlint does not lint, and nothing without the bins', () => {
  const root = makeRepo();
  writeFileSync(join(root, 'notes.md'), '# error\n');
  assert.equal(runHook(root, { file_path: 'notes.md' }).status, 0);
  assert.deepEqual(calls(root), [`prettier --write --ignore-unknown --log-level warn ${join(root, 'notes.md')}`]);

  const bare = realpathSync(mkdtempSync(join(tmpdir(), 'skilly-lint-edit-')));
  writeFileSync(join(bare, 'a.ts'), 'error\n');
  assert.equal(runHook(bare, { file_path: 'a.ts' }).status, 0);
});
