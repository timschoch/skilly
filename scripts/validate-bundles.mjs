// Hub CI: validate every bundle (docs/spec-v1.md, "Hub CI").
//   - config.json parses and has the right shape
//   - includes resolve, no cycles, rule-file names unique fleet-wide
//   - every declared rule has its <rule>.sh in the declaring bundle
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBundles } from '../lib/resolve.js';

const bundlesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'bundles');
const names = readdirSync(bundlesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const errors = [];
const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');

for (const name of names) {
  const configPath = join(bundlesDir, name, 'config.json');
  if (!existsSync(configPath)) {
    errors.push(`${name}: missing config.json`);
    continue;
  }
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    errors.push(`${name}: config.json does not parse — ${error.message}`);
    continue;
  }
  if (config.includes !== undefined && !isStringArray(config.includes)) errors.push(`${name}: "includes" must be a string array`);
  if (config.rules !== undefined && !isStringArray(config.rules)) errors.push(`${name}: "rules" must be a string array`);
  if (config.sources !== undefined) {
    if (!Array.isArray(config.sources)) {
      errors.push(`${name}: "sources" must be an array`);
    } else {
      for (const entry of config.sources) {
        if (typeof entry?.source !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(entry.source)) {
          errors.push(`${name}: source "${entry?.source}" is not "owner/repo"`);
        }
        if (!isStringArray(entry?.skills)) errors.push(`${name}: skills of "${entry?.source}" must be a string array`);
      }
    }
  }
  for (const rule of config.rules ?? []) {
    const script = join(bundlesDir, name, 'rules', `${rule}.sh`);
    if (!existsSync(script)) errors.push(`${name}: declared rule "${rule}" has no rules/${rule}.sh`);
  }
}

// Resolving all bundles at once catches include cycles, unknown includes, and
// rule-file name collisions across the flat .claude/rules/ namespace.
try {
  resolveBundles(names, bundlesDir);
} catch (error) {
  errors.push(error.message);
}

if (errors.length) {
  for (const error of errors) console.error(`validate-bundles: ${error}`);
  process.exit(1);
}
console.log(`validate-bundles: ${names.length} bundles ok`);
