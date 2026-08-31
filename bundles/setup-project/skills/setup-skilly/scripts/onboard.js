// Lives with the setup-skilly skill (scripts go along with the skills that use
// them); `skilly onboard` in bin/ is the thin wrapper the skill invokes via npx.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveBundles } from '../../../../../lib/resolve.js';
import { init } from '../../../../../lib/init.js';
import { sync } from '../../../../../lib/sync.js';
import { scaffoldCallerWorkflow, setPrivateOwner, CALLER_WORKFLOW_PATH } from '../../../../../lib/caller-workflow.js';
import { SKILLY_APP_ID, SKILLY_APP_PEM } from '../../../../../lib/constants.js';

function run(cmd, args, { cwd, input } = {}) {
  const result = spawnSync(cmd, args, { cwd, input, encoding: 'utf8' });
  if (result.error) throw new Error(`failed to run ${cmd}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${(result.stderr || '').trim()}`);
  return result.stdout.trim();
}

// Union, existing order first. Pure for tests.
export function mergeBundles(existing, added) {
  return [...existing, ...added.filter((name) => !existing.includes(name))];
}

// The skills CLI takes a single GH_TOKEN, so one private-source owner per
// consumer (known v1 limit). isPrivate is injected for tests.
export function pickPrivateOwner(sources, repoOwner, isPrivate) {
  const owners = new Set();
  for (const source of sources) {
    const owner = source.split('/')[0];
    if (owner !== repoOwner && isPrivate(source)) owners.add(owner);
  }
  if (owners.size > 1) {
    throw new Error(`private sources from two owners (${[...owners].sort().join(', ')}) — one private-owner per consumer (known v1 limit)`);
  }
  return owners.size ? [...owners][0] : null;
}

function setSecrets(cwd) {
  const present = run('gh', ['secret', 'list', '--json', 'name', '--jq', '.[].name'], { cwd }).split('\n');
  const set = (name, args, input) => {
    if (present.includes(name)) return console.log(`secret ${name} already set — skip`);
    run('gh', ['secret', 'set', name, ...args], { cwd, input });
    console.log(`set secret ${name}`);
  };
  set('SKILLY_APP_ID', ['--body', SKILLY_APP_ID]);
  set('SKILLY_APP_PRIVATE_KEY', [], readFileSync(SKILLY_APP_PEM, 'utf8'));
}

function openPr(cwd) {
  if (!run('git', ['status', '--porcelain'], { cwd })) {
    console.log('nothing changed — no PR');
    return;
  }
  const branch = 'chore/skilly';
  const onBranch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd }) === branch;
  const branchExists = spawnSync('git', ['rev-parse', '--verify', '--quiet', branch], { cwd }).status === 0;
  if (!onBranch) run('git', branchExists ? ['checkout', branch] : ['checkout', '-b', branch], { cwd });
  run('git', ['add', '-A'], { cwd });
  run('git', ['commit', '-m', 'chore: onboard skilly'], { cwd });
  run('git', ['push', '-u', 'origin', branch], { cwd });
  const open = run('gh', ['pr', 'list', '--head', branch, '--state', 'open', '--json', 'url', '--jq', '.[].url'], { cwd });
  if (open) {
    console.log(`PR already open: ${open}`);
  } else {
    run('gh', ['pr', 'create', '--fill'], { cwd });
    console.log(`opened PR from ${branch}`);
  }
}

// Porcelain over init: whole onboarding, deterministic, idempotent. Needs a
// local `gh` auth that can write the repo.
export async function onboard(bundles, { cwd = process.cwd(), bundlesDir }) {
  if (!bundles.length) throw new Error('usage: skilly onboard <bundle...>');
  resolveBundles(bundles, bundlesDir); // fail on unknown names before touching the repo

  setSecrets(cwd);

  const skillyPath = join(cwd, '.skilly.json');
  if (!existsSync(skillyPath)) {
    await init(bundles, { cwd, bundlesDir });
  } else {
    const skilly = JSON.parse(readFileSync(skillyPath, 'utf8'));
    const merged = mergeBundles(skilly.bundles ?? [], bundles);
    if (merged.length !== (skilly.bundles ?? []).length) {
      skilly.bundles = merged;
      writeFileSync(skillyPath, JSON.stringify(skilly, null, 2) + '\n');
      console.log(`merged bundles into .skilly.json: ${merged.join(', ')}`);
    }
    if (scaffoldCallerWorkflow(cwd)) console.log(`wrote ${CALLER_WORKFLOW_PATH}`);
    await sync({ cwd, bundlesDir });
  }

  const skilly = JSON.parse(readFileSync(skillyPath, 'utf8'));
  const resolved = resolveBundles(skilly.bundles ?? [], bundlesDir);
  const repoOwner = run('gh', ['repo', 'view', '--json', 'owner', '--jq', '.owner.login'], { cwd });
  const isPrivate = (source) => run('gh', ['api', `repos/${source}`, '--jq', '.private'], { cwd }) === 'true';
  const owner = pickPrivateOwner([...resolved.sources.keys()], repoOwner, isPrivate);
  if (owner && setPrivateOwner(cwd, owner)) console.log(`set private-owner: ${owner} in ${CALLER_WORKFLOW_PATH}`);

  openPr(cwd);
}
