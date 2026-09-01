import { join } from 'node:path';
import { ensureSkilly } from './ensure-skilly.js';
import { ensureBranch } from './ensure-branch.js';
import { matchName } from './match.js';
import { resolveBundles } from './resolve.js';
import { updateRules } from './update-rules.js';
import { commit, skillyMessage } from './commit.js';
import * as skillyFile from './skilly-file.js';
import * as skillsCli from './skills-cli.js';
import { run, tryRun } from './run.js';
import { setPrivateOwner, CALLER_WORKFLOW_PATH } from './caller-workflow.js';
import { addFormatterIgnores } from './formatter-ignores.js';

// A source is "owner/repo" or a GitHub tree URL pointing into a repo's
// subfolder (deeply nested catalogs the skills CLI cannot discover from the
// repo root). Both reduce to owner/repo for the GitHub API.
export function sourceRepo(source) {
  const url = source.match(/^https:\/\/github\.com\/([^/\s]+\/[^/\s]+)/);
  return url ? url[1] : source;
}

// The skills CLI takes a single GH_TOKEN, so one private-source owner per
// consumer (known v1 limit). isPrivate is injected for tests.
export function pickPrivateOwner(sources, repoOwner, isPrivate) {
  const owners = new Set();
  for (const source of sources) {
    const owner = sourceRepo(source).split('/')[0];
    if (owner !== repoOwner && isPrivate(source)) owners.add(owner);
  }
  if (owners.size > 1) {
    throw new Error(`private sources from two owners (${[...owners].sort().join(', ')}) — one private-owner per consumer (known v1 limit)`);
  }
  return owners.size ? [...owners][0] : null;
}

function ensurePrivateOwner(cwd, bundlesDir) {
  const repoOwner = tryRun('gh', ['repo', 'view', '--json', 'owner', '--jq', '.owner.login'], { cwd });
  if (!repoOwner) return; // no gh / no remote — nightly CI re-runs this path anyway
  const { sources } = resolveBundles(skillyFile.read(cwd).bundles, bundlesDir);
  const isPrivate = (source) => run('gh', ['api', `repos/${sourceRepo(source)}`, '--jq', '.private'], { cwd }) === 'true';
  const owner = pickPrivateOwner([...sources.keys()], repoOwner, isPrivate);
  if (owner && setPrivateOwner(cwd, owner)) console.log(`set private-owner: ${owner} in ${CALLER_WORKFLOW_PATH}`);
}

// docs/add.mmd — add bundles or single skills, then rules, then commit.
export async function add(names, { cwd = process.cwd(), bundlesDir, forcePush = false, push = true }) {
  if (!names.length) throw new Error('usage: skilly add <bundle-or-skill...>');
  ensureSkilly(cwd);
  await ensureBranch(cwd);

  const skillsBySource = new Map();
  const claim = (source, skill) => {
    if (!skillsBySource.has(source)) skillsBySource.set(source, new Set());
    skillsBySource.get(source).add(skill);
  };
  const addedBundles = [];
  for (const name of names) {
    const match = matchName(name, bundlesDir);
    if (!match) throw new Error(`no bundle or skill named "${name}" in the hub — see bundles/ for what exists`);
    if (match.type === 'bundle') {
      skillyFile.addBundle(cwd, name);
      addedBundles.push(name);
      const { sources } = resolveBundles([name], bundlesDir);
      for (const [source, skills] of sources) for (const skill of skills) claim(source, skill);
    } else {
      claim(match.source, name);
    }
  }

  const addedSkills = [];
  for (const [source, skills] of skillsBySource) {
    const { added, missing } = skillsCli.add(cwd, source, [...skills].sort());
    addedSkills.push(...added);
    if (missing.length) throw new Error(`skills add left these uninstalled: ${missing.map((s) => `${source}: ${s}`).join(', ')} — nothing was committed`);
  }

  for (const skill of addedSkills) updateRules(cwd, skill, join(cwd, '.claude', 'skills', skill));
  for (const bundle of addedBundles) updateRules(cwd, bundle, join(bundlesDir, bundle));
  if (addedBundles.length) ensurePrivateOwner(cwd, bundlesDir);
  addFormatterIgnores(cwd);

  commit(cwd, skillyMessage('add', names), { forcePush, push });
  return { bundles: addedBundles, skills: addedSkills };
}
