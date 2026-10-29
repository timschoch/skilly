#!/usr/bin/env node
// The Engine CLI: node .skilly/engine/bin/skilly.js add|remove <bundle-or-skill...>
// It writes files and prints the Sync report. You review and commit them.
import { runVerb } from '../lib/add-remove.js';

const VERBS = ['add', 'remove'];
const [verb, ...names] = process.argv.slice(2);
if (!VERBS.includes(verb)) {
  console.error(`usage: node .skilly/engine/bin/skilly.js ${VERBS.join('|')} <bundle-or-skill...>`);
  process.exit(2);
}

try {
  const report = runVerb(verb, names, { cwd: process.cwd() });
  const list = (items) => (items.length ? items.join(', ') : 'none');
  console.log(`Release: ${report.release.before ?? 'none'} -> ${report.release.after}`);
  console.log(`skills added: ${list(report.skills.added)}`);
  console.log(`skills removed: ${list(report.skills.removed)}`);
  if (report.bundles.removed.length) console.log(`Bundles the Release dropped: ${list(report.bundles.removed)}`);
  console.log(`files written (${report.files.length}):`);
  for (const file of report.files) console.log(`  ${file}`);
  if (report.files.length) console.log('Review the files, then commit them.');
} catch (error) {
  console.error(`skilly: ${error.message}`);
  process.exit(1);
}
