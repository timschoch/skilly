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
  mkdtempSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addFormatterIgnores } from './formatter-ignores.js';
import { spawnSync } from 'node:child_process';
import { prepareBranch } from './prepare-branch.js';
import { commit } from './commit.js';
import { run, tryRun } from './run.js';
import { updateRules } from './update-rules.js';
import { scaffoldCallerWorkflow, healCallerSecrets, CALLER_WORKFLOW_PATH } from './caller-workflow.js';
import { HUB_REPO } from './constants.js';
import { fetchInstalledApp } from './github-app.js';
import * as skillyFile from './skilly-file.js';
import * as skillsCli from './skills-cli.js';

const APP_SECRETS = ['SKILLY_APP_ID', 'SKILLY_APP_PRIVATE_KEY'];

// Org secrets win: every repo of the org gets the App without the key on this
// machine. Otherwise the owner's App (github-app.js) overwrites the repo secrets.
async function setAppSecrets(cwd) {
  const [owner, repo] = run('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], {
    cwd,
  }).split('/');
  const orgSecrets = (
    tryRun('gh', ['api', `repos/${owner}/${repo}/actions/organization-secrets`, '--jq', '.secrets[].name'], {
      cwd,
    }) ?? ''
  ).split('\n');
  if (APP_SECRETS.every((name) => orgSecrets.includes(name))) {
    console.log(`org secrets ${APP_SECRETS.join(', ')} reach this repo — skip`);
    console.log(`the org's App must be installed on ${repo} (all repositories covers it)`);
    return;
  }
  const app = await fetchInstalledApp(owner, repo);
  run('gh', ['secret', 'set', 'SKILLY_APP_ID', '--body', String(app.id)], { cwd });
  run('gh', ['secret', 'set', 'SKILLY_APP_PRIVATE_KEY'], { cwd, input: readFileSync(app.keyPath, 'utf8') });
  console.log(`set secrets ${APP_SECRETS.join(', ')} from App ${app.slug}`);
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

const STACK_FILES = [
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'go.mod',
  'Cargo.toml',
  'Gemfile',
  'composer.json',
];

// New = no stack file and a README with no text beyond its headings.
export function isNewRepo(cwd) {
  if (STACK_FILES.some((file) => existsSync(join(cwd, file)))) return false;
  const readme = join(cwd, 'README.md');
  return !existsSync(readme) || !readFileSync(readme, 'utf8').replace(/^#.*$/gm, '').trim();
}

// The browser interview (lib/interview/): the user answers everything, then Claude runs
// the whole setup AFK, `skilly setup` included. By then the repo is not new, so no loop.
function startInterview(cwd) {
  const server = fileURLToPath(new URL('./interview/server.js', import.meta.url));
  const mcpConfig = join(mkdtempSync(join(tmpdir(), 'skilly-interview-')), 'mcp.json');
  writeFileSync(
    mcpConfig,
    JSON.stringify({ mcpServers: { 'setup-interview': { command: process.execPath, args: [server] } } }),
  );
  console.log('new repo: the setup interview opens in the browser. Answer there; keep this terminal open.');
  const result = spawnSync(
    'claude',
    ['--model', 'opus', '--mcp-config', mcpConfig, '--dangerously-load-development-channels', 'server:setup-interview'],
    { cwd, stdio: 'inherit' },
  );
  if (result.error) throw new Error('claude not found on PATH — install Claude Code, then run skilly setup again');
}

// .temp/ is every repo's scratch space for agents: throwaway scripts, commit
// messages, PR bodies, skill state. Returns true when it added the entry.
export function ignoreTemp(cwd) {
  const path = join(cwd, '.gitignore');
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (/^\/?\.temp\/?$/m.test(text)) return false;
  appendFileSync(path, `${text && !text.endsWith('\n') ? '\n' : ''}.temp/\n`);
  return true;
}

// docs/flows user.mmd, SKILLY SETUP — the one-time bootstrap, before any
// skill exists here: secrets, .skilly/config.json (no bundles), caller workflow,
// the setup-project skill, commit. Secrets live here, not in a skill.
// A new repo in a terminal gets the setup interview instead.
export async function setup({ cwd = process.cwd(), bundlesDir }) {
  if (process.stdin.isTTY && isNewRepo(cwd)) {
    // Creating or installing the App needs this terminal and the browser; the
    // interview runs setup again without either. No GitHub repo yet: the
    // interview creates it, and its setup run names the missing App.
    if (tryRun('gh', ['repo', 'view', '--json', 'name'], { cwd })) await setAppSecrets(cwd);
    return startInterview(cwd);
  }
  await prepareBranch(cwd);
  if (linkSkillsDir(cwd)) console.log('linked .claude/skills -> .agents/skills');
  await setAppSecrets(cwd);

  if (skillyFile.migrate(cwd)) console.log(`moved .skilly.json → ${skillyFile.CONFIG_PATH}`);
  if (skillyFile.create(cwd)) console.log(`wrote ${skillyFile.CONFIG_PATH} (no bundles yet)`);
  if (scaffoldCallerWorkflow(cwd)) console.log(`wrote ${CALLER_WORKFLOW_PATH}`);
  else if (healCallerSecrets(cwd)) console.log(`named the App secrets in ${CALLER_WORKFLOW_PATH}`);
  addFormatterIgnores(cwd);
  if (ignoreTemp(cwd)) console.log('added .temp/ to .gitignore');

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
