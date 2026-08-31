// Gate job entry (shared workflow). Runs from a consumer checkout with the hub
// checked out at .skilly-hub: resolves the consumer's bundles, then runs every
// declared rule's check script. Any failing script fails the job.
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resolveBundles } from '../lib/resolve.js';

const bundlesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'bundles');
const skillyPath = join(process.cwd(), '.skilly.json');
if (!existsSync(skillyPath)) {
  console.log('no .skilly.json — nothing to gate');
  process.exit(0);
}
const { bundles } = resolveBundles(JSON.parse(readFileSync(skillyPath, 'utf8')).bundles ?? [], bundlesDir);

// Rule -> declaring bundle; a rule's script lives in its own bundle's rules/.
const scripts = new Map();
for (const bundle of bundles) {
  const config = JSON.parse(readFileSync(join(bundlesDir, bundle, 'config.json'), 'utf8'));
  for (const rule of config.rules ?? []) {
    if (scripts.has(rule)) continue;
    const script = join(bundlesDir, bundle, 'rules', `${rule}.sh`);
    if (!existsSync(script)) throw new Error(`rule "${rule}" declared by "${bundle}" has no ${script}`);
    scripts.set(rule, script);
  }
}

if (!scripts.size) {
  console.log(`no rules declared by bundles: ${bundles.join(', ') || '(none)'}`);
  process.exit(0);
}

let failed = false;
for (const [rule, script] of scripts) {
  console.log(`\n=== gate: ${rule} ===`);
  const result = spawnSync('bash', [script], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`gate: rule "${rule}" failed`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
