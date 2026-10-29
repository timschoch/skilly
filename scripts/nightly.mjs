// The Hub nightly (ADR-0008 decisions 6, 10 and 12). Hub-only code: the App
// key, the installation list, the owner allowlist and the loop. Each Consumer
// gets the delivery of the newest Release's Engine, the same code `skilly sync`
// runs, with its account's installation token in GH_TOKEN.
// Usage: nightly.mjs [--dry-run] [--repo <owner/name>]
// Env: SKILLY_APP_ID, SKILLY_APP_PRIVATE_KEY, GH_TOKEN (reads the Hub's Releases).
import { spawnSync } from 'node:child_process';
import { createSign } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { cloneRelease, latestRelease } from '../engine/lib/add-remove.js';
import { HUB_REPO } from '../engine/lib/constants.js';
import { run } from '../engine/lib/run.js';

// The accounts whose installs the nightly syncs. Any account can install the
// App; an install by anyone else is ignored.
export const OWNERS = ['timschoch', 'admin-laicadev', 'swissdesign-md'];
export const EDITED_ENGINE_TITLE = 'Nightly Sync paused: the skilly Engine was edited by hand';

// A GitHub App JWT: RS256, issued 60 s back for clock drift, valid 9 minutes.
export function appJwt(appId, privateKey, now = Date.now()) {
  const toBase64Url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const iat = Math.floor(now / 1000) - 60;
  const unsigned = `${toBase64Url({ alg: 'RS256', typ: 'JWT' })}.${toBase64Url({ iat, exp: iat + 600, iss: appId })}`;
  return `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url')}`;
}

const sameName = (left, right) => left.toLowerCase() === right.toLowerCase();
const jsonLines = (output) =>
  output
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

function isConsumer(gh, repo, token) {
  try {
    gh(['api', `repos/${repo}/contents/.skilly/config.json`, '--jq', '.path'], token);
    return true;
  } catch (error) {
    if (/HTTP 404/.test(error.message)) return false;
    throw error;
  }
}

function editedEngineBody(release) {
  return [
    'The Hub nightly skips this repo: `.skilly/engine/` no longer matches the hash in `.skilly/engine.json`. The other Consumers still sync.',
    '',
    'CI keeps running the edited Engine. That is your choice.',
    '',
    'To sync again, undo the edits in `.skilly/engine/` on the default branch. `git log -- .skilly/engine` shows them. The next nightly then syncs this repo, and you can close this issue.',
    '',
    `Newest Release: ${release}. Checked: ${new Date().toISOString().slice(0, 10)}.`,
  ].join('\n');
}

// One issue per Consumer: the open one is updated, never a second one opened.
function reportEditedEngine(gh, repo, token, release) {
  const search = ['--search', `"${EDITED_ENGINE_TITLE}" in:title`, '--json', 'number,title'];
  const issues = JSON.parse(gh(['issue', 'list', '--repo', repo, '--state', 'open', ...search], token));
  const open = issues.find(({ title }) => title === EDITED_ENGINE_TITLE);
  const body = editedEngineBody(release);
  if (open) gh(['issue', 'edit', String(open.number), '--repo', repo, '--body', body], token);
  else gh(['issue', 'create', '--repo', repo, '--title', EDITED_ENGINE_TITLE, '--body', body], token);
}

// app: { installations() -> [{ id, owner }], token(id) }. gh(args, token).
// clone(repo, token) -> { dir, cleanup }. engineEdited(dir). deliver({ dir, token, branch }).
// Returns the repos synced, the repos with an edited Engine and the failures.
export function nightly({ app, gh, clone, engineEdited, deliver, release, only, dryRun = false, log = console.log }) {
  const result = { synced: [], edited: [], failed: [] };
  for (const { id, owner } of app.installations()) {
    if (!OWNERS.some((allowed) => sameName(allowed, owner))) {
      log(`${owner}: not on the owner allowlist, ignored`);
      continue;
    }
    const listing = ['api', '--paginate', '/installation/repositories', '--jq'];
    const repos = jsonLines(
      gh(
        [...listing, '.repositories[] | select(.archived | not) | {name: .full_name, branch: .default_branch}'],
        app.token(id),
      ),
    );
    for (const repo of repos) {
      if (sameName(repo.name, HUB_REPO) || (only && !sameName(repo.name, only))) continue;
      // A fresh token per Consumer: one token lives an hour, a full run can take longer.
      const token = app.token(id);
      let checkout = null;
      try {
        if (!isConsumer(gh, repo.name, token)) continue;
        checkout = clone(repo, token);
        if (engineEdited(checkout.dir)) {
          if (!dryRun) reportEditedEngine(gh, repo.name, token, release);
          log(`${repo.name}: Engine edited by hand, skipped`);
          result.edited.push(repo.name);
          continue;
        }
        if (!dryRun) deliver({ dir: checkout.dir, token, branch: repo.branch });
        log(`${repo.name}: ${dryRun ? 'would sync' : 'synced'}`);
        result.synced.push(repo.name);
      } catch (error) {
        log(`${repo.name}: failed: ${error.message}`);
        result.failed.push({ repo: repo.name, error: error.message });
      } finally {
        checkout?.cleanup();
      }
    }
  }
  return result;
}

