import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Resolve bundle names to the union of their sources and gate Rules,
// following `includes` recursively. Cycles, unknown bundles, and Rules
// without a check script are hard errors.
export function resolveBundles(names, bundlesDir) {
  const configs = new Map(); // bundle name -> config, in resolution order
  const visiting = [];

  const visit = (name) => {
    if (configs.has(name)) return;
    const cycleStart = visiting.indexOf(name);
    if (cycleStart !== -1) {
      throw new Error(`bundle include cycle: ${[...visiting.slice(cycleStart), name].join(' -> ')}`);
    }
    const configPath = join(bundlesDir, name, 'config.json');
    if (!existsSync(configPath)) throw new Error(`unknown bundle "${name}" (no ${configPath})`);
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    visiting.push(name);
    for (const included of config.includes ?? []) visit(included);
    visiting.pop();
    configs.set(name, config);
  };
  for (const name of names) visit(name);

  const sources = new Map(); // "owner/repo" -> Set of skill names
  const rules = new Map(); // rule name -> { bundle, script } — the answer callers need, not re-derived
  for (const [name, config] of configs) {
    for (const entry of config.sources ?? []) {
      if (!sources.has(entry.source)) sources.set(entry.source, new Set());
      for (const skill of entry.skills ?? []) sources.get(entry.source).add(skill);
    }
    for (const rule of config.rules ?? []) {
      if (rules.has(rule)) continue;
      const script = join(bundlesDir, name, 'rules', `${rule}.sh`);
      if (!existsSync(script)) throw new Error(`rule "${rule}" declared by "${name}" has no ${script}`);
      rules.set(rule, { bundle: name, script });
    }
  }
  return { bundles: [...configs.keys()], sources, rules };
}
