import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ensureSkilly } from './ensure-skilly.js';
import { ensureBranch } from './ensure-branch.js';
import { resolveBundles } from './resolve.js';
import { updateRules } from './update-rules.js';
import { commit, skillyMessage } from './commit.js';
import * as skillyFile from './skilly-file.js';
import * as skillsCli from './skills-cli.js';

// Which of the candidate skills may actually go: skills another remaining
// bundle still claims stay installed (docs/remove.mmd). Pure for tests.
export function planRemovals(candidates, claimedSkills, lockSkills) {
  return [...candidates].filter((skill) => !claimedSkills.has(skill) && skill in lockSkills).sort();
}

// docs/remove.mmd — remove bundles or single skills, then rules, then commit.
// A name is a bundle if .skilly.json or the hub says so (a bundle the hub
// dropped is still removable); a bare skill must be in the lock.
export async function remove(names, { cwd = process.cwd(), bundlesDir, forcePush = false }) {
  if (!names.length) throw new Error('usage: skilly remove <bundle-or-skill...>');
  ensureSkilly(cwd);
  await ensureBranch(cwd);

  const isHubBundle = (name) => existsSync(join(bundlesDir, name, 'config.json'));
  const lock = skillsCli.readLock(cwd);
  const candidates = new Set();
  const removedBundles = [];
  for (const name of names) {
    if (skillyFile.read(cwd).bundles.includes(name) || isHubBundle(name)) {
      skillyFile.removeBundle(cwd, name);
      removedBundles.push(name);
      if (isHubBundle(name)) {
        const { sources } = resolveBundles([name], bundlesDir);
        for (const skills of sources.values()) for (const skill of skills) candidates.add(skill);
      }
    } else if (name in lock) {
      candidates.add(name);
    } else {
      throw new Error(`no bundle or skill named "${name}" here — check .skilly.json and skills-lock.json`);
    }
  }

  // Bundles the hub dropped can no longer be resolved — their skills stay
  // as hand-pins until removed by name.
  const remaining = skillyFile.read(cwd).bundles.filter(isHubBundle);
  const { sources } = resolveBundles(remaining, bundlesDir);
  const claimed = new Set([...sources.values()].flatMap((skills) => [...skills]));
  const toRemove = planRemovals(candidates, claimed, lock);

  if (toRemove.length) {
    const { left } = skillsCli.remove(cwd, toRemove);
    if (left.length) throw new Error(`skills remove left these pinned: ${left.join(', ')}`);
  }
  const kept = [...candidates].filter((skill) => claimed.has(skill));
  if (kept.length) console.log(`kept (still claimed by a remaining bundle): ${kept.join(', ')}`);

  for (const skill of toRemove) updateRules(cwd, skill, join(cwd, '.claude', 'skills', skill));
  for (const bundle of removedBundles) updateRules(cwd, bundle, null); // delete-only: the bundle left this consumer

  commit(cwd, skillyMessage('remove', names), { forcePush });
  return { bundles: removedBundles, skills: toRemove };
}
