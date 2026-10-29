import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sync, engineState, writeEngine } from '../engine/lib/sync.js';
import { run } from '../engine/lib/run.js';
import { fakeSkills, makeCheckout, makeSnapshot } from './fixtures/sync.js';

const readJson = (cwd, path) => JSON.parse(readFileSync(join(cwd, path), 'utf8'));
const exists = (cwd, path) => existsSync(join(cwd, path));

test('a first Sync installs the Bundles, their Router rules and the Engine, and reports it', () => {
  const cwd = makeCheckout({ bundles: ['hubby', 'other'] });
  const skills = fakeSkills();
  const report = sync({ cwd, snapshot: makeSnapshot('v1.0.0'), skills });

  assert.deepEqual(report.release, { before: null, after: 'v1.0.0' });
  assert.deepEqual(report.skills.added, ['hub-skill', 'loose-skill', 'one-skill']);
  assert.deepEqual(report.skills.removed, []);
  // Hub skills come from the Release tag, other sources as they are
  assert.deepEqual(
    skills.calls
      .filter(([verb]) => verb === 'add')
      .map(([, source]) => source)
      .sort(),
    ['owner/one', 'timschoch/skilly#v1.0.0'],
  );
  assert.ok(exists(cwd, '.claude/rules/hubby-rule.md'));
  assert.ok(exists(cwd, '.claude/rules/other-rule.md'));
  assert.equal(readFileSync(join(cwd, '.skilly/engine/bin/skilly.js'), 'utf8'), '// engine v1.0.0\n');
  assert.equal(readJson(cwd, '.skilly/config.json').hub, 'v1.0.0');
  assert.match(readFileSync(join(cwd, '.gitattributes'), 'utf8'), /^\.skilly\/engine\/\*\* linguist-generated=true$/m);
  for (const path of [
    '.claude/rules/hubby-rule.md',
    '.gitattributes',
    '.skilly/config.json',
    '.skilly/engine.json',
    '.skilly/engine/bin/skilly.js',
    'skills-lock.json',
  ]) {
    assert.ok(report.files.includes(path), `${path} in ${report.files}`);
  }
});

// verify reads the Bundle steps from .skilly/engine/bundles/. An include can name
// any Bundle, so the Engine carries every config.json of the Release.
test('the Engine copy carries the config.json of every Bundle in the Release', () => {
  const cwd = makeCheckout({ bundles: ['other'] });
  const snapshot = makeSnapshot();
  sync({ cwd, snapshot, skills: fakeSkills() });
  for (const bundle of ['hubby', 'other']) {
    assert.equal(
      readFileSync(join(cwd, '.skilly/engine/bundles', bundle, 'config.json'), 'utf8'),
      readFileSync(join(snapshot.dir, 'bundles', bundle, 'config.json'), 'utf8'),
    );
  }
  assert.ok(!exists(cwd, '.skilly/engine/bundles/hubby/rules'), 'only config.json, no Router rules');
});

test('the Engine hash is recorded and a hand edit is detected', () => {
  const cwd = makeCheckout({ bundles: ['other'] });
  const report = sync({ cwd, snapshot: makeSnapshot(), skills: fakeSkills() });
  assert.equal(readJson(cwd, '.skilly/engine.json').hash, report.engine.hash);
  assert.deepEqual(engineState(cwd), { recorded: report.engine.hash, actual: report.engine.hash, edited: false });

  writeFileSync(join(cwd, '.skilly/engine/lib/thing.js'), 'export const thing = 2;\n');
  assert.equal(engineState(cwd).edited, true);
  assert.throws(
    () => sync({ cwd, snapshot: makeSnapshot('v1.1.0'), skills: fakeSkills() }),
    /\.skilly\/engine\/ was edited by hand/,
  );
  assert.equal(readJson(cwd, '.skilly/config.json').hub, 'v1.0.0', 'a refused Sync writes nothing');
});

test('a second Sync at the same Release writes no file', () => {
  const cwd = makeCheckout({ bundles: ['hubby', 'other'] });
  sync({ cwd, snapshot: makeSnapshot(), skills: fakeSkills() });
  const report = sync({ cwd, snapshot: makeSnapshot(), skills: fakeSkills() });
  assert.deepEqual(report.files, []);
  assert.deepEqual(report.skills.added, []);
  assert.deepEqual(report.release, { before: 'v1.0.0', after: 'v1.0.0' });
});