async function main() {
  const { values } = parseArgs({
    options: { 'dry-run': { type: 'boolean', default: false }, repo: { type: 'string' } },
  });
  const { SKILLY_APP_ID: appId, SKILLY_APP_PRIVATE_KEY: key } = process.env;
  if (!appId || !key) throw new Error('SKILLY_APP_ID and SKILLY_APP_PRIVATE_KEY must be set');

  // A fresh JWT per call: one lives 9 minutes, a full run can take longer.
  const appApi = (args) => run('gh', ['api', '-H', `Authorization: Bearer ${appJwt(appId, key)}`, ...args]);
  const gh = (args, token) => run('gh', args, { env: { GH_TOKEN: token } });
  const app = {
    installations: () =>
      jsonLines(appApi(['--paginate', '/app/installations', '--jq', '.[] | {id, owner: .account.login}'])),
    token: (id) => {
      const token = appApi(['--method', 'POST', `/app/installations/${id}/access_tokens`, '--jq', '.token']);
      if (process.env.GITHUB_ACTIONS) console.log(`::add-mask::${token}`);
      return token;
    },
  };

  const snapshot = cloneRelease(latestRelease());
  try {
    const engine = join(snapshot.dir, 'engine');
    if (!values['dry-run'] && !existsSync(join(engine, 'lib', 'delivery.js'))) {
      throw new Error(`Release ${snapshot.release} has no Sync delivery. Ship a newer Release first.`);
    }
    const { engineState } = await import(pathToFileURL(join(engine, 'lib', 'sync.js')).href);
    const result = nightly({
      app,
      gh,
      release: snapshot.release,
      only: values.repo,
      dryRun: values['dry-run'],
      clone: (repo, token) => {
        const dir = mkdtempSync(join(tmpdir(), 'skilly-consumer-'));
        // The token rides in the remote URL: the delivery pushes to origin with
        // it. A failed clone names the URL, so its error hides the token.
        try {
          run('git', [
            'clone',
            '--quiet',
            '--depth',
            '1',
            `https://x-access-token:${token}@github.com/${repo.name}.git`,
            dir,
          ]);
        } catch (error) {
          rmSync(dir, { recursive: true, force: true });
          throw new Error(error.message.replaceAll(token, '***'));
        }
        return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
      },
      engineEdited: (dir) => engineState(dir).edited,
      // The Release's own delivery, as `skilly sync` runs it. DEFAULT_BRANCH:
      // the Engine would read the Hub's event payload instead.
      deliver: ({ dir, token, branch }) => {
        const args = [join(engine, 'bin', 'skilly.js'), 'deliver', snapshot.dir, snapshot.release];
        const env = { ...process.env, GH_TOKEN: token, DEFAULT_BRANCH: branch };
        const { status } = spawnSync('node', args, { cwd: dir, stdio: 'inherit', env });
        if (status !== 0) throw new Error(`delivery exited with ${status}`);
      },
    });
    const synced = values['dry-run'] ? 'to sync' : 'synced';
    console.log(
      `Release ${snapshot.release}: ${result.synced.length} ${synced}, ${result.edited.length} edited Engine, ${result.failed.length} failed`,
    );
    const found = result.synced.length + result.edited.length + result.failed.length;
    if (values.repo && !found) console.error(`${values.repo}: no Consumer of an allowed owner has this name`);
    if (result.failed.length || (values.repo && !found)) process.exitCode = 1;
  } finally {
    snapshot.cleanup();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
