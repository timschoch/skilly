// Render the Sync PR body from the update --report file — structured data,
// never grepped log text (design record, #17). Human-facing only: the gate's
// merge step reads removals from the commit subjects, never from this body
// (a body edit lands after the PR opens and would race the gate).
import { readFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) {
  console.error('usage: render-pr-body.mjs <report.json>');
  process.exit(1);
}
const { removed = [], added = [], updated = [] } = JSON.parse(readFileSync(path, 'utf8'));

const lines = ['Nightly skilly update.'];
if (removed.length) {
  lines.push('', '## ⚠️ Removed', ...removed.map((name) => `- ${name}`));
}
if (added.length) lines.push('', '## Added', ...added.map((name) => `- ${name}`));
if (updated.length) lines.push('', '## Updated', ...updated.map((name) => `- ${name}`));
if (!removed.length && !added.length && !updated.length) lines.push('', 'No skill changes — rules refresh only.');

process.stdout.write(lines.join('\n') + '\n');
