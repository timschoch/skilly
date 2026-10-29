import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = fileURLToPath(new URL('../engine', import.meta.url));
const WORKFLOW = JSON.parse(readFileSync(new URL('../bundles/workflow/config.json', import.meta.url), 'utf8'));
const PRE_COMMIT = Object.values(WORKFLOW.hooks.lefthook['pre-commit'].commands);

// A fresh Consumer as the Sync leaves it: the Engine at .skilly/engine, one staged
// file, no lint-staged config, no node_modules.
function makeConsumer() {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'skilly-pre-commit-')));
  const git = (...args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
  git('init', '-q');
  mkdirSync(join(cwd, '.skilly'));
  symlinkSync(ENGINE, join(cwd, '.skilly', 'engine'));
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'consumer', private: true }));
  writeFileSync(join(cwd, 'a.ts'), 'export const a = 1;\n');
  git('add', 'a.ts');
  return cwd;
}

// Runs a lefthook command the way lefthook does: templates filled, run by sh in the repo root.
const runCommand = (cwd, { run }) =>
  spawnSync('sh', ['-c', run.replaceAll('{staged_files}', 'a.ts')], { cwd, encoding: 'utf8' });

test('the workflow Bundle pre-commit passes in a fresh Consumer without a lint-staged config', () => {
  const cwd = makeConsumer();
  for (const command of PRE_COMMIT) {
    const result = runCommand(cwd, command);
    assert.equal(result.status, 0, `${command.run}\n${result.stdout}${result.stderr}`);
  }
});
