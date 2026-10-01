#!/usr/bin/env node
// .agents/skills must stay 1:1 with skills-lock.json. The skills CLI skips a
// source repo's agent-dir skills only when its own lock names them, and scans
// bundles/ only when that first pass finds nothing (skills@1.5.23,
// dist/cli.mjs discoverSkills). One unlocked folder here hides every bundle
// skill from every consumer. This check runs in the hub. A consumer that is
// also a source (Self-source, GLOSSARY.md) keeps its own skills in the repo;
// bundle resolution drops them, so they never reach its lock.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function validateAgentsLock(root) {
  const skillsDir = join(root, '.agents', 'skills');
  const dirs = existsSync(skillsDir)
    ? readdirSync(skillsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];
  const lockPath = join(root, 'skills-lock.json');
  const pins = existsSync(lockPath) ? Object.keys(JSON.parse(readFileSync(lockPath, 'utf8')).skills ?? {}) : [];
  return {
    dirs: dirs.length,
    pins: pins.length,
    unlocked: dirs.filter((dir) => !pins.includes(dir)).sort(),
    orphans: pins.filter((pin) => !dirs.includes(pin)).sort(),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { dirs, pins, unlocked, orphans } = validateAgentsLock(process.cwd());
  if (unlocked.length)
    console.error(`unlocked dirs in .agents/skills (hide bundles/ from consumers): ${unlocked.join(', ')}`);
  if (orphans.length) console.error(`pins without a dir: ${orphans.join(', ')}`);
  if (unlocked.length || orphans.length) process.exit(1);
  console.log(`agents-lock: ${dirs} dirs, ${pins} pins, 1:1`);
}
