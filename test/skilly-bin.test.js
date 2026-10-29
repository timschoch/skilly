import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The npx CLI (`npx github:timschoch/skilly <verb>`) hands add, remove and
// sync to the Engine CLI (ADR-0008 decisions 11 and 16).
const BIN = fileURLToPath(new URL('../bin/skilly.js', import.meta.url));

// A fake gh on the PATH that prints its arguments and fails, so no call leaves the machine.
function pathWithFailingGh() {
  const dir = mkdtempSync(join(tmpdir(), 'skilly-bin-gh-'));
  writeFileSync(
    join(dir, 'gh'),
    `#!${process.execPath}\nprocess.stderr.write('gh ' + process.argv.slice(2).join(' '));\nprocess.exit(1);\n`,
  );
  chmodSync(join(dir, 'gh'), 0o755);
  return `${dir}:${process.env.PATH}`;
}

const runBin = (...args) =>
  spawnSync(process.execPath, [BIN, ...args], {
    cwd: mkdtempSync(join(tmpdir(), 'skilly-bin-')),
    encoding: 'utf8',
    env: { ...process.env, PATH: pathWithFailingGh() },
  });

test('skilly sync runs the Engine sync: it asks gh for the newest Release', () => {
  const { status, stdout, stderr } = runBin('sync');
  assert.equal(status, 1);
  assert.match(stderr, /gh release view --repo timschoch\/skilly/);
  assert.doesNotMatch(stdout, /usage:/);
});

for (const verb of ['add', 'remove']) {
  test(`skilly ${verb} runs the Engine ${verb}`, () => {
    const { status, stderr } = runBin(verb);
    assert.equal(status, 1);
    assert.match(stderr, new RegExp(`usage: node \\.skilly/engine/bin/skilly\\.js ${verb} <bundle-or-skill\\.\\.\\.>`));
  });
}

test('skilly update still runs the old update for the old sync.yml job', () => {
  const { status, stderr } = runBin('update', '--headless');
  assert.equal(status, 1);
  assert.match(stderr, /no skills-lock\.json/);
});

test('the usage names sync', () => {
  const { status, stdout } = runBin();
  assert.equal(status, 0);
  assert.match(stdout, /skilly sync /);
});
