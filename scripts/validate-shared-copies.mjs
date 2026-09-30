#!/usr/bin/env node
// A skill must work alone, so code two skills share ships as one copy per
// skill. The first path in each group is the source; every other path must
// match it byte for byte. Edit the source, then copy it over the others.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GROUPS = [
  [
    'bundles/workflow/skills/naming/scripts/merge-config.mjs',
    'bundles/workflow/skills/verify/scripts/merge-config.mjs',
  ],
];

// The copies that differ from their source, as repo-relative paths.
export function validateSharedCopies(root, read = (path) => readFileSync(path, 'utf8')) {
  const drifted = [];
  for (const [source, ...copies] of GROUPS) {
    const expected = read(join(root, source));
    for (const copy of copies) if (read(join(root, copy)) !== expected) drifted.push(copy);
  }
  return drifted;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const drifted = validateSharedCopies(process.cwd());
  for (const copy of drifted) console.error(`${copy} differs from its source — copy the source over it`);
  if (drifted.length) process.exit(1);
  console.log(`shared copies: ${GROUPS.length} group(s) identical`);
}
