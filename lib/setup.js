import {
  readFileSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmdirSync,
  lstatSync,
  symlinkSync,
  readlinkSync,
  unlinkSync,
  existsSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { addFormatterIgnores } from './formatter-ignores.js';
import { spawnSync } from 'node:child_process';
import { ensureBranch } from './ensure-branch.js';
import { commit } from './commit.js';
import { run } from './run.js';
import { updateRules } from './update-rules.js';
import { scaffoldCallerWorkflow, healCallerSecrets, CALLER_WORKFLOW_PATH } from './caller-workflow.js';
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

// One skills folder for every agent: .agents/skills holds the files,
// .claude/skills is a symlink to it. The skills CLI writes through the link.
export function linkSkillsDir(cwd) {
  const agentsDir = join(cwd, '.agents', 'skills');
  const claudeDir = join(cwd, '.claude', 'skills');
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(join(cwd, '.claude'), { recursive: true });
  const stat = (() => {
    try {
      return lstatSync(claudeDir);
    } catch {
      return null;
    }
  })();
  if (stat?.isSymbolicLink()) return false;
  if (stat) {
    for (const entry of readdirSync(claudeDir)) {
      const from = join(claudeDir, entry);
      const to = join(agentsDir, entry);
      if (lstatSync(from).isSymbolicLink()) {
        // Older skilly linked each skill on its own into .agents/skills; the dir link covers those.
        const target = resolve(claudeDir, readlinkSync(from));
        if (target !== to)
          throw new Error(`.claude/skills/${entry} links to ${target}, not .agents/skills — move it by hand`);
        unlinkSync(from);
        continue;
      }
      if (existsSync(to))
        throw new Error(`.claude/skills/${entry} and .agents/skills/${entry} both exist — merge them by hand`);
      renameSync(from, to);
    }
    rmdirSync(claudeDir);
  }
  symlinkSync(join('..', '.agents', 'skills'), claudeDir);
  return true;
}

// docs/flows user.mmd, SKILLY SETUP — the one-time bootstrap, before any
// skill exists here: secrets, .skilly/config.json (no bundles), caller workflow,
// the setup-project skill, commit. Secrets live here, not in a skill.
export async function setup({ cwd = process.cwd(), bundlesDir }) {
  await ensureBranch(cwd);
  if (linkSkillsDir(cwd)) console.log('linked .claude/skills -> .agents/skills');
  setSecrets(cwd);

  if (skillyFile.migrate(cwd)) console.log(`moved .skilly.json → ${skillyFile.CONFIG_PATH}`);
  if (skillyFile.create(cwd)) console.log(`wrote ${skillyFile.CONFIG_PATH} (no bundles yet)`);
  if (scaffoldCallerWorkflow(cwd)) console.log(`wrote ${CALLER_WORKFLOW_PATH}`);
  else if (healCallerSecrets(cwd)) console.log(`named the App secrets in ${CALLER_WORKFLOW_PATH}`);
  addFormatterIgnores(cwd);

  const { missing } = skillsCli.add(cwd, HUB_REPO, ['setup-project']);
  if (missing.length) throw new Error('could not install the setup-project skill');
  updateRules(cwd, 'setup-project', join(cwd, '.claude', 'skills', 'setup-project'));

  commit(cwd, 'chore: set up skilly');
  console.log('\nskilly set up ✅');

  // Hand off into the next flow step. TTY only — CI stays put.
  if (process.stdin.isTTY) {
    console.log('launching Claude Code (opus) with /setup-project …');
    const result = spawnSync('claude', ['--model', 'opus', '/setup-project'], { cwd, stdio: 'inherit' });
    if (result.error) console.log('claude not found on PATH — run /setup-project in Claude Code yourself');
  } else {
    console.log('next: run /setup-project in Claude Code');
  }
}
