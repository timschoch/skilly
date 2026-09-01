import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchName } from '../lib/match.js';
import { planRemovals } from '../lib/remove.js';
import { pickPrivateOwner, sourceRepo } from '../lib/add.js';
import { updateRules } from '../lib/update-rules.js';
import { addFormatterIgnores } from '../lib/formatter-ignores.js';
import { linkSkillsDir } from '../lib/setup.js';
import * as skillyFile from '../lib/skilly-file.js';

const bundlesDir = fileURLToPath(new URL('./fixtures/bundles', import.meta.url));
const freshDir = () => mkdtempSync(join(tmpdir(), 'skilly-test-'));

test('matchName: bundle beats skill, skills resolve to their source, unknown is null', () => {
  assert.deepEqual(matchName('alpha', bundlesDir), { type: 'bundle', name: 'alpha' });
  assert.deepEqual(matchName('c-skill', bundlesDir), { type: 'skill', name: 'c-skill', source: 'owner/two' });
  assert.equal(matchName('nope', bundlesDir), null);
});

test('planRemovals keeps claimed skills and skips names not in the lock', () => {
  const candidates = new Set(['gone', 'claimed', 'never-installed']);
  const claimed = new Set(['claimed']);
  const lock = { gone: {}, claimed: {} };
  assert.deepEqual(planRemovals(candidates, claimed, lock), ['gone']);
});

test('pickPrivateOwner: one foreign private owner passes, two are a hard error', () => {
  const isPrivate = (source) => source.startsWith('priv');
  assert.equal(pickPrivateOwner(['me/a', 'pub/b'], 'me', isPrivate), null);
  assert.equal(pickPrivateOwner(['me/a', 'priv/b'], 'me', isPrivate), 'priv');
  assert.throws(() => pickPrivateOwner(['priv/a', 'priv2/b'], 'me', isPrivate), /one private-owner per consumer/);
});

test('skillyMessage keeps short subjects, moves long name lists to the body', async () => {
  const { skillyMessage } = await import('../lib/commit.js');
  assert.equal(skillyMessage('add', ['workflow']), 'chore(skilly): add workflow');
  const names = ['ai-seo', 'cro', 'integration-nextjs-app-router', 'integration-tanstack-start', 'lead-magnets', 'lemy-write', 'seo-audit', 'skilly-cli', 'tools-and-features-hogql', 'typescript-advanced-types'];
  const long = skillyMessage('add', names);
  const [subject, blank, body] = long.split('\n');
  assert.equal(subject, 'chore(skilly): add 10 skills');
  assert.equal(blank, '');
  assert.equal(body, names.join(', '));
  assert.ok(subject.length <= 72);
});

test('sourceRepo reduces tree URLs to owner/repo and leaves shorthand alone', () => {
  assert.equal(sourceRepo('PostHog/skills'), 'PostHog/skills');
  assert.equal(sourceRepo('https://github.com/PostHog/skills/tree/main/skills/posthog/all'), 'PostHog/skills');
});

test('pickPrivateOwner reads the owner out of a tree-URL source', () => {
  assert.equal(pickPrivateOwner(['https://github.com/priv/deep/tree/main/sub'], 'me', () => true), 'priv');
});

test('addFormatterIgnores creates .prettierignore when missing, appends once', () => {
  const cwd = freshDir();
  addFormatterIgnores(cwd);
  const first = readFileSync(join(cwd, '.prettierignore'), 'utf8');
  assert.match(first, /\.claude\/skills\/\*\*/);
  assert.match(first, /skills-lock\.json/);
  addFormatterIgnores(cwd);
  assert.equal(readFileSync(join(cwd, '.prettierignore'), 'utf8'), first);
});

test('linkSkillsDir symlinks .claude/skills to .agents/skills, migrating existing files', () => {
  const cwd = freshDir();
  const claudeSkills = join(cwd, '.claude', 'skills');
  mkdirSync(join(claudeSkills, 'a-skill'), { recursive: true });
  writeFileSync(join(claudeSkills, 'a-skill', 'SKILL.md'), 'x');
  assert.equal(linkSkillsDir(cwd), true);
  assert.equal(lstatSync(claudeSkills).isSymbolicLink(), true);
  assert.equal(readFileSync(join(cwd, '.agents', 'skills', 'a-skill', 'SKILL.md'), 'utf8'), 'x');
  assert.equal(readFileSync(join(claudeSkills, 'a-skill', 'SKILL.md'), 'utf8'), 'x');
  assert.equal(linkSkillsDir(cwd), false);
});

test('skilly-file: create, add and remove bundles, empty bundles stay legal', () => {
  const cwd = freshDir();
  assert.equal(skillyFile.create(cwd), true);
  assert.deepEqual(skillyFile.read(cwd), { bundles: [] });
  assert.equal(skillyFile.addBundle(cwd, 'alpha'), true);
  assert.equal(skillyFile.addBundle(cwd, 'alpha'), false);
  assert.deepEqual(skillyFile.read(cwd), { bundles: ['alpha'] });
  assert.equal(skillyFile.removeBundle(cwd, 'alpha'), true);
  assert.deepEqual(skillyFile.read(cwd), { bundles: [] });
  assert.match(readFileSync(join(cwd, '.skilly.json'), 'utf8'), /\n$/);
});

test('updateRules wipes {name}-*.md, installs matching rules, leaves the rest', () => {
  const cwd = freshDir();
  const outDir = join(cwd, '.claude', 'rules');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'alpha-stale.md'), 'stale');
  writeFileSync(join(outDir, 'other-rule.md'), 'not mine');

  const skillDir = join(cwd, 'skill-src');
  mkdirSync(join(skillDir, 'rules'), { recursive: true });
  writeFileSync(join(skillDir, 'rules', 'alpha-fresh.md'), 'fresh');
  writeFileSync(join(skillDir, 'rules', 'payload.md'), 'skill-internal, no prefix');

  const installed = updateRules(cwd, 'alpha', skillDir);
  assert.deepEqual(installed, ['alpha-fresh.md']);
  assert.deepEqual(readdirSync(outDir).sort(), ['alpha-fresh.md', 'other-rule.md']);
  assert.equal(existsSync(join(outDir, 'alpha-stale.md')), false);
});

test('updateRules with null source only deletes', () => {
  const cwd = freshDir();
  const outDir = join(cwd, '.claude', 'rules');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'alpha-gone.md'), 'x');
  assert.deepEqual(updateRules(cwd, 'alpha', null), []);
  assert.equal(existsSync(join(outDir, 'alpha-gone.md')), false);
});
