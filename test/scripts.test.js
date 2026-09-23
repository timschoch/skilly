import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  lstatSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchName } from '../lib/match.js';
import { planRemovals } from '../lib/remove.js';
import { pickPrivateOwner } from '../lib/add.js';
import { sourceRepo } from '../lib/resolve.js';
import { updateRules } from '../lib/update-rules.js';
import { addFormatterIgnores, biomeMajor } from '../lib/formatter-ignores.js';
import { linkSkillsDir } from '../lib/setup.js';
import {
  CALLER_WORKFLOW_PATH,
  healCallerSecrets,
  scaffoldCallerWorkflow,
  setPrivateOwner,
} from '../lib/caller-workflow.js';
import * as skillyFile from '../lib/skilly-file.js';

const bundlesDir = fileURLToPath(new URL('./fixtures/bundles', import.meta.url));
const freshDir = () => mkdtempSync(join(tmpdir(), 'skilly-test-'));

// A git hook (husky pre-commit → npm test) exports GIT_DIR / GIT_INDEX_FILE
// to its children. Inherited here, `git -C <tmp>` would act on the repo being
// committed instead of the temp repos below — and commit fixtures onto it.
for (const key of Object.keys(process.env)) if (key.startsWith('GIT_')) delete process.env[key];

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

test('caller workflow names the App secrets; old inherit callers heal, private-owner lands once', () => {
  const named = /^ {4}secrets:\n {6}SKILLY_APP_ID: \$\{\{ secrets\.SKILLY_APP_ID \}\}\n {6}SKILLY_APP_PRIVATE_KEY: /m;
  const fresh = freshDir();
  assert.equal(scaffoldCallerWorkflow(fresh), true);
  const written = readFileSync(join(fresh, CALLER_WORKFLOW_PATH), 'utf8');
  assert.match(written, named);
  assert.doesNotMatch(written, /inherit/);
  assert.equal(healCallerSecrets(fresh), false);

  const old = freshDir();
  mkdirSync(join(old, '.github', 'workflows'), { recursive: true });
  writeFileSync(
    join(old, CALLER_WORKFLOW_PATH),
    'jobs:\n  skilly:\n    uses: timschoch/skilly/.github/workflows/sync.yml@main\n    secrets: inherit\n    with:\n      private-owner: timschoch\n',
  );
  assert.equal(setPrivateOwner(old, 'other'), true);
  const healed = readFileSync(join(old, CALLER_WORKFLOW_PATH), 'utf8');
  assert.match(healed, named);
  assert.doesNotMatch(healed, /inherit/);
  assert.equal(healed.match(/private-owner:/g).length, 1);
  assert.match(healed, /private-owner: other/);

  assert.equal(setPrivateOwner(fresh, 'priv'), true);
  assert.match(
    readFileSync(join(fresh, CALLER_WORKFLOW_PATH), 'utf8'),
    /@main\n {4}with:\n {6}private-owner: priv\n {4}secrets:/,
  );
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
  const names = [
    'ai-seo',
    'cro',
    'integration-nextjs-app-router',
    'integration-tanstack-start',
    'lead-magnets',
    'lemy-write',
    'seo-audit',
    'skilly-cli',
    'tools-and-features-hogql',
    'typescript-advanced-types',
  ];
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
  assert.equal(
    pickPrivateOwner(['https://github.com/priv/deep/tree/main/sub'], 'me', () => true),
    'priv',
  );
});

test('addFormatterIgnores creates .prettierignore when missing, appends once', () => {
  const cwd = freshDir();
  addFormatterIgnores(cwd);
  const first = readFileSync(join(cwd, '.prettierignore'), 'utf8');
  assert.match(first, /^\.claude\/skills$/m);
  assert.match(first, /skills-lock\.json/);
  addFormatterIgnores(cwd);
  assert.equal(readFileSync(join(cwd, '.prettierignore'), 'utf8'), first);
});

const biomeConfig = (cwd) => JSON.parse(readFileSync(join(cwd, 'biome.json'), 'utf8'));

test('addFormatterIgnores writes a bare folder for Biome 2.x and the glob for Biome 1.x', () => {
  const two = freshDir();
  writeFileSync(join(two, 'biome.json'), JSON.stringify({ files: { includes: ['**'] } }));
  addFormatterIgnores(two);
  // A trailing /** here is what Biome's own useBiomeIgnoreFolder warns about.
  assert.deepEqual(biomeConfig(two).files.includes, [
    '**',
    '!skills-lock.json',
    '!.skilly',
    '!.claude/rules',
    '!.claude/skills',
    '!.agents',
  ]);

  const one = freshDir();
  writeFileSync(join(one, 'biome.json'), JSON.stringify({ files: { ignore: [] } }));
  addFormatterIgnores(one);
  assert.deepEqual(biomeConfig(one).files.ignore, [
    'skills-lock.json',
    '.skilly/**',
    '.claude/rules/**',
    '.claude/skills/**',
    '.agents/**',
  ]);
});

