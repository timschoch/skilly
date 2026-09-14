import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HUB_REPO } from './constants.js';

export const CALLER_WORKFLOW_PATH = join('.github', 'workflows', 'skilly-sync.yml');

// Named, not `secrets: inherit`: inherit passes nothing when the consumer's
// owner differs from the hub's, and the App token step then fails.
const SECRETS_BLOCK = `    secrets:
      SKILLY_APP_ID: \${{ secrets.SKILLY_APP_ID }}
      SKILLY_APP_PRIVATE_KEY: \${{ secrets.SKILLY_APP_PRIVATE_KEY }}`;
const INHERIT_LINE = /^ {4}secrets: inherit$/m;

// A real file — symlinked workflows never run. Random cron minute per repo.
const template = (minute) => `name: skilly sync
on:
  schedule: [{ cron: "${minute} 3 * * *" }]
  workflow_dispatch: {}
  pull_request: {}
permissions:
  contents: write
  pull-requests: write
jobs:
  skilly:
    uses: ${HUB_REPO}/.github/workflows/sync.yml@main
${SECRETS_BLOCK}
`;

// Swaps `secrets: inherit` for the named block in an existing caller.
// Returns true when changed.
export function healCallerSecrets(cwd) {
  const path = join(cwd, CALLER_WORKFLOW_PATH);
  if (!existsSync(path)) return false;
  const before = readFileSync(path, 'utf8');
  const after = before.replace(INHERIT_LINE, SECRETS_BLOCK);
  if (after === before) return false;
  writeFileSync(path, after);
  return true;
}

// Returns true when it wrote the file; existing files are the repo's.
export function scaffoldCallerWorkflow(cwd) {
  const path = join(cwd, CALLER_WORKFLOW_PATH);
  if (existsSync(path)) return false;
  mkdirSync(join(cwd, '.github', 'workflows'), { recursive: true });
  writeFileSync(path, template(Math.floor(Math.random() * 60)));
  return true;
}

// Only set when a bundle pulls private sources from another owner; the
// workflow input defaults to the repo owner. Returns true when changed.
export function setPrivateOwner(cwd, owner) {
  const path = join(cwd, CALLER_WORKFLOW_PATH);
  const healed = healCallerSecrets(cwd);
  const before = readFileSync(path, 'utf8');
  let after;
  if (/^ {6}private-owner: .*$/m.test(before)) {
    after = before.replace(/^ {6}private-owner: .*$/m, `      private-owner: ${owner}`);
  } else {
    after = before.replace(/^ {4}uses: .*$/m, (uses) => `${uses}\n    with:\n      private-owner: ${owner}`);
    if (after === before) throw new Error(`cannot place private-owner in ${CALLER_WORKFLOW_PATH} — no \`uses:\` line`);
  }
  if (after === before) return healed;
  writeFileSync(path, after);
  return true;
}
