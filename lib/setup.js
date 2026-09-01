import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureBranch } from './ensure-branch.js';
import { commit } from './commit.js';
import { run } from './run.js';
import { updateRules } from './update-rules.js';
import { scaffoldCallerWorkflow, CALLER_WORKFLOW_PATH } from './caller-workflow.js';
import { HUB_REPO, SKILLY_APP_ID, SKILLY_APP_PEM } from './constants.js';
import * as skillyFile from './skilly-file.js';
import * as skillsCli from './skills-cli.js';

function setSecrets(cwd) {
  const present = run('gh', ['secret', 'list', '--json', 'name', '--jq', '.[].name'], { cwd }).split('\n');
  const set = (name, args, input) => {
    if (present.includes(name)) return console.log(`secret ${name} already set — skip`);
    run('gh', ['secret', 'set', name, ...args], { cwd, input });
    console.log(`set secret ${name}`);
  };
  set('SKILLY_APP_ID', ['--body', SKILLY_APP_ID]);
  set('SKILLY_APP_PRIVATE_KEY', [], readFileSync(SKILLY_APP_PEM, 'utf8'));
}

// Skilly-owned files are not the consumer's code — keep its formatter off
// them, or every Sync PR fails the consumer's own CI (design record, #17).
const SKILLY_IGNORES = ['.skilly.json', 'skills-lock.json', '.claude/rules/**', '.claude/skills/**', '.agents/**'];

export function addFormatterIgnores(cwd) {
  const biomePath = ['biome.json', 'biome.jsonc'].map((f) => join(cwd, f)).find(existsSync);
  if (biomePath) {
    if (biomePath.endsWith('.jsonc')) {
      console.log(`biome.jsonc found — add these to its ignore list yourself: ${SKILLY_IGNORES.join(', ')}`);
    } else {
      const config = JSON.parse(readFileSync(biomePath, 'utf8'));
      config.files ??= {};
      if (Array.isArray(config.files.includes)) {
        // Biome 2.x: negated patterns in files.includes
        for (const path of SKILLY_IGNORES) {
          if (!config.files.includes.includes(`!${path}`)) config.files.includes.push(`!${path}`);
        }
      } else {
        // Biome 1.x: files.ignore
        config.files.ignore = [...new Set([...(config.files.ignore ?? []), ...SKILLY_IGNORES])];
      }
      writeFileSync(biomePath, JSON.stringify(config, null, 2) + '\n');
      console.log('added skilly-owned files to the biome ignore list');
    }
  }
  const prettierIgnore = join(cwd, '.prettierignore');
  if (existsSync(prettierIgnore)) {
    const lines = readFileSync(prettierIgnore, 'utf8').split('\n');
    const missing = SKILLY_IGNORES.filter((path) => !lines.includes(path));
    if (missing.length) {
      appendFileSync(prettierIgnore, `\n# skilly-owned files\n${missing.join('\n')}\n`);
      console.log('added skilly-owned files to .prettierignore');
    }
  }
}

// docs/flows user.mmd, SKILLY SETUP — the one-time bootstrap, before any
// skill exists here: secrets, .skilly.json (no bundles), caller workflow,
// the setup-project skill, commit. Secrets live here, not in a skill.
export async function setup({ cwd = process.cwd(), bundlesDir }) {
  await ensureBranch(cwd);
  setSecrets(cwd);

  if (skillyFile.create(cwd)) console.log('wrote .skilly.json (no bundles yet)');
  if (scaffoldCallerWorkflow(cwd)) console.log(`wrote ${CALLER_WORKFLOW_PATH}`);
  addFormatterIgnores(cwd);

  const { missing } = skillsCli.add(cwd, HUB_REPO, ['setup-project']);
  if (missing.length) throw new Error('could not install the setup-project skill');
  updateRules(cwd, 'setup-project', join(cwd, '.claude', 'skills', 'setup-project'));

  commit(cwd, 'chore: set up skilly');
  console.log('\nskilly set up ✅ — next: run /setup-project in Claude Code');
}