test('a new Release moves installed Hub skills to it, and a Sync at the same Release adds nothing', () => {
  const cwd = makeCheckout({ bundles: ['hubby'] });
  const skills = fakeSkills();
  sync({ cwd, snapshot: makeSnapshot('v1.0.0'), skills });
  assert.equal(skills.readLock(cwd)['hub-skill'].ref, 'v1.0.0');
  const report = sync({ cwd, snapshot: makeSnapshot('v1.1.0'), skills });
  assert.equal(skills.readLock(cwd)['hub-skill'].ref, 'v1.1.0');
  assert.deepEqual(report.skills.added, []);
  assert.deepEqual(report.skills.updated, ['hub-skill']);
  const adds = skills.calls.filter(([verb]) => verb === 'add').length;
  sync({ cwd, snapshot: makeSnapshot('v1.1.0'), skills });
  assert.equal(skills.calls.filter(([verb]) => verb === 'add').length, adds);
});

test('a Bundle that leaves the config takes its skills and Router rules with it', () => {
  const cwd = makeCheckout({ bundles: ['hubby', 'other'] });
  sync({ cwd, snapshot: makeSnapshot(), skills: fakeSkills() });
  const config = readJson(cwd, '.skilly/config.json');
  writeFileSync(join(cwd, '.skilly/config.json'), JSON.stringify({ ...config, bundles: ['hubby'] }));

  const report = sync({ cwd, snapshot: makeSnapshot(), skills: fakeSkills() });
  assert.deepEqual(report.skills.removed, ['loose-skill', 'one-skill']);
  assert.ok(!exists(cwd, '.claude/rules/other-rule.md'));
  assert.ok(exists(cwd, '.claude/rules/hubby-rule.md'));
  assert.ok(report.files.includes('.claude/rules/other-rule.md'), 'a deleted file counts as written');
});

test('a new Release replaces the Engine and drops its stale files', () => {
  const cwd = makeCheckout({ bundles: ['other'] });
  sync({ cwd, snapshot: makeSnapshot('v1.0.0'), skills: fakeSkills() });
  const snapshot = makeSnapshot('v1.1.0');
  writeFileSync(join(snapshot.dir, 'engine/lib/thing.js'), 'export const thing = 3;\n');
  const report = sync({ cwd, snapshot, skills: fakeSkills() });

  assert.deepEqual(report.release, { before: 'v1.0.0', after: 'v1.1.0' });
  assert.equal(readFileSync(join(cwd, '.skilly/engine/bin/skilly.js'), 'utf8'), '// engine v1.1.0\n');
  assert.equal(engineState(cwd).edited, false);
});

test('a single skill in the config installs with its own Router rules', () => {
  const cwd = makeCheckout({ skills: ['rules-skill'] });
  const report = sync({ cwd, snapshot: makeSnapshot(), skills: fakeSkills() });
  assert.deepEqual(report.skills.added, ['rules-skill']);
  assert.ok(exists(cwd, '.claude/rules/rules-skill-x.md'));
});

test('a hand-pinned skill from a source no Bundle uses stays', () => {
  const cwd = makeCheckout({ bundles: ['other'] });
  const skills = fakeSkills();
  skills.add(cwd, 'someone/else', ['pinned-skill']);
  const report = sync({ cwd, snapshot: makeSnapshot(), skills });
  assert.deepEqual(report.skills.removed, []);
  assert.ok('pinned-skill' in skills.readLock(cwd));
});

test('a Bundle the Release no longer has leaves the config and is reported', () => {
  const cwd = makeCheckout({ bundles: ['other', 'gone'] });
  const report = sync({ cwd, snapshot: makeSnapshot(), skills: fakeSkills() });
  assert.deepEqual(report.bundles.removed, ['gone']);
  assert.deepEqual(readJson(cwd, '.skilly/config.json').bundles, ['other']);
});

