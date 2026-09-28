#!/usr/bin/env node
// Wires check-pr.mjs as a PreToolUse hook in the repo's .claude/settings.json.
// Safe to run twice: an entry that already runs the hook is left alone, and
// every other setting is kept.
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMAND = 'node "$CLAUDE_PROJECT_DIR/.claude/skills/gdd/scripts/check-pr.mjs"';
const ENTRY = { matcher: 'Bash|mcp__lean-ctx__ctx_shell', hooks: [{ type: 'command', command: COMMAND }] };

// Returns true when it wrote the hook, false when it was already there.
export function setup(root) {
  const path = join(root, '.claude', 'settings.json');
  const settings = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  const preToolUse = (settings.hooks ??= {}).PreToolUse ?? [];
  if (preToolUse.some((entry) => entry.hooks?.some((hook) => hook.command === COMMAND))) return false;
  settings.hooks.PreToolUse = [...preToolUse, ENTRY];
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2) + '\n');
  return true;
}

// Node loads the main module through its real path; argv[1] keeps the path as typed.
const isMain = () => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (isMain()) {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  console.log(setup(root) ? 'gdd: PR hook added to .claude/settings.json' : 'gdd: PR hook already in place');
}