test('biomeMajor reads the manifest, then the $schema, and only then the config shape', () => {
  const cwd = freshDir();
  assert.equal(biomeMajor(cwd, { files: { ignore: [] } }), 1);
  assert.equal(biomeMajor(cwd, { $schema: 'https://biomejs.dev/schemas/2.2.0/schema.json', files: { ignore: [] } }), 2);
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ devDependencies: { '@biomejs/biome': '^1.9.4' } }));
  assert.equal(biomeMajor(cwd, { $schema: 'https://biomejs.dev/schemas/2.2.0/schema.json' }), 1);
});

test('addFormatterIgnores keys off the installed Biome, not off the shape it finds', () => {
  // A 2.x config that never declared files.includes reads as 1.x by shape alone.
  const cwd = freshDir();
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ devDependencies: { '@biomejs/biome': '^2.2.0' } }));
  writeFileSync(join(cwd, 'biome.json'), JSON.stringify({ linter: { enabled: true } }));
  addFormatterIgnores(cwd);
  assert.deepEqual(biomeConfig(cwd).files.includes, [
    '**',
    '!skills-lock.json',
    '!.skilly',
    '!.claude/rules',
    '!.claude/skills',
    '!.agents',
  ]);
});

test('addFormatterIgnores swaps the form an older skilly wrote instead of adding a second entry', () => {
  const cwd = freshDir();
  writeFileSync(
    join(cwd, 'biome.json'),
    JSON.stringify({
      files: {
        includes: ['**', '!skills-lock.json', '!.claude/rules/**', '!vendor'],
        // Written by an older skilly that mistook this 2.x config for a 1.x one.
        ignore: ['.agents/**'],
      },
    }),
  );
  writeFileSync(
    join(cwd, '.prettierignore'),
    '# skilly-owned files\nskills-lock.json\n.claude/rules/**\n.claude/skills/**\n.agents/**\n',
  );
  addFormatterIgnores(cwd);

  const config = biomeConfig(cwd);
  assert.deepEqual(config.files.includes, [
    '**',
    '!skills-lock.json',
    '!.claude/rules',
    '!vendor',
    '!.skilly',
    '!.claude/skills',
    '!.agents',
  ]);
  assert.equal('ignore' in config.files, false, 'Biome 2 does not know files.ignore');

  const prettier = readFileSync(join(cwd, '.prettierignore'), 'utf8');
  assert.equal(
    prettier,
    '# skilly-owned files\nskills-lock.json\n.claude/rules\n.claude/skills\n.agents\n\n# skilly-owned files\n.skilly\n',
  );
  addFormatterIgnores(cwd);
  assert.equal(readFileSync(join(cwd, '.prettierignore'), 'utf8'), prettier);
  assert.deepEqual(biomeConfig(cwd).files.includes, config.files.includes);
});

test('addFormatterIgnores keeps a files.ignore list the consumer owns', () => {
  const cwd = freshDir();
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ devDependencies: { '@biomejs/biome': '2.2.0' } }));
  writeFileSync(join(cwd, 'biome.json'), JSON.stringify({ files: { includes: ['**'], ignore: ['dist/**'] } }));
  addFormatterIgnores(cwd);
  assert.deepEqual(biomeConfig(cwd).files.ignore, ['dist/**']);
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

test('linkSkillsDir drops per-skill symlinks into .agents/skills, refuses to clobber real files', () => {
  const cwd = freshDir();
  const claudeSkills = join(cwd, '.claude', 'skills');
  const agentsSkills = join(cwd, '.agents', 'skills');
  mkdirSync(join(agentsSkills, 'a-skill'), { recursive: true });
  writeFileSync(join(agentsSkills, 'a-skill', 'SKILL.md'), 'x');
  mkdirSync(claudeSkills, { recursive: true });
  symlinkSync(join('..', '..', '.agents', 'skills', 'a-skill'), join(claudeSkills, 'a-skill'));
  assert.equal(linkSkillsDir(cwd), true);
  assert.equal(lstatSync(claudeSkills).isSymbolicLink(), true);
  assert.equal(readFileSync(join(claudeSkills, 'a-skill', 'SKILL.md'), 'utf8'), 'x');

  const clash = freshDir();
  mkdirSync(join(clash, '.agents', 'skills', 'b-skill'), { recursive: true });
  mkdirSync(join(clash, '.claude', 'skills', 'b-skill'), { recursive: true });
  assert.throws(() => linkSkillsDir(clash), /both exist/);
  assert.equal(existsSync(join(clash, '.claude', 'skills', 'b-skill')), true);
});

