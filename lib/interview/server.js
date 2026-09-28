#!/usr/bin/env node
// The setup interview for a new repo (lib/setup.js starts it): a Claude Code channel
// (research preview) that serves a two-column browser page: questions left, chat right.
// Browser → Claude: POST /event → notifications/claude/channel.
// Claude → browser: tools reply / update_interview → SSE /events.
// stdout belongs to MCP; log to stderr only.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// The page loads the same file; it sets globals.
const LOGIC_URL = new URL('./logic.js', import.meta.url);
await import(LOGIC_URL);
const { setupPlan, TOOLS, sections } = globalThis;

const PAGE = readFileSync(new URL('./page.html', import.meta.url), 'utf8');
const LOGIC = readFileSync(LOGIC_URL, 'utf8');
const TOKEN = process.env.INTERVIEW_TOKEN || randomBytes(16).toString('hex');
const log = (...args) => console.error('[setup-interview]', ...args);

// lib/setup.js starts the interview only for a new repo: no README, no stack. It may have a GitHub remote already.
function githubRemote() {
  try {
    return execFileSync('git', ['remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).match(/github\.com[/:]([^/]+\/[^/]+?)(\.git)?\s*$/)?.[1];
  } catch {
    return undefined;
  }
}
const remoteName = githubRemote();
const sit = {
  folder: process.env.INTERVIEW_FOLDER || basename(process.cwd()),
  remote: remoteName ? 'github' : 'none',
  remoteName,
  readme: 'none',
  stack: 'none',
  detectedTools: [],
};

// INTERVIEW_DRY_RUN=1 (the e2e test): Run AFK only lists the commands.
const REAL_RUN = process.env.INTERVIEW_DRY_RUN !== '1';

// Single source of truth. answers = only what the user or Claude set; the rest are defaults.
// phase: interview → preparing (Claude asks in chat) → planned (plan shown) → checking (Claude checks logins)
//        → planned again (a check failed) | ready (all checks pass) → running (AFK).
const state = {
  sit,
  answers: {},
  readme: '',
  changedByAgent: [],
  chat: [],
  working: false,
  phase: 'interview',
  plan: '',
  checks: [],
  realRun: REAL_RUN,
  confirmed: [],
};

// After step 1 the answers are locked; "1. Change answers" unlocks them and voids the plan and checks.
const LOCKED = ['planned', 'checking', 'ready', 'running'];

const resolved = () => setupPlan.resolve(sit, state.answers);
const currentSections = () => sections(sit, resolved(), state.confirmed);
// The user fills sections in order: answers go only to done or current sections.
const sectionOpen = (questionId) =>
  currentSections().some(
    (section) => section.status !== 'locked' && section.questions.some((question) => question.id === questionId),
  );

// Keep only answers to questions that exist, with a valid value. Returns the rejected ids.
function applyAnswers(input) {
  const rejected = [];
  for (const [id, value] of Object.entries(input ?? {})) {
    const question = setupPlan
      .questions(sit, { ...resolved(), ...state.answers })
      .find((candidate) => candidate.id === id && candidate.kind !== 'info');
    if (question?.kind === 'one' && question.options.includes(value)) state.answers[id] = value;
    else if (question?.kind === 'text' && typeof value === 'string') state.answers[id] = value;
    else if (question?.kind === 'multi' && Array.isArray(value))
      state.answers[id] = value.filter((toolId) => TOOLS.some((tool) => tool.id === toolId));
    else rejected.push(id);
  }
  return rejected;
}

const clients = new Set();
// A sign of life every 10 s: the page reconnects when it hears nothing for 25 s (a tab left open for hours can lose the stream silently).
setInterval(() => {
  for (const client of clients) client.write('event: ping\ndata: \n\n');
}, 10_000).unref();

function broadcast() {
  const data = `data: ${JSON.stringify(state)}\n\n`;
  for (const client of clients) client.write(data);
}

const mcp = new Server(
  { name: 'setup-interview', version: '0.0.1' },
  {
    capabilities: { experimental: { 'claude/channel': {} }, tools: {} },
    instructions: [
      'The user answers the skilly setup interview in a browser page. Their events arrive as <channel source="setup-interview" kind="...">.',
      'Every question stays visible in the page with a default; you only change answers.',
      'kind="concept": the user pressed Generate on the app concept. Call get_interview for the question ids, options and current answers.',
      'Then call update_interview once: readme (title = the appName answer, then the concept in 1-2 plain sentences) and the answers the concept justifies',
      '(tier, tools, marketing, ...). Leave the other answers alone. Then send one short reply: what you changed and why.',
      'kind="chat": a chat message. Answer with reply; change answers with update_interview if the user asks or an answer settles a question.',
      'Scope: only GitHub, Vercel and Neon get wired. Every other tool (PostHog, Trigger.dev, Langfuse, ...) gets its skilly Bundle only: no keys, no env vars, no checks.',
      'The otherTools answer names tools without a skilly Bundle: install the package if it is one, note it in the README stack, wire nothing.',
      'kind="prepare": the user pressed "1. Prepare installation". Call get_interview. If the README is empty, write it. Check the answers for gaps and conflicts.',
      'Ask every open question in ONE reply, numbered. Run nothing yet. When no question is open (now or after the user answers in chat),',
      'call set_plan with the numbered steps you will run. That locks the answers (update_interview fails until the user presses "1. Change answers")',
      'and unlocks "2. Prepare AFK".',
      'kind="check": the user pressed "2. Prepare AFK". Run the read-only checks yourself, only for what the plan needs: `gh auth status` (the chosen account),',
      '`vercel whoami` (Vercel), `neonctl me` (Neon), CLAUDE_CODE_OAUTH_TOKEN (only if tier is not sandbox: it becomes a repo secret after the repo exists, so',
      'check `claude setup-token` was run; the user pastes it at the run). Then call set_checks: one item per check with label, ok, and for a failed check',
      'fix = the exact terminal commands, one per line, ready to paste. A secret goes straight from the command into its store, never into the chat.',
      'Then one short reply. Never tell the user to "get a key" without the exact command or URL.',
      REAL_RUN
        ? 'kind="run": the user pressed "3. Run AFK" and left. This click is the approval for everything in the plan: create the repo, the Vercel project, the Neon' +
          ' database, push a branch and open ONE setup PR. Never merge. Ask nothing; decide with the defaults and note each decision. Post short progress with reply,' +
          ' and end with one reply: what ran, what failed, what waits for the user.'
        : 'kind="run": DRY RUN. Change nothing: no repo, no Vercel, no Neon, no files, no installs. Post each planned step with its exact command' +
          ' with reply, then one reply: what a real run would leave for the user.',
      'The user is NOT watching the terminal: every question and every message goes through reply. End every turn with reply: it clears the busy indicator.',
      'Write no summary or other text in the terminal: nobody reads it. After the last reply, end the turn without text.',
    ].join(' '),
  },
);

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'reply',
      description: 'Send a chat message to the user in the setup interview page. Ends the busy indicator.',
      inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    },
    {
      name: 'update_interview',
      description:
        'Set the README text and/or answers in the page. Only pass what changes. Answer ids and options come from get_interview.',
      inputSchema: {
        type: 'object',
        properties: {
          readme: { type: 'string', description: 'Full README.md text' },
          answers: {
            type: 'object',
            description: 'question id → value (one: an option, text: a string, multi: array of tool ids)',
          },
        },
      },
    },
    {
      name: 'get_interview',
      description: 'Read all questions (id, group, kind, options) and the current answers with defaults filled in.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'set_plan',
      description:
        'Only after "prepare" and when no question is open: show the plan in the page and unlock "2. Prepare AFK".',
      inputSchema: {
        type: 'object',
        properties: { plan: { type: 'string', description: 'The numbered steps you will run' } },
        required: ['plan'],
      },
    },
    {
      name: 'set_checks',
      description: 'Only after "check": show the login/secret checks. All ok unlocks "3. Run AFK".',
      inputSchema: {
        type: 'object',
        required: ['checks'],
        properties: {
          checks: {
            type: 'array',
            items: {
              type: 'object',
              required: ['label', 'ok'],
              properties: {
                label: { type: 'string', description: 'e.g. "GitHub: logged in as timschoch"' },
                ok: { type: 'boolean' },
                fix: { type: 'string', description: 'Failed checks only: exact terminal commands, one per line' },
              },
            },
          },
        },
      },
    },
    // Channel replies need these on every turn; without this, tool search defers them and Claude answers in the terminal.
  ].map((tool) => ({ ...tool, _meta: { 'anthropic/alwaysLoad': true } })),
}));

