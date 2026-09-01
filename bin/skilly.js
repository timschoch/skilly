#!/usr/bin/env node
// Porcelain only: parse args, dispatch to one verb script (docs/flows user.mmd).
import { fileURLToPath } from 'node:url';
import { setup } from '../lib/setup.js';
import { add } from '../lib/add.js';
import { remove } from '../lib/remove.js';
import { update } from '../lib/update.js';

const bundlesDir = fileURLToPath(new URL('../bundles', import.meta.url));

const usage = `usage:
  skilly setup                        one-time setup: secrets, .skilly.json, caller workflow, setup-project skill
  skilly add <bundle-or-skill...>     add bundles or single skills, commit, ensure PR
  skilly remove <bundle-or-skill...>  remove bundles or single skills, commit, ensure PR
  skilly update [--headless] [--report <path>]  pull hub changes, update all skills, commit, ensure PR`;

const [command, ...rest] = process.argv.slice(2);
const names = [];
let headless = false;
let report = null;

try {
  while (rest.length) {
    const arg = rest.shift();
    if (arg === '--headless') headless = true;
    else if (arg === '--report') report = rest.shift() ?? null;
    else if (arg.startsWith('--')) throw new Error(`unknown flag ${arg}\n${usage}`);
    else names.push(arg);
  }
  if ((headless || report) && command !== 'update')
    throw new Error(`--headless/--report only apply to update\n${usage}`);

  if (command === 'setup') {
    await setup({ bundlesDir });
  } else if (command === 'add') {
    await add(names, { bundlesDir });
  } else if (command === 'remove') {
    await remove(names, { bundlesDir });
  } else if (command === 'update') {
    await update({ bundlesDir, headless, report });
  } else {
    console.log(usage);
    process.exitCode = command ? 1 : 0;
  }
} catch (error) {
  console.error(`skilly: ${error.message}`);
  process.exitCode = 1;
}
