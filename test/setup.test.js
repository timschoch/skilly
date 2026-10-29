import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SETUP_BRANCH, setup } from '../engine/lib/setup.js';
import { useFakeGitHub } from './fixtures/fake-github.js';
import { fakeSkills, git, makeClone, makeSnapshot, writeFiles } from './fixtures/sync.js';

// The apply phase on a fixture Consumer, with a fake gh on the PATH
// (ADR-0009, Consequences). The origin is a bare folder, so the setup
// branch is pushed for real; `repo` names it on the fake GitHub.
const REPO = 'owner/consumer';
const CONFIG = { tier: 'tool', bundles: ['hubby'] };

function runSetup(cwd, { release = 'v1.0.0', log = () => {} } = {}) {
  return setup({
    cwd,
    repo: REPO,
    skills: fakeSkills(),
    latestRelease: () => release,
    fetchSnapshot: (tag) => ({ ...makeSnapshot(tag), cleanup: () => {} }),
    log,
  });
}

const show = (origin, path) => git(origin, 'show', `${SETUP_BRANCH}:${path}`);

test('setup on a repo with only .skilly/config.json opens the setup PR and sets the repo settings', () => {
  const github = useFakeGitHub();
  const { cwd, origin } = makeClone(CONFIG);
  const result = runSetup(cwd);

  const [pr] = github.read().prs;
  assert.equal(result.pr.url, pr.url);
  assert.equal(pr.head, SETUP_BRANCH);
  assert.equal(pr.base, 'main');
  assert.equal(pr.title, 'chore(skilly): set up skilly at v1.0.0');
  assert.match(pr.body, /^Sets up skilly at Release v1\.0\.0\./);
  // The first Sync: config pinned to the Release, Engine, Managed files, hooks.
  assert.deepEqual(JSON.parse(show(origin, '.skilly/config.json')), {
    ...CONFIG,
    review: { bots: [] },
    hub: 'v1.0.0',
  });
  assert.match(show(origin, '.skilly/engine/bin/skilly.js'), /engine v1\.0\.0/);
  assert.match(show(origin, '.github/workflows/ci.yml'), /Managed by skilly/);
  assert.match(show(origin, 'lefthook.yml'), /\.skilly\/lefthook\.json/);
  assert.match(show(origin, '.gitignore'), /^\.temp\/$/m);
  assert.equal(git(origin, 'ls-tree', SETUP_BRANCH, '.claude/skills').split(/\s/)[0], '120000');
  // The repo settings module set every setting after the PR.
  const state = github.read();
  assert.equal(state.repo.allow_auto_merge, true);
  assert.equal(state.rulesets.length, 1);
  assert.deepEqual(result.settings.unavailable, []);
  // The person's checkout stays on its branch, untouched.
  assert.equal(git(cwd, 'branch', '--show-current'), 'main');
  assert.equal(git(cwd, 'status', '--porcelain'), '');
});

// #251: GitHub reads only the first 300 files of a push. Past them, a repo
// whose Actions never ran does not see .github/workflows.
test('setup pushes the workflows alone before the rest of the setup commit', () => {
  useFakeGitHub();
  const { cwd, origin } = makeClone(CONFIG);
  git(origin, 'config', 'core.logAllRefUpdates', 'always');
  runSetup(cwd);

  const pushes = git(origin, 'reflog', '--format=%H', SETUP_BRANCH).split('\n').reverse();
  assert.equal(pushes.length, 2);
  assert.equal(git(origin, 'rev-parse', `${pushes[1]}~1`), pushes[0]);
  const first = git(origin, 'diff', '--name-only', 'main', pushes[0]).split('\n');
  assert.ok(first.includes('.github/workflows/ci.yml'));
  assert.ok(first.every((path) => path.startsWith('.github/workflows/')));
  assert.match(git(origin, 'log', '-1', '--format=%s', pushes[0]), /^chore\(skilly\): /);

  // The open Setup PR already had its first push: an update is one push.
  runSetup(cwd, { release: 'v1.1.0' });
  assert.equal(git(origin, 'reflog', '--format=%H', SETUP_BRANCH).split('\n').length, 3);
  assert.equal(git(origin, 'rev-list', '--count', `main..${SETUP_BRANCH}`), '1');
});

