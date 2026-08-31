// Workflow helper: set status.skills fields in the consumer's .skilly.json.
// `status.skills` is sync-owned and tracks the skills CLI only (docs/spec-v1.md).
//   --last-update        set status.skills.lastUpdate to today (ISO date)
//   --pr <url>           set status.skills.pr
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const skilly = JSON.parse(readFileSync('.skilly.json', 'utf8'));
const skills = { ...skilly.status?.skills };

if (args.includes('--last-update')) skills.lastUpdate = new Date().toISOString().slice(0, 10);
const prIndex = args.indexOf('--pr');
if (prIndex !== -1) {
  if (!args[prIndex + 1]) throw new Error('--pr needs a URL');
  skills.pr = args[prIndex + 1];
}

skilly.status = { ...skilly.status, skills };
writeFileSync('.skilly.json', JSON.stringify(skilly, null, 2) + '\n');