test('a Sync moves a husky Consumer to lefthook, writes the skilly hook entries and reports them', () => {
  const cwd = makeCheckout({ bundles: ['hubby'] });
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { prepare: 'husky' } }));
  mkdirSync(join(cwd, '.husky'));
  writeFileSync(join(cwd, '.husky/pre-push'), 'node .agents/skills/verify/scripts/verify.mjs push\n');
  const refreshed = [];
  const report = sync({
    cwd,
    snapshot: makeSnapshot(),
    skills: fakeSkills(),
    refreshLock: (dir) => refreshed.push(dir),
  });

  assert.ok(!exists(cwd, '.husky'));
  assert.equal(readFileSync(join(cwd, 'lefthook.yml'), 'utf8'), 'extends:\n  - .skilly/lefthook.json\n');
  assert.ok(readJson(cwd, '.skilly/lefthook.json')['pre-push'].commands['skilly-verify']);
  assert.equal(readJson(cwd, '.claude/settings.json').hooks.PreToolUse.length, 1);
  assert.deepEqual(refreshed, [cwd]);
  for (const path of [
    '.husky/pre-push',
    '.claude/settings.json',
    '.skilly/lefthook.json',
    'lefthook.yml',
    'package.json',
  ]) {
    assert.ok(report.files.includes(path), `${path} in ${report.files}`);
  }
});

test('the Engine copy skips the Hub, which runs engine/ itself', () => {
  const cwd = makeCheckout({});
  run('git', ['init', '-q'], { cwd });
  run('git', ['remote', 'add', 'origin', 'https://timschoch@github.com/timschoch/skilly.git'], { cwd });
  assert.equal(writeEngine(cwd, join(makeSnapshot().dir, 'engine')), null);
  assert.ok(!exists(cwd, '.skilly/engine'));
});

const MANAGED_BY_TIER = {
  sandbox: ['.github/workflows/ci.yml'],
  tool: ['.github/dependabot.yml', '.github/workflows/ai-review.yml', '.github/workflows/ci.yml'],
  product: [
    '.github/dependabot.yml',
    '.github/workflows/ai-review.yml',
    '.github/workflows/ci.yml',
    '.github/workflows/nightly.yml',
    '.github/workflows/release.yml',
  ],
};

test('a Sync writes the Managed files of each tier and lists them in the Sync report', () => {
  for (const [tier, paths] of Object.entries(MANAGED_BY_TIER)) {
    const cwd = makeCheckout({ tier });
    const report = sync({ cwd, snapshot: makeSnapshot(), skills: fakeSkills() });
    const written = report.files.filter((path) => path.startsWith('.github/'));
    assert.deepEqual(written, paths, tier);
    for (const path of paths) assert.ok(exists(cwd, path), `${tier}: ${path}`);
  }
});

test('a lower tier deletes the Managed files it no longer gets, and keeps a file the Sync did not write', () => {
  const cwd = makeCheckout({ tier: 'product' });
  sync({ cwd, snapshot: makeSnapshot(), skills: fakeSkills() });
  writeFileSync(join(cwd, '.github/dependabot.yml'), 'version: 2\n');
  writeFileSync(
    join(cwd, '.skilly/config.json'),
    JSON.stringify({ ...readJson(cwd, '.skilly/config.json'), tier: 'sandbox' }),
  );

  const report = sync({ cwd, snapshot: makeSnapshot(), skills: fakeSkills() });
  assert.ok(!exists(cwd, '.github/workflows/nightly.yml'));
  assert.ok(!exists(cwd, '.github/workflows/ai-review.yml'));
  assert.ok(!exists(cwd, '.github/workflows/release.yml'));
  assert.equal(readFileSync(join(cwd, '.github/dependabot.yml'), 'utf8'), 'version: 2\n');
  assert.deepEqual(
    report.files.filter((path) => path.startsWith('.github/')),
    ['.github/workflows/ai-review.yml', '.github/workflows/nightly.yml', '.github/workflows/release.yml'],
  );
});

test('the Managed files skip the Hub, which keeps its own workflows', () => {
  const cwd = makeCheckout({ tier: 'product' });
  run('git', ['init', '-q'], { cwd });
  run('git', ['remote', 'add', 'origin', 'https://timschoch@github.com/timschoch/skilly.git'], { cwd });
  sync({ cwd, snapshot: makeSnapshot(), skills: fakeSkills() });
  assert.ok(!exists(cwd, '.github'));
});

test('the Engine copy adds its .gitattributes line once and keeps the rest', () => {
  const cwd = makeCheckout({});
  writeFileSync(join(cwd, '.gitattributes'), '*.png binary');
  const engine = join(makeSnapshot().dir, 'engine');
  writeEngine(cwd, engine);
  writeEngine(cwd, engine);
  assert.equal(
    readFileSync(join(cwd, '.gitattributes'), 'utf8'),
    '*.png binary\n.skilly/engine/** linguist-generated=true\n',
  );
});
