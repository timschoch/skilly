import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkNaming } from '../bundles/workflow/rules/naming.mjs';

const rulesDir = fileURLToPath(new URL('../bundles/workflow/rules/', import.meta.url));
const namingScript = join(rulesDir, 'naming.mjs');
const namingShell = join(rulesDir, 'naming.sh');

// A git hook (husky pre-commit → npm test) exports GIT_DIR / GIT_INDEX_FILE to
// its children; inherited, `git -C <tmp>` would act on the repo being committed.
for (const key of Object.keys(process.env)) if (key.startsWith('GIT_')) delete process.env[key];

// Writes files into a fresh root and returns the check result for them.
const check = (files, allow) => {
  const root = mkdtempSync(join(tmpdir(), 'skilly-naming-'));
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), source);
  }
  return { root, ...checkNaming({ root, files: Object.keys(files), allow }) };
};

const rules = (result) => result.failures.map((finding) => finding.rule).sort();

const COMPLIANT = `export interface UserProfile {
  kind: 'admin' | 'member';
}

export function renderProfile(profile: UserProfile): string {
  const label = profile.kind;
  return label;
}
`;

test('a compliant file produces nothing', () => {
  const result = check({ 'src/user-profile.ts': COMPLIANT });
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.warnings, []);
});

test('file-case flags the file stem and every directory segment', () => {
  const bad = check({ 'src/UserStuff/UserProfile.ts': COMPLIANT });
  assert.deepEqual(rules(bad), ['file-case', 'file-case']);
  assert.equal(bad.failures[0].suggestion, 'user-stuff');
  assert.equal(bad.failures[1].suggestion, 'user-profile');
  assert.equal(bad.failures[1].line, 1);

  const ok = check({
    'app/(marketing)/[slug]/_private/@modal/[...rest]/route.test.ts': 'export const handler = () => null;\n',
  });
  assert.deepEqual(ok.failures, []);
});

test('short-word flags single letters and abbreviations, in bindings and params', () => {
  const result = check({
    'a.ts': `const opts = { a: 1 };
function f(e) {
  return e;
}
const run = (value, idx) => value + idx;
try {
  run(1, 2);
} catch (err) {
  const { msg: m } = err;
}
`,
  });
  const found = result.failures.map((finding) => `${finding.rule}:${finding.line}`);
  assert.deepEqual(found, [
    'short-word:1',
    'short-word:2',
    'short-word:2',
    'short-word:5',
    'short-word:8',
    'short-word:9',
  ]);
  assert.equal(result.failures[0].suggestion, 'options');
  assert.equal(result.failures[3].suggestion, 'index');
});

test('short-word ignores comments, string contents and the unused-marker underscore', () => {
  const result = check({
    'a.ts': `// const opts = 1;
/* function f(e) {} */
const label = 'const err = 1';
const _ = label;
`,
  });
  assert.deepEqual(result.failures, []);
});

test('noise-word flags filler suffixes on declared names', () => {
  const result = check({
    'a.ts': `const userData = 1;
interface OrderInfo {
  kind: 'a';
}
class PaymentManager {}
type TokenList = string[];
function csvHelper() {}
`,
  });
  assert.deepEqual(rules(result), ['noise-word', 'noise-word', 'noise-word', 'noise-word', 'noise-word']);
  assert.equal(check({ 'a.ts': 'const items = [];\nconst data = 1;\n' }).failures.length, 0);
});

test('enum fires in TypeScript only', () => {
  assert.deepEqual(rules(check({ 'a.ts': 'enum Color {}\nconst enum Size {}\n' })), ['enum', 'enum']);
  assert.deepEqual(check({ 'a.js': 'const enumerate = 1;\n' }).failures, []);
});

test('type-prefix flags IFoo and TFoo but not Item or Table', () => {
  assert.deepEqual(rules(check({ 'a.ts': 'interface IUser {}\ntype TOrder = string;\nclass IPay {}\n' })), [
    'type-prefix',
    'type-prefix',
    'type-prefix',
  ]);
  assert.deepEqual(check({ 'a.ts': 'interface Item {}\nclass Table {}\ntype Token = string;\n' }).failures, []);
});

