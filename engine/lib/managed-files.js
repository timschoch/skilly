import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { HUB_REPO } from './constants.js';
import { tryRun } from './run.js';
import { selfSource } from './self-source.js';
import { TIERS } from './skilly-file.js';

// The Managed files (ADR-0009 decision 9): the Sync writes them from the Engine's templates, by
// tier and package manager. A person changes .skilly/verify.json or the tier, never the file.
const MANAGED_FILES = [
  { path: '.github/workflows/ci.yml', template: 'ci.yml', tier: 'sandbox' },
  { path: '.github/workflows/ai-review.yml', template: 'ai-review.yml', tier: 'tool' },
  { path: '.github/dependabot.yml', template: 'dependabot.yml', tier: 'tool' },
  { path: '.github/workflows/nightly.yml', template: 'nightly.yml', tier: 'product' },
  // A Consumer's own release.yml can hold deploy steps, so the Sync never overwrites it.
  { path: '.github/workflows/release.yml', template: 'release.yml', tier: 'product', keepsOwn: true },
];
export const MANAGED_PATHS = MANAGED_FILES.map(({ path }) => path);

// The first line of every template. Only a file with it is the Sync's to delete.
const HEADER = '# Managed by skilly.';
const STEP_INDENT = '      ';

const PACKAGE_MANAGERS = {
  npm: { lockfile: 'package-lock.json', install: 'npm ci', exec: 'npx' },
  pnpm: { lockfile: 'pnpm-lock.yaml', install: 'pnpm install --frozen-lockfile', exec: 'pnpm exec' },
};
// Lockfiles of the package managers without a template, so the Sync names them.
const OTHER_LOCKFILES = { 'yarn.lock': 'yarn', 'bun.lock': 'bun', 'bun.lockb': 'bun' };

const readPackageJson = (cwd) => {
  const path = join(cwd, 'package.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
};

// `packageManager` in package.json names it. Without one, the lockfile does; without both, npm.
function detectPackageManager(cwd, packageJson) {
  const named = packageJson.packageManager?.split('@')[0];
  const found =
    named ??
    Object.entries(PACKAGE_MANAGERS).find(([, { lockfile }]) => existsSync(join(cwd, lockfile)))?.[0] ??
    Object.entries(OTHER_LOCKFILES).find(([lockfile]) => existsSync(join(cwd, lockfile)))?.[1] ??
    'npm';
  if (!PACKAGE_MANAGERS[found]) throw new Error(`no Managed workflow for ${found}: the Engine knows npm and pnpm`);
  return found;
}

// The Managed file is written for the checkout, so the running repo's env does not count: the
// Hub nightly syncs a Consumer from the Hub's own Actions run. origin/HEAD comes from the clone.
const findDefaultBranch = (cwd) =>
  tryRun('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { cwd })?.replace(/^origin\//, '') ?? 'main';

// The setup steps up to setup-node, which caches the package manager's store by the lockfile.
function setupNodeSteps(cwd, name, packageJson) {
  const lines = [];
  if (name === 'pnpm') {
    lines.push('- uses: pnpm/action-setup@v6');
    // A packageManager field pins the version, and the action fails when it gets a second one.
    if (!packageJson.packageManager) lines.push('  with:', '    version: latest');
  }
  const versionFile = ['.nvmrc', '.node-version'].find((file) => existsSync(join(cwd, file)));
  lines.push(
    '- uses: actions/setup-node@v7',
    '  with:',
    versionFile ? `    node-version-file: ${versionFile}` : '    node-version: lts/*',
    `    cache: ${name}`,
  );
  return lines.map((line) => `${STEP_INDENT}${line}`).join('\n');
}

const render = (template, values) =>
  template.replaceAll(/@\{(\w+)\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`template placeholder @{${key}} has no value`);
    return values[key];
  });

/**
 * Writes the Managed files of `tier` into `cwd` from `templatesDir`, and deletes the ones the
 * tier no longer gets when the Sync wrote them. The Hub keeps its own workflows: it runs
 * engine/, not .skilly/engine/. Returns false for the Hub.
 */
export function writeManagedFiles(cwd, templatesDir, tier = 'sandbox') {
  if (selfSource(cwd)?.toLowerCase() === HUB_REPO) return false;
  if (!TIERS.includes(tier)) throw new Error(`unknown tier ${JSON.stringify(tier)}, tiers are ${TIERS.join(', ')}`);
  const packageJson = readPackageJson(cwd);
  const name = detectPackageManager(cwd, packageJson);
  const values = {
    ...PACKAGE_MANAGERS[name],
    setupNode: setupNodeSteps(cwd, name, packageJson),
    defaultBranch: findDefaultBranch(cwd),
    releaseType: existsSync(join(cwd, 'package.json')) ? 'node' : 'simple',
  };
  for (const file of MANAGED_FILES) {
    const target = join(cwd, file.path);
    const exists = existsSync(target);
    const isOwn = exists && !readFileSync(target, 'utf8').startsWith(HEADER);
    if (TIERS.indexOf(tier) >= TIERS.indexOf(file.tier)) {
      if (isOwn && file.keepsOwn) continue;
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, render(readFileSync(join(templatesDir, file.template), 'utf8'), values));
    } else if (exists && !isOwn) {
      rmSync(target);
    }
  }
  return true;
}