test('a second setup run changes nothing', () => {
  const github = useFakeGitHub();
  const { cwd, origin } = makeClone(CONFIG);
  runSetup(cwd);
  const head = git(origin, 'rev-parse', SETUP_BRANCH);
  const before = github.read().calls.length;

  const again = runSetup(cwd);
  const calls = github.read().calls.slice(before);
  assert.equal(git(origin, 'rev-parse', SETUP_BRANCH), head);
  assert.equal(again.pr.pushed, false);
  assert.deepEqual(again.settings.drift, []);
  assert.deepEqual(
    calls.filter((call) => !call.startsWith('GET ')),
    ['pr list'],
  );
});

test('after the setup PR merged, setup opens no PR', () => {
  const github = useFakeGitHub();
  const { cwd, origin } = makeClone(CONFIG);
  runSetup(cwd);
  git(origin, 'update-ref', 'refs/heads/main', `refs/heads/${SETUP_BRANCH}`);
  github.edit((state) => (state.prs[0].state = 'merged'));

  const again = runSetup(cwd);
  assert.equal(again.pr, null);
  assert.equal(github.read().prs.length, 1);
});

test('setup takes the config from the checkout, also before it is committed', () => {
  useFakeGitHub();
  const { cwd, origin } = makeClone(null, { 'README.md': '# app\n' });
  writeFileSync(join(cwd, '.gitignore'), 'node_modules/\n');
  git(cwd, 'add', '.gitignore');
  git(cwd, 'commit', '-q', '-m', 'ignore');
  git(cwd, 'push', '-q', 'origin', 'main');
  writeFiles(cwd, { '.skilly/config.json': JSON.stringify({ tier: 'sandbox', bundles: [], hub: 'v1.2.0' }) });

  runSetup(cwd, { release: 'v9.9.9' });
  assert.equal(JSON.parse(show(origin, '.skilly/config.json')).hub, 'v1.2.0');
  assert.equal(show(origin, '.gitignore'), 'node_modules/\n.temp/');
});

test('setup moves a legacy .skilly.json to .skilly/config.json on the setup branch', () => {
  useFakeGitHub();
  const { cwd, origin } = makeClone(null, { '.skilly.json': JSON.stringify(CONFIG) });
  runSetup(cwd);
  assert.equal(JSON.parse(show(origin, '.skilly/config.json')).tier, 'tool');
  assert.throws(() => show(origin, '.skilly.json'));
});

test('setup without read access to the Hub prints the invite and goes on', () => {
  const github = useFakeGitHub({ hubPermissions: undefined, login: 'other-account' });
  const { cwd } = makeClone(CONFIG);
  const lines = [];
  const result = runSetup(cwd, { log: (line) => lines.push(line) });

  const invite = 'gh api -X PUT repos/timschoch/skilly/collaborators/other-account -f permission=pull';
  assert.equal(result.invite, invite);
  assert.ok(lines.some((line) => line.includes(invite)));
  assert.equal(github.read().prs.length, 1);
});

test('setup with a failed Sync leaves the repo settings alone', () => {
  const github = useFakeGitHub();
  const { cwd } = makeClone(CONFIG);
  assert.throws(() =>
    setup({
      cwd,
      repo: REPO,
      skills: fakeSkills(),
      latestRelease: () => 'v1.0.0',
      fetchSnapshot: () => {
        throw new Error('no such Release');
      },
      log: () => {},
    }),
  );
  assert.equal(github.read().rulesets.length, 0);
});

test('setup without .skilly/config.json stops before any GitHub call', () => {
  const github = useFakeGitHub();
  const { cwd } = makeClone(null, { 'README.md': '# app\n' });
  assert.throws(() => runSetup(cwd), /no \.skilly\/config\.json/);
  assert.deepEqual(github.read().calls, []);
});

test('setup keeps an existing .claude/skills folder by moving it into .agents/skills', () => {
  useFakeGitHub();
  const { cwd, origin } = makeClone(null, {
    '.skilly/config.json': JSON.stringify(CONFIG),
    '.claude/skills/own-skill/SKILL.md': '# own\n',
  });
  runSetup(cwd);
  assert.equal(show(origin, '.agents/skills/own-skill/SKILL.md'), '# own');
  assert.equal(git(origin, 'ls-tree', SETUP_BRANCH, '.claude/skills').split(/\s/)[0], '120000');
});
