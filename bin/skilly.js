#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { init } from '../lib/init.js';
import { sync } from '../lib/sync.js';
import { onboard } from '../bundles/setup-project/skills/setup-skilly/scripts/onboard.js';

const bundlesDir = fileURLToPath(new URL('../bundles', import.meta.url));
const [command, ...rest] = process.argv.slice(2);
const flags = rest.filter((arg) => arg.startsWith('--'));
const args = rest.filter((arg) => !arg.startsWith('--'));

const usage = `usage:
  skilly init <bundle...>          write .skilly.json + caller workflow, then sync
  skilly onboard <bundle...>       full onboarding: secrets, init/merge, private-owner, PR
  skilly sync [--prune] [--dry-run]  install missing bundle skills, sync config`;

const allowedFlags = { init: [], onboard: [], sync: ['--prune', '--dry-run'] };

try {
  const unknown = flags.filter((flag) => !(allowedFlags[command] ?? []).includes(flag));
  if (command && allowedFlags[command] && unknown.length) {
    throw new Error(`unknown flag(s): ${unknown.join(', ')}\n${usage}`);
  }
  if (command === 'init') {
    await init(args, { bundlesDir });
  } else if (command === 'onboard') {
    await onboard(args, { bundlesDir });
  } else if (command === 'sync') {
    await sync({ bundlesDir, prune: flags.includes('--prune'), dryRun: flags.includes('--dry-run') });
  } else {
    console.log(usage);
    process.exitCode = command ? 1 : 0;
  }
} catch (error) {
  console.error(`skilly: ${error.message}`);
  process.exitCode = 1;
}
