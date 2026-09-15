// Gate job entry (shared workflow). Runs from a consumer checkout with the hub
// checked out at .skilly-hub: resolves the consumer's bundles, then runs every
// declared rule's check script. Any failing script fails the job.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resolveBundles } from '../lib/resolve.js';
import * as skillyFile from '../lib/skilly-file.js';

const bundlesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'bundles');
if (!skillyFile.exists(process.cwd())) {
  console.log(`no ${skillyFile.CONFIG_PATH} — nothing to gate`);
  process.exit(0);
}
const { bundles, rules } = resolveBundles(skillyFile.read(process.cwd()).bundles, bundlesDir);

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
