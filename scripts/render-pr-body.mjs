// Render the Sync PR body from the update --report file — structured data,
// never grepped log text (design record, #17). The removals marker is the
// contract the gate job's merge step reads: a Sync PR with removals always
// waits for a human.
import { readFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) {
  console.error('usage: render-pr-body.mjs <report.json>');
  process.exit(1);
}
const { removed = [], added = [], updated = [] } = JSON.parse(readFileSync(path, 'utf8'));

const lines = ['Nightly skilly update.'];
if (removed.length) {
  lines.push('', '<!-- skilly:removals -->', '## ⚠️ Removed', ...removed.map((name) => `- ${name}`));
}
if (added.length) lines.push('', '## Added', ...added.map((name) => `- ${name}`));
if (updated.length) lines.push('', '## Updated', ...updated.map((name) => `- ${name}`));
if (!removed.length && !added.length && !updated.length) lines.push('', 'No skill changes — rules refresh only.');

process.stdout.write(lines.join('\n') + '\n');
