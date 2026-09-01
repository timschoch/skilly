import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureSkilly } from './ensure-skilly.js';
import { ensureBranch } from './ensure-branch.js';
import { resolveBundles } from './resolve.js';
import { updateRules } from './update-rules.js';
import { commit } from './commit.js';
import { confirm } from './run.js';
import { add, sourceRepo } from './add.js';
import { remove } from './remove.js';
import * as skillyFile from './skilly-file.js';
import * as skillsCli from './skills-cli.js';
import { addFormatterIgnores } from './formatter-ignores.js';

// docs/update.mmd — pull the hub's current state into this consumer.
// Direction rule: update calls add/remove; they never call update.
// headless (nightly): removals auto-apply and land loudly in the Sync PR body
// via the --report file.
export async function update({ cwd = process.cwd(), bundlesDir, headless = false, report = null }) {
  ensureSkilly(cwd);
  await ensureBranch(cwd);
  const summary = { removed: [], added: [], updated: [] };
  const isHubBundle = (name) => existsSync(join(bundlesDir, name, 'config.json'));

  // bundles the hub dropped
  for (const bundle of skillyFile.read(cwd).bundles.filter((name) => !isHubBundle(name))) {
    if (await confirm(`bundle "${bundle}" was removed from the hub — remove it here?`, { headless })) {
      // push: false everywhere below — verbs only commit; the ONE push + PR
      // happens in the final commit(), after the run is whole (docs/update.mmd).
      await remove([bundle], { cwd, bundlesDir, push: false });
      summary.removed.push(bundle);
    }
  }

  // skills the remaining bundles no longer claim (hand-pins from unrelated
  // sources are never touched)
  const resolved = resolveBundles(skillyFile.read(cwd).bundles, bundlesDir);
  const wanted = new Set([...resolved.sources.values()].flatMap((skills) => [...skills]));
  // the lock stores owner/repo even for tree-URL sources — compare normalized
  const bundledSources = new Set([...resolved.sources.keys()].map(sourceRepo));
  const lock = skillsCli.readLock(cwd);
  const dropped = Object.entries(lock)
    .filter(([name, pin]) => !wanted.has(name) && bundledSources.has(sourceRepo(pin.source)))
    .map(([name]) => name)
    .sort();
  for (const skill of dropped) {
    if (await confirm(`skill "${skill}" left your bundles — remove it here?`, { headless })) {
      await remove([skill], { cwd, bundlesDir, push: false });
      summary.removed.push(skill);
    }
  }

  // skills newly added to your bundles
  const missing = [...wanted].filter((name) => !(name in skillsCli.readLock(cwd))).sort();
  if (missing.length) {
    const { skills } = await add(missing, { cwd, bundlesDir, push: false });
    summary.added.push(...skills);
  }

  // native update on the remaining lock entries
  const { changed } = skillsCli.update(cwd);
  summary.updated = changed;

  // rules for ALL installed skills, and for every bundle still on board
  for (const skill of Object.keys(skillsCli.readLock(cwd)).sort()) {
    updateRules(cwd, skill, join(cwd, '.claude', 'skills', skill));
  }
  for (const bundle of skillyFile.read(cwd).bundles.filter(isHubBundle)) {
    updateRules(cwd, bundle, join(bundlesDir, bundle));
  }

  addFormatterIgnores(cwd);
  commit(cwd, 'chore(skilly): update skills', { forcePush: headless });
  if (report) writeFileSync(report, JSON.stringify(summary, null, 2) + '\n');
  return summary;
}