test('verb-synonym flags function declarations and function-valued bindings', () => {
  const result = check({
    'a.ts': `function retrieveUser() {}
const getAllUsers = () => [];
export function convertRow() {}
const getAllowedUsers = () => [];
const insertion = 1;
`,
  });
  assert.deepEqual(
    result.failures.map((finding) => [finding.rule, finding.suggestion]),
    [
      ['verb-synonym', 'getUser'],
      ['verb-synonym', 'listUsers'],
      ['verb-synonym', 'toRow or parseRow'],
    ],
  );
});

test('env-shape checks example env files, and only those', () => {
  const result = check({
    '.env.example': `# a comment
API_KEY_FOR_BILLING=1
stripeKey=2
SLACK_TOKEN_FOR_ALERTS=3
DATABASE_URL=4
`,
  });
  assert.deepEqual(
    result.failures.map((finding) => finding.line),
    [3, 4],
  );
  assert.deepEqual(rules(result), ['env-shape', 'env-shape']);
  assert.deepEqual(check({ '.env.local.example': 'stripeKey=2\n' }).failures.length, 1);
  assert.deepEqual(check({ '.env.sample': 'stripeKey=2\n' }).failures.length, 1);
  assert.deepEqual(check({ 'notes.txt': 'stripeKey=2\n' }).failures, []);
});

test('discriminant only warns, and only in TypeScript type bodies', () => {
  const result = check({
    'a.ts': `interface Message {
  readonly type: 'ping' | 'pong';
}
const payload = { type: 'ping' };
`,
  });
  assert.deepEqual(result.failures, []);
  assert.deepEqual(
    result.warnings.map((finding) => [finding.rule, finding.line, finding.suggestion]),
    [['discriminant', 2, 'kind']],
  );
});

test('a generic type parameter is not an identifier', () => {
  const result = check({
    'a.ts': `export function identity<T>(value: T): T {
  return value;
}
export const wrap = <T,>(value: T): T[] => [value];
type Box<T> = { value: T };
`,
  });
  assert.deepEqual(result.failures, []);
});

test('an allow entry suppresses a matching identifier, path or env name', () => {
  assert.deepEqual(check({ 'a.ts': 'const opts = 1;\n' }, ['^opts$']).failures, []);
  assert.deepEqual(check({ 'src/UserProfile.ts': COMPLIANT }, ['UserProfile']).failures, []);
  assert.deepEqual(check({ '.env.example': 'stripeKey=1\n' }, ['^stripeKey$']).failures, []);
});

// Writes the consumer override into a fresh root, then checks the same files.
const withOverride = (files, override) => {
  const { root } = check(files);
  mkdirSync(join(root, '.skilly'), { recursive: true });
  const text = typeof override === 'string' ? override : JSON.stringify(override, null, 2);
  writeFileSync(join(root, '.skilly', 'naming.json'), text);
  return { root, ...checkNaming({ root, files: Object.keys(files) }) };
};

test('.skilly/naming.json allow silences a name the defaults flag', () => {
  assert.deepEqual(withOverride({ 'a.ts': 'const opts = 1;\n' }, { allow: ['^opts$'] }).failures, []);
});

test('.skilly/naming.json drops a default noise word and a default short word', () => {
  assert.deepEqual(withOverride({ 'a.ts': 'const userData = 1;\n' }, { noiseWords: ['-Data'] }).failures, []);
  assert.deepEqual(withOverride({ 'a.ts': 'const opts = 1;\n' }, { shortWords: { opts: null } }).failures, []);
});

test('.skilly/naming.json adds a short word and a verb synonym', () => {
  const short = withOverride({ 'a.ts': 'const dto = 1;\n' }, { shortWords: { dto: 'data transfer object' } });
  assert.deepEqual(
    short.failures.map((finding) => [finding.rule, finding.suggestion]),
    [['short-word', 'data transfer object']],
  );

  const verb = withOverride({ 'a.ts': 'function grabUser() {}\n' }, { synonyms: { grab: 'get' } });
  assert.deepEqual(
    verb.failures.map((finding) => [finding.rule, finding.suggestion]),
    [['verb-synonym', 'getUser']],
  );
});

test('.skilly/naming.json can make "type" the discriminant, which drops the warning', () => {
  const source = "interface Message {\n  readonly type: 'ping';\n}\n";
  assert.deepEqual(withOverride({ 'a.ts': source }, { discriminant: 'type' }).warnings, []);
});

