// PROTOTYPE end-to-end check: real server, real headless Chrome clicking the page, fake Claude answering with delays.
// Run: npm run e2e (screenshots land in .e2e/). Exit code 1 on any failed check.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TOKEN = 'e2e', OUT = new URL('./.e2e/', import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok, label) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failures++; };

// Fake Claude: answers each channel event like the real session, with a delay so busy states are visible.
const claude = new Client({ name: 'fake-claude', version: '0' });
const call = (name, args = {}) => claude.callTool({ name, arguments: args });
let checkRound = 0;
claude.fallbackNotificationHandler = async (n) => {
  const kind = n.params?.meta?.kind;
  await sleep(1500);
  if (kind === 'concept') {
    await call('update_interview', { readme: '# Lego Archive\n\nPhotos of set instructions, browsable by set.' });
    await call('reply', { text: 'README written.' });
  } else if (kind === 'prepare') {
    await call('set_plan', { plan: '1. Create the repo.\n2. Scaffold the app.' });
    await call('reply', { text: 'No open questions.' });
  } else if (kind === 'check') {
    checkRound++;
    await call('set_checks', { checks: checkRound === 1
      ? [{ label: 'GitHub: timschoch', ok: true }, { label: 'Vercel: not logged in', ok: false, fix: 'vercel login' }]
      : [{ label: 'GitHub: timschoch', ok: true }, { label: 'Vercel: timschoch', ok: true }] });
    await call('reply', { text: 'Checks done.' });
  } else if (kind === 'run') {
    await call('reply', { text: 'Dry run done.' });
  }
};
// Port 0 = a free port; the server prints the page URL on stderr.
const transport = new StdioClientTransport({
  command: 'node', args: ['server.mjs'], cwd: new URL('.', import.meta.url).pathname, stderr: 'pipe',
  env: { ...process.env, INTERVIEW_TOKEN: TOKEN, INTERVIEW_PORT: '0', INTERVIEW_NO_OPEN: '1', INTERVIEW_FOLDER: 'lego-archive' },
});
const pageUrl = new Promise((resolve) => transport.stderr.on('data', (d) => { const m = String(d).match(/http:\/\/\S+/); if (m) resolve(m[0]); }));
await claude.connect(transport);

// Headless Chrome over the DevTools protocol.
// Port 0 = Chrome picks a free port and writes it to DevToolsActivePort, so a stale Chrome can't answer.
const profile = mkdtempSync(join(tmpdir(), 'e2e-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--window-size=1400,900', 'about:blank'], { stdio: 'ignore' });
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  if (!existsSync(join(profile, 'DevToolsActivePort'))) continue;
  const cdpPort = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
  target = await fetch(`http://127.0.0.1:${cdpPort}/json`).then((r) => r.json()).then((t) => t.find((x) => x.type === 'page')).catch(() => null);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let nextId = 0;
const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m.result); pending.delete(m.id); });
const cdp = (method, params = {}) => new Promise((r) => { const id = ++nextId; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const js = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
const shot = async (name) => writeFileSync(`${OUT}${name}.png`, Buffer.from((await cdp('Page.captureScreenshot')).data, 'base64'));
const click = (text, scope = 'document') => js(`(() => { const b = [...${scope}.querySelectorAll('button')].find((x) => x.textContent.includes(${JSON.stringify(text)}));
  if (!b || b.disabled) return false; b.click(); return true; })()`);
const busyVisible = () => js(`(() => { const b = document.querySelector('.msg.busy'), log = document.getElementById('log');
  if (!b) return false; const r = b.getBoundingClientRect(), l = log.getBoundingClientRect(); return r.top >= l.top && r.bottom <= l.bottom; })()`);
const waitIdle = async (seconds = 10) => { for (let i = 0; i < seconds * 5 && await js(`!!document.querySelector('.msg.busy')`); i++) await sleep(200); };

await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp('Page.navigate', { url: await pageUrl });
await sleep(1000);

check(await js(`document.querySelector('.card.current .card-head').textContent.includes('App concept')`), 'App concept is the current section');
check(!(await click('Looks good')), 'Looks good is off before the README exists');

await js(`document.getElementById('goal').value = 'We photograph Lego instructions.'`);
check(await click('Generate README'), 'Generate clicks');
await sleep(300);
check(await busyVisible(), 'busy bubble visible while Claude writes the README');
await waitIdle();

for (let i = 0; i < 5; i++) { await click('Looks good'); await sleep(300); }
check(await js(`document.querySelectorAll('.card.done').length === document.querySelectorAll('.card').length`), 'all sections done');

check(await click('1. Prepare installation'), 'Prepare installation clicks');
check(await js(`[...document.querySelectorAll('button.step.busy')].some((b) => b.textContent.includes('prepares the plan'))`), 'step button says: prepares the plan');
await sleep(300);
check(await busyVisible(), 'busy bubble visible while Claude prepares');
await waitIdle();

// Simulate a stream that died while the tab sat open: the click must still react, and Claude's answer must still arrive.
await js(`events.close()`);
check(await click('2. Prepare AFK', `document.getElementById('log')`), 'Prepare AFK (chat) clicks');
check(await js(`[...document.querySelectorAll('button.step.busy')].some((b) => b.textContent.includes('checks the logins'))`), 'step button says: checks the logins');
await sleep(300);
await shot('checking');
check(await busyVisible(), 'busy bubble visible while Claude checks the logins');
check(await js(`!!document.querySelector('#log .step.busy .spin')`), 'chat step button shows a spinner');
await waitIdle(40);
await shot('checks-failed');
check(await js(`document.getElementById('log').textContent.includes('vercel login')`), 'fix command shown in chat after the dead stream reconnects');

check(await click('Check logins again', `document.getElementById('log')`), 'Check logins again clicks');
await sleep(300);
check(await busyVisible(), 'busy bubble visible on the re-check');
await waitIdle();
check(await click('3. Run AFK', `document.getElementById('log')`), 'Run AFK clicks');
check(await js(`[...document.querySelectorAll('button.step.busy')].some((b) => b.textContent.includes('runs the setup'))`), 'step button says: runs the setup');
await sleep(300);
await shot('running');
check(await busyVisible(), 'busy bubble visible while running');
await waitIdle();
await shot('done');

ws.close();
chrome.kill();
await claude.close();
console.log(failures ? `${failures} check(s) failed` : 'all checks passed', `· screenshots in ${OUT}`);
process.exit(failures ? 1 : 0);
