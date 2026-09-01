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
const { bundles, rules } = resolveBundles(JSON.parse(readFileSync(skillyPath, 'utf8')).bundles ?? [], bundlesDir);

if (!rules.size) {
  console.log(`no rules declared by bundles: ${bundles.join(', ') || '(none)'}`);
  process.exit(0);
}

let failed = false;
for (const [rule, { script }] of rules) {
  console.log(`\n=== gate: ${rule} ===`);
  const result = spawnSync('bash', [script], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`gate: rule "${rule}" failed`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