mcp.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments ?? {};
  switch (request.params.name) {
    case 'reply':
      state.chat.push({ from: 'agent', text: String(args.text) });
      state.working = false;
      broadcast();
      return { content: [{ type: 'text', text: 'sent' }] };
    case 'update_interview': {
      if (LOCKED.includes(state.phase))
        return {
          content: [
            {
              type: 'text',
              text: 'not updated: answers are locked after step 1; the user presses "1. Change answers" to unlock',
            },
          ],
          isError: true,
        };
      const rejected = applyAnswers(args.answers);
      if (typeof args.readme === 'string') state.readme = args.readme;
      state.changedByAgent = [
        ...Object.keys(args.answers ?? {}).filter((id) => !rejected.includes(id)),
        ...(typeof args.readme === 'string' ? ['readme'] : []),
      ];
      broadcast();
      return {
        content: [
          {
            type: 'text',
            text: rejected.length
              ? `updated; rejected (unknown id or invalid value): ${rejected.join(', ')}`
              : 'updated',
          },
        ],
      };
    }
    case 'get_interview': {
      const answers = resolved();
      const questions = setupPlan
        .questions(sit, answers)
        .filter((question) => question.kind !== 'info')
        .map(({ group, id, kind, text, options }) => ({ group, id, kind, text, ...(options && { options }) }));
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              questions,
              answers,
              toolIds: TOOLS.map((tool) => tool.id),
              readme: state.readme,
              phase: state.phase,
            }),
          },
        ],
      };
    }
    case 'set_plan':
      if (state.phase !== 'preparing')
        return {
          content: [
            {
              type: 'text',
              text: `not set: phase is ${state.phase}, the user must press "1. Prepare installation" first`,
            },
          ],
          isError: true,
        };
      state.phase = 'planned';
      state.plan = String(args.plan);
      state.chat.push({
        from: 'agent',
        text: `Plan${REAL_RUN ? '' : ' (dry run: I only list the commands)'}:\n${state.plan}`,
        action: 'check',
      });
      broadcast();
      return {
        content: [
          { type: 'text', text: 'plan posted in the chat with the "2. Prepare AFK" button; do not repeat it in reply' },
        ],
      };
    case 'set_checks': {
      if (state.phase !== 'checking')
        return {
          content: [
            { type: 'text', text: `not set: phase is ${state.phase}, the user must press "2. Prepare AFK" first` },
          ],
          isError: true,
        };
      const checks = Array.isArray(args.checks) ? args.checks : [];
      state.checks = checks.map((check) => ({
        label: String(check.label),
        ok: check.ok === true,
        fix: check.ok === true ? '' : String(check.fix ?? ''),
      }));
      const allOk = state.checks.length > 0 && state.checks.every((check) => check.ok);
      state.phase = allOk ? 'ready' : 'planned';
      state.chat.push({
        from: 'agent',
        text: allOk ? 'All logins ok.' : 'Some logins are missing.',
        checks: state.checks,
        action: allOk ? 'run' : 'check',
      });
      broadcast();
      return {
        content: [
          {
            type: 'text',
            text:
              (allOk ? 'all checks pass: "3. Run AFK" is unlocked' : 'fix commands shown with a "check again" button') +
              '; the checks are posted in the chat, do not repeat them in reply',
          },
        ],
      };
    }
  }
  throw new Error(`unknown tool: ${request.params.name}`);
});