const configPath = (cwd) => join(cwd, '.skilly', 'config.json');
const sandbox = (bundles) => ({ tier: 'sandbox', bundles, review: { bots: [] } });

test('skilly-file: create, add and remove bundles, empty bundles stay legal', () => {
  const cwd = freshDir();
  assert.equal(skillyFile.create(cwd), true);
  assert.deepEqual(skillyFile.read(cwd), sandbox([]));
  assert.equal(skillyFile.addBundle(cwd, 'alpha'), true);
  assert.equal(skillyFile.addBundle(cwd, 'alpha'), false);
  assert.deepEqual(skillyFile.read(cwd), sandbox(['alpha']));
  assert.equal(skillyFile.removeBundle(cwd, 'alpha'), true);
  assert.deepEqual(skillyFile.read(cwd), sandbox([]));
  assert.match(readFileSync(configPath(cwd), 'utf8'), /\n$/);
});

test('skilly-file: create defaults the tier to sandbox', () => {
  const cwd = freshDir();
  skillyFile.create(cwd);
  assert.deepEqual(JSON.parse(readFileSync(configPath(cwd), 'utf8')), {
    tier: 'sandbox',
    bundles: [],
    review: { bots: [] },
  });
});

test('skilly-file: migrate moves .skilly.json into .skilly/config.json and removes it', () => {
  const cwd = freshDir();
  writeFileSync(join(cwd, '.skilly.json'), JSON.stringify({ bundles: ['alpha'] }));
  assert.equal(skillyFile.migrate(cwd), true);
  assert.equal(existsSync(join(cwd, '.skilly.json')), false);
  assert.deepEqual(skillyFile.read(cwd), sandbox(['alpha']));
  assert.equal(skillyFile.migrate(cwd), false);
});

test('skilly-file: keys another skill owns survive a bundle change', () => {
  const cwd = freshDir();
  skillyFile.create(cwd);
  const data = skillyFile.read(cwd);
  skillyFile.write(cwd, { ...data, verify: { stages: ['commit'] } });
  skillyFile.addBundle(cwd, 'alpha');
  assert.deepEqual(skillyFile.read(cwd).verify, { stages: ['commit'] });
});

test('skilly-file: setTier takes the three tier names and nothing else', () => {
  const cwd = freshDir();
  skillyFile.create(cwd);
  assert.equal(skillyFile.setTier(cwd, 'product'), true);
  assert.equal(skillyFile.read(cwd).tier, 'product');
  assert.throws(() => skillyFile.setTier(cwd, 'prod'), /unknown tier "prod"/);
});

test('updateRules wipes {name}-*.md, installs matching rules, leaves the rest', () => {
  const cwd = freshDir();
  const outDir = join(cwd, '.claude', 'rules');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'alpha-stale.md'), 'stale');
  writeFileSync(join(outDir, 'alpha-fresh.local.md'), 'consumer overlay, survives sync');
  writeFileSync(join(outDir, 'other-rule.md'), 'not mine');

  const skillDir = join(cwd, 'skill-src');
  mkdirSync(join(skillDir, 'rules'), { recursive: true });
  writeFileSync(join(skillDir, 'rules', 'alpha-fresh.md'), 'fresh');
  writeFileSync(join(skillDir, 'rules', 'payload.md'), 'skill-internal, no prefix');

  const installed = updateRules(cwd, 'alpha', skillDir);
  assert.deepEqual(installed, ['alpha-fresh.md']);
  assert.deepEqual(readdirSync(outDir).sort(), ['alpha-fresh.local.md', 'alpha-fresh.md', 'other-rule.md']);
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

