import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { resolveBundles } from './resolve.js';
import { HUB_REPO, SKILLS_CLI_VERSION } from './constants.js';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');

function readLockSkills(cwd) {
  const path = join(cwd, 'skills-lock.json');
  return existsSync(path) ? (readJson(path).skills ?? {}) : {};
}

// Per resolved source: skills the lock does not pin yet. Lock keys are skill
// names; the skills CLI keeps one entry per name, so presence is a name check.
export function planAdds(sources, lockSkills) {
  const adds = [];
  for (const [source, skills] of sources) {
    const missing = [...skills].filter((name) => !(name in lockSkills)).sort();
    if (missing.length) adds.push({ source, skills: missing });
  }
  return adds;
}

// Pins no bundle wants, from a source the bundles do use. Pins from unrelated
// sources are hand-pins — never listed, never touched.
export function planPrunes(sources, lockSkills) {
  const wanted = new Set([...sources.values()].flatMap((skills) => [...skills]));
  return Object.entries(lockSkills)
    .filter(([name, pin]) => !wanted.has(name) && sources.has(pin.source))
    .map(([name]) => name)
    .sort();
}

function runSkillsCli(args, cwd) {
  const result = spawnSync('npx', [`skills@${SKILLS_CLI_VERSION}`, ...args], { cwd, stdio: 'inherit' });
  if (result.error) throw new Error(`failed to run npx skills: ${result.error.message}`);
}

function hubCommit() {
  if (process.env.SKILLY_COMMIT) return process.env.SKILLY_COMMIT;
  const result = spawnSync('gh', ['api', `repos/${HUB_REPO}/commits/main`, '--jq', '.sha'], { encoding: 'utf8' });
  if (result.status === 0) return result.stdout.trim();
  console.error('skilly: warning: cannot resolve hub commit (no $SKILLY_COMMIT, gh api failed)');
  return null;
}

async function confirm(question) {
  if (!process.stdin.isTTY) throw new Error('--prune is interactive; run it locally, not in CI');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
}

// Config sync, file-ownership model: the hub owns .claude/rules/skilly-*.md
// wholesale; the repo owns everything else. Returns planned/applied changes.
function syncRuleFiles(cwd, ruleFiles, dryRun) {
  const outDir = join(cwd, '.claude', 'rules');
  const desired = new Map(); // output file name -> content
  for (const [name, { path }] of ruleFiles) desired.set(`skilly-${name}.md`, readFileSync(path, 'utf8'));

  const existing = existsSync(outDir)
    ? readdirSync(outDir).filter((f) => f.startsWith('skilly-') && f.endsWith('.md'))
    : [];
  const writes = [...desired.keys()].filter((file) => {
    const path = join(outDir, file);
    return !existsSync(path) || readFileSync(path, 'utf8') !== desired.get(file);
  });
  const deletes = existing.filter((file) => !desired.has(file));

  if (!dryRun) {
    if (writes.length) mkdirSync(outDir, { recursive: true });
    for (const file of writes) writeFileSync(join(outDir, file), desired.get(file));
    for (const file of deletes) unlinkSync(join(outDir, file));
  }
  return { writes, deletes };
}

export async function sync({ cwd = process.cwd(), bundlesDir, prune = false, dryRun = false }) {
  const skillyPath = join(cwd, '.skilly.json');
  if (!existsSync(skillyPath)) throw new Error('no .skilly.json — run `skilly init <bundle...>` first');
  const skilly = readJson(skillyPath);
  const resolved = resolveBundles(skilly.bundles ?? [], bundlesDir);
  console.log(`resolved bundles: ${resolved.bundles.join(', ') || '(none)'}`);

  const lockBefore = readLockSkills(cwd);
  const adds = planAdds(resolved.sources, lockBefore);
  const addCommand = ({ source, skills }) =>
    `npx skills@${SKILLS_CLI_VERSION} add ${source} -s ${skills.join(' ')} -y --agent claude-code`;

  if (dryRun) {
    console.log('\n--dry-run: planned actions, nothing changes\n');
    for (const add of adds) console.log(`  ${addCommand(add)}`);
    if (!adds.length) console.log('  no skills to add');
  } else {
    for (const add of adds) {
      console.log(`\n${addCommand(add)}`);
      runSkillsCli(['add', add.source, '-s', ...add.skills, '-y', '--agent', 'claude-code'], cwd);
    }
  }

  // `add` exits 0 on partial failure — the lock file is the only truth.
  let lockAfter = dryRun ? lockBefore : readLockSkills(cwd);
  if (!dryRun) {
    const stillMissing = adds.flatMap(({ source, skills }) =>
      skills.filter((name) => !(name in lockAfter)).map((name) => `${source}: ${name}`));
    for (const line of stillMissing) console.log(`skilly: still missing after add: ${line}`);
  }

  const prunes = planPrunes(resolved.sources, lockAfter);
  if (prunes.length) {
    console.log(`\nprune candidates (bundled sources, no bundle wants them): ${prunes.join(', ')}`);
    if (!prune) console.log('  re-run with --prune to remove them');
  }
  if (prune && prunes.length && !dryRun) {
    if (await confirm(`remove ${prunes.length} skill(s) via skills remove?`)) {
      runSkillsCli(['remove', ...prunes, '-y'], cwd);
      lockAfter = readLockSkills(cwd);
      const left = prunes.filter((name) => name in lockAfter);
      for (const name of left) console.log(`skilly: still pinned after remove: ${name}`);
    }
  }

  const { writes, deletes } = syncRuleFiles(cwd, resolved.ruleFiles, dryRun);
  const verb = dryRun ? 'would' : 'did';
  for (const file of writes) console.log(`${verb} write .claude/rules/${file}`);
  for (const file of deletes) console.log(`${verb} delete .claude/rules/${file}`);

  const lockChanged = JSON.stringify(lockAfter) !== JSON.stringify(lockBefore);
  const changed = lockChanged || writes.length > 0 || deletes.length > 0;
  if (!changed) {
    console.log('\nnothing to do — in sync');
    return;
  }
  if (dryRun) {
    console.log('\nwould set status.skilly in .skilly.json');
    return;
  }
  skilly.status = {
    ...skilly.status,
    skilly: { lastUpdate: new Date().toISOString().slice(0, 10), commit: hubCommit() },
  };
  writeJson(skillyPath, skilly);
  console.log('\nset status.skilly in .skilly.json');
}