function push(kind, content) {
  return mcp.notification({ method: 'notifications/claude/channel', params: { content, meta: { kind } } });
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body || '{}');
}

const http = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  // The logic file is static code with no state: the only route without the token.
  if (request.method === 'GET' && url.pathname === '/logic.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }).end(LOGIC);
    return;
  }
  if (url.searchParams.get('t') !== TOKEN) {
    response.writeHead(403).end('forbidden');
    return;
  }

  if (request.method === 'GET' && url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE);
  } else if (request.method === 'GET' && url.pathname === '/events') {
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    clients.add(response);
    response.write(`data: ${JSON.stringify(state)}\n\n`);
    request.on('close', () => clients.delete(response));
  } else if (request.method === 'POST' && url.pathname === '/event') {
    const event = await readJson(request);
    if (state.phase === 'running' && event.kind !== 'chat') {
      // After "Run AFK" nothing changes; only chat still reaches Claude.
    } else if (event.kind === 'answer' && !LOCKED.includes(state.phase) && sectionOpen(event.id)) {
      // Plain answers update state silently; Claude reads them with get_interview.
      applyAnswers({ [event.id]: event.value });
      state.changedByAgent = state.changedByAgent.filter((id) => id !== event.id);
    } else if (event.kind === 'unlock' && ['planned', 'ready'].includes(state.phase) && !state.working) {
      state.phase = 'interview';
      state.plan = '';
      state.checks = [];
    } else if (event.kind === 'confirm' && !LOCKED.includes(state.phase)) {
      // App concept is done only once the README exists.
      const current = currentSections().find((section) => section.status === 'current');
      const conceptWithoutReadme =
        current?.id === 'concept' && current.questions.some((question) => question.id === 'goal') && !state.readme;
      if (current?.id === event.group && !conceptWithoutReadme) state.confirmed.push(current.id);
    } else if (event.kind === 'generate' && !LOCKED.includes(state.phase)) {
      applyAnswers({ goal: String(event.text) });
      state.working = true;
      broadcast();
      await push('concept', String(event.text));
    } else if (event.kind === 'chat') {
      state.chat.push({ from: 'user', text: String(event.text) });
      state.working = true;
      broadcast();
      await push('chat', String(event.text));
    } else if (
      event.kind === 'prepare' &&
      ['interview', 'preparing'].includes(state.phase) &&
      currentSections().every((section) => section.status === 'done')
    ) {
      state.phase = 'preparing';
      state.plan = '';
      state.checks = [];
      state.working = true;
      broadcast();
      await push('prepare', JSON.stringify({ answers: resolved(), readme: state.readme }));
    } else if (event.kind === 'check' && ['planned', 'ready'].includes(state.phase)) {
      state.phase = 'checking';
      state.checks = [];
      state.working = true;
      broadcast();
      await push('check', JSON.stringify({ answers: resolved(), plan: state.plan }));
    } else if (event.kind === 'run' && state.phase === 'ready') {
      state.phase = 'running';
      state.working = true;
      broadcast();
      await push('run', JSON.stringify({ answers: resolved(), readme: state.readme, plan: state.plan }));
    }
    broadcast();
    // The new state also goes back in the answer, so a click shows its effect even without the live stream.
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(state));
  } else {
    response.writeHead(404).end();
  }
});

await mcp.connect(new StdioServerTransport());

http.listen(Number(process.env.INTERVIEW_PORT || 0), '127.0.0.1', () => {
  const pageUrl = `http://127.0.0.1:${http.address().port}/?t=${TOKEN}`;
  log('interview page:', pageUrl);
  if (process.env.INTERVIEW_NO_OPEN) return;
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  spawn(opener, [pageUrl], { stdio: 'ignore', detached: true }).unref();
});
