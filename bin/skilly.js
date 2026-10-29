#!/usr/bin/env node
// Porcelain only: parse args, dispatch to one verb script.
import { fileURLToPath } from 'node:url';
import { listBundles, listPreflightChecks, listUnmatchedDependencies, setConfig } from '../engine/lib/decide.js';
import { setup } from '../engine/lib/setup.js';
import { selfSource } from '../engine/lib/self-source.js';
import * as skillyFile from '../engine/lib/skilly-file.js';
import { update } from '../lib/update.js';

// The Engine CLI runs these verbs. It reads the same arguments.
const ENGINE_VERBS = ['add', 'remove', 'sync'];

// The package is a Release snapshot: bundles/ and engine/templates/.
const snapshotDir = fileURLToPath(new URL('..', import.meta.url));
const bundlesDir = fileURLToPath(new URL('../bundles', import.meta.url));
const decideSkill = fileURLToPath(new URL('../bundles/setup-project/skills/setup-project/SKILL.md', import.meta.url));

const usage = `usage:
  skilly detect                       decide phase: the Bundles, pre-ticked from detect hints, as JSON
  skilly config <tier> <bundle...>    decide phase: write the tier and Bundles into .skilly/config.json
  skilly preflight                    decide phase: check gh, Hub access, App, repo settings, secrets
  skilly setup                        apply .skilly/config.json: first Sync, repo settings, setup PR. Asks nothing
  skilly add <bundle-or-skill...>     add bundles or single skills at the pinned Release, print the Sync report
  skilly remove <bundle-or-skill...>  remove bundles or single skills at the pinned Release, print the Sync report
  skilly sync                         open or update the Sync PR at the newest Release
  skilly update [--headless] [--report <path>]  old Sync, kept for the old sync.yml update job`;

const [command, ...rest] = process.argv.slice(2);
const cwd = process.cwd();
const names = [];
let headless = false;
let report = null;

// The decide phase's defaults (ADR-0009 decision 4), or the config's answers on a second run.
function printDetect() {
  const config = skillyFile.exists(cwd) ? skillyFile.read(cwd) : null;
  const result = {
    repo: selfSource(cwd),
    tier: config?.tier ?? 'tool',
    bundles: listBundles({ cwd, snapshotDir }),
    unmatchedDependencies: listUnmatchedDependencies({ cwd, snapshotDir }),
  };
  console.log(JSON.stringify(result, null, 2));
}

function printPreflight() {
  const checks = listPreflightChecks({ cwd, snapshotDir });
  for (const { check, ok, detail } of checks) console.log(`${ok ? '✓' : '✗'} ${check}: ${detail}`);
  return checks.every(({ ok }) => ok) ? 0 : 1;
}

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

  if (command === 'detect') {
    printDetect();
  } else if (command === 'config') {
    const [tier, ...bundles] = names;
    setConfig({ cwd, snapshotDir, tier, bundles });
    console.log(`wrote ${skillyFile.CONFIG_PATH}: tier ${tier}, Bundles ${bundles.join(', ') || 'none'}`);
  } else if (command === 'preflight') {
    process.exitCode = printPreflight();
  } else if (command === 'setup') {
    if (!skillyFile.exists(cwd))
      throw new Error(
        `no ${skillyFile.CONFIG_PATH} yet. Setup starts with the decide phase: have your agent read ${decideSkill} in full and follow it`,
      );
    setup({ cwd });
  } else if (ENGINE_VERBS.includes(command)) {
    await import('../engine/bin/skilly.js');
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