test('the gate still reads an override left at the pre-.skilly path', () => {
  const { root } = check({ 'a.ts': 'const opts = 1;\n' });
  mkdirSync(join(root, 'docs', 'agents'), { recursive: true });
  writeFileSync(join(root, 'docs', 'agents', 'naming.json'), JSON.stringify({ allow: ['^opts$'] }));
  assert.deepEqual(checkNaming({ root, files: ['a.ts'] }).failures, []);
});

test('a malformed override fails the CLI and names the file', () => {
  const { root } = check({ 'a.ts': 'const label = 1;\n' });
  mkdirSync(join(root, '.skilly'), { recursive: true });
  writeFileSync(join(root, '.skilly', 'naming.json'), '{ not json');
  const result = spawnSync(process.execPath, [namingScript, 'a.ts'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\.skilly\/naming\.json/);
});

test('vendored, generated and non-code paths are skipped', () => {
  const bad = 'const opts = 1;\n';
  const result = check({
    'node_modules/pkg/Bad.ts': bad,
    '.agents/skills/Bad.ts': bad,
    '.claude/Bad.ts': bad,
    '.skilly-hub/Bad.ts': bad,
    'dist/Bad.ts': bad,
    'build/Bad.ts': bad,
    '.next/Bad.ts': bad,
    'src/Api.generated.ts': bad,
    'src/Types.d.ts': bad,
    'docs/Bad.md': bad,
  });
  assert.deepEqual(result.failures, []);
});

const runCli = (root, files) => spawnSync(process.execPath, [namingScript, ...files], { cwd: root, encoding: 'utf8' });

test('the CLI prints one line per finding and exits 1 only on failures', () => {
  const { root } = check({ 'src/BadName.ts': 'const opts = 1;\n', 'src/user-profile.ts': COMPLIANT });
  const bad = runCli(root, ['src/BadName.ts']);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /^FAIL src\/BadName\.ts:1 file-case: /m);
  assert.match(bad.stdout, /^FAIL src\/BadName\.ts:1 short-word: .* — use options$/m);
  assert.match(bad.stdout, /^naming: 2 failures, 0 warnings over 1 file$/m);

  const ok = runCli(root, ['src/user-profile.ts']);
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /^naming: 0 failures, 0 warnings over 1 file$/m);
});

test('the CLI reads the file list from stdin', () => {
  const { root } = check({ 'src/user-profile.ts': COMPLIANT });
  const result = spawnSync(process.execPath, [namingScript], {
    cwd: root,
    encoding: 'utf8',
    input: 'src/user-profile.ts\n',
  });
  assert.equal(result.status, 0);
});

const git = (root, ...args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });

// A consumer checkout the gate can run in: a `main` base and a feature branch on
// top of it. No origin remote — the wrapper falls back to the local branch.
const gitRepo = () => {
  const root = mkdtempSync(join(tmpdir(), 'skilly-naming-git-'));
  git(root, 'init', '-q', '--initial-branch=main');
  git(root, 'config', 'user.name', 'test');
  git(root, 'config', 'user.email', 'test@example.com');
  writeFileSync(join(root, 'seed'), '0');
  git(root, 'add', '-A');
  git(root, 'commit', '--no-verify', '-q', '-m', 'chore: seed');
  git(root, 'checkout', '-q', '-b', 'feature');
  return root;
};

const runShell = (root) =>
  spawnSync('bash', [namingShell], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, DEFAULT_BRANCH: 'main', GITHUB_BASE_REF: '' },
  });

test('naming.sh checks the files the branch adds over its base', () => {
  const root = gitRepo();
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'BadName.ts'), 'export const opts = 1;\n');
  git(root, 'add', '-A');
  git(root, 'commit', '--no-verify', '-q', '-m', 'feat: add a badly named file');

  const result = runShell(root);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /FAIL src\/BadName\.ts:1 file-case:/);
  assert.match(result.stdout, /FAIL src\/BadName\.ts:1 short-word:/);
});

test('naming.sh passes a clean branch and says so when nothing changed', () => {
  const root = gitRepo();
  writeFileSync(join(root, 'user-profile.ts'), COMPLIANT);
  git(root, 'add', '-A');
  git(root, 'commit', '--no-verify', '-q', '-m', 'feat: add a well named file');
  const clean = runShell(root);
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);

  const empty = runShell(gitRepo());
  assert.equal(empty.status, 0, empty.stdout + empty.stderr);
  assert.match(empty.stdout, /nothing to check/);
});
