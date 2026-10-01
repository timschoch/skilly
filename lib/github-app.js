import { createSign, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { HUB_REPO } from './constants.js';
import { run } from './run.js';

// One GitHub App per owner account: skilly sync and release-please mint their
// tokens from it. The key never leaves the machine that holds it; every owner
// runs its own App, so no key is shared across accounts.
const CONFIG_DIR = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'skilly', 'apps');
const API = 'https://api.github.com';
const NAME_MAX_LENGTH = 34; // GitHub's limit for an App name
const INSTALL_POLL_MS = 3000;
const INSTALL_WAIT_MS = 10 * 60 * 1000;

// { id, slug, keyPath } per owner, or null. configDir is injected for tests.
export function findApp(owner, configDir = CONFIG_DIR) {
  const path = join(configDir, `${owner}.json`);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

export function setApp(owner, app, configDir = CONFIG_DIR) {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, `${owner}.json`), `${JSON.stringify(app, null, 2)}\n`);
}

// The short-lived App JWT that GitHub's App endpoints accept.
export function createJwt(app, now = Math.floor(Date.now() / 1000)) {
  const toBase64Url = (part) => Buffer.from(JSON.stringify(part)).toString('base64url');
  const body = `${toBase64Url({ alg: 'RS256', typ: 'JWT' })}.${toBase64Url({ iat: now - 60, exp: now + 540, iss: String(app.id) })}`;
  const signature = createSign('RSA-SHA256').update(body).sign(readFileSync(app.keyPath), 'base64url');
  return `${body}.${signature}`;
}

async function fetchAsApp(app, path) {
  return fetch(`${API}/${path}`, {
    headers: { Authorization: `Bearer ${createJwt(app)}`, Accept: 'application/vnd.github+json' },
  });
}

// installationPath: `repos/<owner>/<repo>/installation` or `users/<owner>/installation`.
export async function isInstalled(app, installationPath) {
  const response = await fetchAsApp(app, installationPath);
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`GitHub App ${app.slug}: ${installationPath} returned ${response.status}`);
  return true;
}

// Private: a key opens only the account that owns the App.
export function createManifest(owner, redirectUrl) {
  return {
    name: `skilly-${owner}`.slice(0, NAME_MAX_LENGTH),
    url: `https://github.com/${HUB_REPO}`,
    redirect_url: redirectUrl,
    public: false,
    default_permissions: { contents: 'write', pull_requests: 'write' },
    default_events: [],
    hook_attributes: { url: `https://github.com/${HUB_REPO}`, active: false },
  };
}

function openBrowser(url) {
  console.log(`open ${url}`);
  const [command, ...args] =
    process.platform === 'darwin'
      ? ['open', url]
      : process.platform === 'win32'
        ? ['cmd', '/c', 'start', '', url]
        : ['xdg-open', url];
  spawn(command, args, { stdio: 'ignore', detached: true })
    .on('error', () => {})
    .unref();
}

// GitHub App manifest flow: the browser posts the manifest, GitHub redirects
// back with a code, the code converts into the App's id, slug and key.
async function createApp(owner, configDir) {
  const kind = run('gh', ['api', `users/${owner}`, '--jq', '.type']);
  const newAppUrl =
    kind === 'Organization'
      ? `https://github.com/organizations/${owner}/settings/apps/new`
      : 'https://github.com/settings/apps/new';
  const state = randomUUID();
  const created = {};
  created.promise = new Promise((resolveApp, rejectApp) =>
    Object.assign(created, { resolve: resolveApp, reject: rejectApp }),
  );
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/') {
      const manifest = JSON.stringify(createManifest(owner, `http://127.0.0.1:${server.address().port}/callback`));
      response.setHeader('Content-Type', 'text/html');
      response.end(`<form id="app" method="post" action="${newAppUrl}?state=${state}">
<input type="hidden" name="manifest" value="${manifest.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}">
</form><script>document.getElementById('app').submit()</script>`);
      return;
    }
    if (url.pathname !== '/callback' || url.searchParams.get('state') !== state) {
      response.statusCode = 404;
      response.end();
      return;
    }
    try {
      const conversion = await fetch(`${API}/app-manifests/${url.searchParams.get('code')}/conversions`, {
        method: 'POST',
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!conversion.ok) throw new Error(`App manifest conversion returned ${conversion.status}`);
      const body = await conversion.json();
      if (body.owner.login !== owner) {
        throw new Error(
          `the browser created ${body.slug} under ${body.owner.login}, not ${owner}: delete it at ${body.html_url}/advanced, sign in as ${owner}, run skilly setup again`,
        );
      }
      response.end('skilly: App created. Close this tab and go back to the terminal.');
      created.resolve(body);
    } catch (error) {
      response.end(`skilly: ${error.message}`);
      created.reject(error);
    }
  });
  await new Promise((listening) => server.listen(0, '127.0.0.1', listening));
  console.log(`create the App under ${owner} in the browser (signed in as ${owner}):`);
  openBrowser(`http://127.0.0.1:${server.address().port}/`);
  try {
    const body = await created.promise;
    mkdirSync(configDir, { recursive: true });
    const keyPath = join(configDir, `${owner}.pem`);
    writeFileSync(keyPath, body.pem);
    chmodSync(keyPath, 0o600);
    return { id: body.id, slug: body.slug, keyPath };
  } finally {
    server.close();
  }
}

async function useExistingApp(readline) {
  const id = (await readline.question('App ID: ')).trim();
  const keyPath = resolve(
    (await readline.question('path to its private key (.pem): ')).trim().replace(/^~/, homedir()),
  );
  if (!existsSync(keyPath)) throw new Error(`no key at ${keyPath}`);
  const response = await fetchAsApp({ id, keyPath }, 'app');
  if (!response.ok) throw new Error(`App ${id} with that key: GitHub returned ${response.status}`);
  return { id, slug: (await response.json()).slug, keyPath };
}

// The owner's App, installed on owner/repo. Asks for it on first use (terminal
// only), then waits for the install. configDir is injected for tests.
export async function fetchInstalledApp(owner, repo, configDir = CONFIG_DIR) {
  let app = findApp(owner, configDir);
  if (!app) {
    if (!process.stdin.isTTY) {
      throw new Error(`no skilly GitHub App for ${owner} on this machine: run skilly setup in a terminal once`);
    }
    const readline = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await readline.question(
        `no skilly GitHub App for ${owner} on this machine.\n  1  create a new one (browser)\n  2  use an existing one (App ID + key)\n> `,
      );
      app = answer.trim() === '2' ? await useExistingApp(readline) : await createApp(owner, configDir);
    } finally {
      readline.close();
    }
    setApp(owner, app, configDir);
    console.log(`saved App ${app.slug} for ${owner} in ${configDir}`);
  }

  const installationPath = `repos/${owner}/${repo}/installation`;
  if (await isInstalled(app, installationPath)) return app;
  const installUrl = `https://github.com/apps/${app.slug}/installations/new`;
  if (!process.stdin.isTTY) throw new Error(`App ${app.slug} is not installed on ${owner}/${repo}: ${installUrl}`);
  console.log(`install ${app.slug} on ${owner} (all repositories, or at least ${repo}):`);
  openBrowser(installUrl);
  for (const deadline = Date.now() + INSTALL_WAIT_MS; Date.now() < deadline;) {
    await new Promise((wait) => setTimeout(wait, INSTALL_POLL_MS));
    if (await isInstalled(app, installationPath)) return app;
  }
  throw new Error(`App ${app.slug} is still not installed on ${owner}/${repo}: ${installUrl}`);
}
