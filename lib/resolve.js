import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Resolve bundle names to the union of their sources, rules, and rule files,
// following `includes` recursively. Cycles and unknown bundles are hard errors.
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
  const rules = new Set();
  const ruleFiles = new Map(); // rule-file name -> { bundle, path }
  for (const [name, config] of configs) {
    for (const entry of config.sources ?? []) {
      if (!sources.has(entry.source)) sources.set(entry.source, new Set());
      for (const skill of entry.skills ?? []) sources.get(entry.source).add(skill);
    }
    for (const rule of config.rules ?? []) rules.add(rule);

    const rulesDir = join(bundlesDir, name, 'rules');
    if (!existsSync(rulesDir)) continue;
    for (const file of readdirSync(rulesDir)) {
      if (!file.endsWith('.md')) continue;
      const ruleName = file.slice(0, -'.md'.length);
      const prev = ruleFiles.get(ruleName);
      // Rule files flatten into one .claude/rules/ namespace per consumer.
      if (prev) throw new Error(`rule file "${ruleName}.md" declared by both "${prev.bundle}" and "${name}"`);
      ruleFiles.set(ruleName, { bundle: name, path: join(rulesDir, file) });
    }
  }
  return { bundles: [...configs.keys()], sources, rules, ruleFiles };
}
