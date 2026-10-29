import { join } from 'node:path';
import { validateAndUpdateSkilly } from './validate-and-update-skilly.js';
import { prepareBranch } from './prepare-branch.js';
import { matchName } from '../engine/lib/match.js';
import { resolveBundles } from '../engine/lib/resolve.js';
import { selfSource, ownSkills } from '../engine/lib/self-source.js';
import { updateRules } from '../engine/lib/update-rules.js';
import { commit, skillyMessage } from './commit.js';
import * as skillyFile from '../engine/lib/skilly-file.js';
import * as skillsCli from '../engine/lib/skills-cli.js';
import { addFormatterIgnores } from '../engine/lib/formatter-ignores.js';

// Add bundles or single skills, then rules, then commit.
export async function add(names, { cwd = process.cwd(), bundlesDir, forcePush = false, push = true }) {
  if (!names.length) throw new Error('usage: skilly add <bundle-or-skill...>');
  validateAndUpdateSkilly(cwd);
  await prepareBranch(cwd);

  const self = { selfSource: selfSource(cwd), ownSkills: ownSkills(cwd) };
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
      const { sources } = resolveBundles([name], bundlesDir, self);
      for (const [source, skills] of sources) for (const skill of skills) claim(source, skill);
    } else {
      claim(match.source, name);
    }
  }

  const addedSkills = [];
  for (const [source, skills] of skillsBySource) {
    const { added, missing } = skillsCli.add(cwd, source, [...skills].sort());
    addedSkills.push(...added);
    if (missing.length)
      throw new Error(
        `skills add left these uninstalled: ${missing.map((s) => `${source}: ${s}`).join(', ')} — nothing was committed`,
      );
  }

  for (const skill of addedSkills) updateRules(cwd, skill, join(cwd, '.claude', 'skills', skill));
  for (const bundle of addedBundles) updateRules(cwd, bundle, join(bundlesDir, bundle));
  addFormatterIgnores(cwd);

  commit(cwd, skillyMessage('add', names), { forcePush, push });
  return { bundles: addedBundles, skills: addedSkills };
}