test('commit with push:false only commits; the next default commit pushes the backlog', async () => {
  const { commit } = await import('../lib/commit.js');
  const { run } = await import('../lib/run.js');

  const bare = freshDir();
  run('git', ['init', '--bare', '--initial-branch=main', bare]);
  const repo = freshDir();
  run('git', ['init', '--initial-branch=main', repo]);
  run('git', ['-C', repo, 'config', 'user.name', 'test']);
  run('git', ['-C', repo, 'config', 'user.email', 'test@example.com']);
  writeFileSync(join(repo, 'seed'), '0');
  run('git', ['-C', repo, 'add', '-A'], { cwd: repo });
  run('git', ['-C', repo, 'commit', '--no-verify', '-m', 'chore: seed']);
  run('git', ['-C', repo, 'remote', 'add', 'origin', bare]);
  run('git', ['-C', repo, 'push', '-u', 'origin', 'main']);

  // deferred verb commit: lands locally, origin stays behind
  writeFileSync(join(repo, 'a'), '1');
  assert.equal(commit(repo, 'chore(skilly): remove test-a', { push: false }), null);
  assert.notEqual(run('git', ['-C', repo, 'rev-parse', 'HEAD']), run('git', ['-C', bare, 'rev-parse', 'main']));

  // final commit on a CLEAN tree still pushes the backlog (gh stubbed out)
  const binDir = join(freshDir(), 'bin');
  mkdirSync(binDir);
  writeFileSync(join(binDir, 'gh'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const oldPath = process.env.PATH;
  process.env.PATH = `${binDir}:${oldPath}`;
  try {
    commit(repo, 'chore(skilly): update skills');
  } finally {
    process.env.PATH = oldPath;
  }
  assert.equal(run('git', ['-C', repo, 'rev-parse', 'HEAD']), run('git', ['-C', bare, 'rev-parse', 'main']));
});

test('checkAgentsLock flags unlocked dirs and orphan pins, passes on 1:1', async () => {
  const { checkAgentsLock } = await import('../scripts/check-agents-lock.mjs');
  const cwd = freshDir();
  mkdirSync(join(cwd, '.agents', 'skills', 'locked'), { recursive: true });
  mkdirSync(join(cwd, '.agents', 'skills', 'stray'), { recursive: true });
  writeFileSync(join(cwd, 'skills-lock.json'), JSON.stringify({ skills: { locked: {}, ghost: {} } }));
  assert.deepEqual(checkAgentsLock(cwd), { dirs: 2, pins: 2, unlocked: ['stray'], orphans: ['ghost'] });
  writeFileSync(join(cwd, 'skills-lock.json'), JSON.stringify({ skills: { locked: {}, stray: {} } }));
  assert.deepEqual(checkAgentsLock(cwd), { dirs: 2, pins: 2, unlocked: [], orphans: [] });
});

test('check-branch-name: Conventional Branch passes, agent names fail, trunk, detached HEAD and bots pass', async () => {
  const { spawnSync } = await import('node:child_process');
  const { run } = await import('../lib/run.js');
  const script = fileURLToPath(
    new URL('../bundles/setup-project/skills/setup-repo/scripts/check-branch-name.mjs', import.meta.url),
  );
  const repo = freshDir();
  run('git', ['init', '--initial-branch=main', repo]);
  run('git', ['-C', repo, 'config', 'user.name', 'test']);
  run('git', ['-C', repo, 'config', 'user.email', 'test@example.com']);
  run('git', ['-C', repo, 'commit', '--allow-empty', '--no-verify', '-m', 'chore: seed']);
  const check = (branch, env = {}) => {
    if (branch) run('git', ['-C', repo, 'switch', '-C', branch]);
    const { GITHUB_HEAD_REF, ...rest } = process.env;
    return spawnSync(process.execPath, [script], { cwd: repo, encoding: 'utf8', env: { ...rest, ...env } });
  };

  for (const ok of ['feat/add-login', 'fix/issue-42', 'release/1.2.0', 'chore/skilly-update', 'main']) {
    assert.equal(check(ok).status, 0, ok);
  }
  const bad = check('t3code/4075C2f1');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /Invalid branch name: "t3code\/4075C2f1"/);
  assert.match(bad.stderr, /not the tool or agent/);
  assert.match(bad.stderr, /git branch -m <type>\/<description>/);
  for (const no of ['feature/x', 'feat/Add-Login', 'feat/a--b', 'wip']) assert.equal(check(no).status, 1, no);

  run('git', ['-C', repo, 'switch', '--detach']);
  assert.equal(check(null).status, 0, 'detached HEAD, no PR');
  assert.equal(check(null, { GITHUB_HEAD_REF: 'claude/fix-thing' }).status, 1, 'PR head read in CI');
  assert.equal(check(null, { GITHUB_HEAD_REF: 'fix/thing' }).status, 0);
  for (const bot of ['dependabot/npm_and_yarn/undici-5.28.5', 'release-please--branches--main', 'renovate/next-15.x']) {
    assert.equal(check(null, { GITHUB_HEAD_REF: bot }).status, 0, bot);
  }
});

// setup-repo wires the hook at .claude/skills/…, a symlink to .agents/skills.
// Node loads the main module through the real path; the is-main check must still fire.
test('inject-writing-rules runs when invoked through a symlinked skills dir', async () => {
  const { spawnSync } = await import('node:child_process');
  const realSkill = fileURLToPath(new URL('../bundles/workflow/skills/writing-rules', import.meta.url));
  const link = join(freshDir(), 'skills');
  symlinkSync(realSkill, link);
  const event = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'README.md' } });
  const { stdout, status } = spawnSync(process.execPath, [join(link, 'scripts', 'inject-writing-rules.mjs')], {
    input: event,
    encoding: 'utf8',
  });
  assert.equal(status, 0);
  assert.match(stdout, /"additionalContext":"Your writing rules for `README\.md`/);
});
