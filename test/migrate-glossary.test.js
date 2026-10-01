import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateGlossary } from '../lib/migrate-glossary.js';
import { run } from '../lib/run.js';

// A git hook exports GIT_DIR to its children; inherited here, git would act on
// the repo being committed instead of the temp repos below.
for (const key of Object.keys(process.env)) if (key.startsWith('GIT_')) delete process.env[key];

// A consumer repo with the given files tracked.
const consumerWith = (files) => {
  const root = mkdtempSync(join(tmpdir(), 'skilly-glossary-'));
  run('git', ['init', '--initial-branch=main', root]);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  run('git', ['add', '-A'], { cwd: root });
  return root;
};
const textOf = (root, path) => readFileSync(join(root, path), 'utf8');

test('migrateGlossary moves the root glossary, fixes the pointer files, lists the rest', () => {
  const root = consumerWith({
    'CONTEXT.md': '# Shop\n',
    'CLAUDE.md': 'Single-context: `CONTEXT.md` at the repo root.\n',
    'docs/agents/domain.md': '- `CONTEXT.md`, or\n- `CONTEXT-MAP.md` if it exists\n',
    'docs/adr/0001-terms.md': 'Terms live in CONTEXT.md.\n',
    'docs/MY-CONTEXT.md': 'not a glossary\n',
    '.agents/skills/naming/SKILL.md': 'The word comes from `CONTEXT.md`.\n',
  });

  const { moved, mentions } = migrateGlossary(root);
  assert.deepEqual(moved, [{ from: 'CONTEXT.md', to: 'GLOSSARY.md' }]);
  assert.equal(textOf(root, 'GLOSSARY.md'), '# Shop\n');
  assert.equal(existsSync(join(root, 'CONTEXT.md')), false);
  assert.equal(textOf(root, 'CLAUDE.md'), 'Single-context: `GLOSSARY.md` at the repo root.\n');
  assert.equal(textOf(root, 'docs/agents/domain.md'), '- `GLOSSARY.md`, or\n- `GLOSSARY-MAP.md` if it exists\n');

  // a file skilly does not own keeps its text and lands in the Sync PR body
  assert.deepEqual(mentions, ['docs/adr/0001-terms.md']);
  assert.equal(textOf(root, 'docs/adr/0001-terms.md'), 'Terms live in CONTEXT.md.\n');
  assert.equal(existsSync(join(root, 'docs', 'MY-CONTEXT.md')), true);
  assert.match(textOf(root, '.agents/skills/naming/SKILL.md'), /CONTEXT\.md/);

  run('git', ['add', '-A'], { cwd: root });
  assert.deepEqual(migrateGlossary(root), { moved: [], mentions: [] }, 'a second run finds nothing');
});

test('migrateGlossary moves a map and each glossary it links to', () => {
  const root = consumerWith({
    'CONTEXT-MAP.md': '- [Billing](./src/billing/CONTEXT.md)\n',
    'src/billing/CONTEXT.md': '# Billing\n',
  });

  const { moved } = migrateGlossary(root);
  assert.deepEqual(moved, [
    { from: 'CONTEXT-MAP.md', to: 'GLOSSARY-MAP.md' },
    { from: 'src/billing/CONTEXT.md', to: 'src/billing/GLOSSARY.md' },
  ]);
  assert.equal(textOf(root, 'GLOSSARY-MAP.md'), '- [Billing](./src/billing/GLOSSARY.md)\n');
});

test('migrateGlossary leaves a consumer that already wrote GLOSSARY.md alone', () => {
  const root = consumerWith({
    'CONTEXT.md': 'old\n',
    'GLOSSARY.md': 'new\n',
    'CLAUDE.md': 'See `CONTEXT.md`.\n',
  });

  assert.deepEqual(migrateGlossary(root), { moved: [], mentions: [] });
  assert.equal(textOf(root, 'GLOSSARY.md'), 'new\n');
  assert.equal(textOf(root, 'CLAUDE.md'), 'See `CONTEXT.md`.\n');
});

test('migrateGlossary does nothing outside a git repo', () => {
  const root = mkdtempSync(join(tmpdir(), 'skilly-glossary-'));
  writeFileSync(join(root, 'CONTEXT.md'), '# Shop\n');
  assert.deepEqual(migrateGlossary(root), { moved: [], mentions: [] });
});

test('render-pr-body lists the moved glossary and the files a person must fix', () => {
  const report = join(mkdtempSync(join(tmpdir(), 'skilly-glossary-')), 'report.json');
  const glossary = { moved: [{ from: 'CONTEXT.md', to: 'GLOSSARY.md' }], mentions: ['docs/adr/0001-terms.md'] };
  writeFileSync(report, JSON.stringify({ removed: [], added: [], updated: ['naming'], glossary }));
  const script = fileURLToPath(new URL('../scripts/render-pr-body.mjs', import.meta.url));
  const { stdout } = spawnSync(process.execPath, [script, report], { encoding: 'utf8' });
  assert.match(stdout, /## Moved\n- `CONTEXT\.md` → `GLOSSARY\.md`\n/);
  assert.match(stdout, /Fix them by hand:\n- `docs\/adr\/0001-terms\.md`\n/);
});
