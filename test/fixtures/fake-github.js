import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A fake GitHub behind a fake `gh` on the PATH (ADR-0009, Consequences).
// It answers the `gh api` calls of the repo settings module from a JSON file
// and logs each call as "METHOD path". A repo starts with every setting off except squash merge.
// `forbidden` lists "METHOD path" calls that answer HTTP 403.
// It also keeps the PRs of `gh pr list|create|edit`, logged as "pr <verb>",
// the login of `gh api user` and the Hub's `permissions` for this login.
const GH_SCRIPT = String.raw`
const { readFileSync, writeFileSync } = require('node:fs');
const file = process.env.FAKE_GITHUB;
const state = JSON.parse(readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
const save = () => writeFileSync(file, JSON.stringify(state));
function fail(message, code = 1) {
  save();
  process.stderr.write('gh: ' + message + '\n');
  process.exit(code);
}
function answer(value) {
  save();
  if (value !== undefined) process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value));
  process.exit(0);
}
const flag = (name) => args[args.indexOf(name) + 1];
if (args[0] === 'pr') {
  state.calls.push('pr ' + args[1]);
  if (args[1] === 'list') answer(state.prs.filter((pr) => pr.head === flag('--head') && pr.state === 'open'));
  if (args[1] === 'create') {
    const pr = { url: 'https://github.com/owner/consumer/pull/' + (state.prs.length + 1), head: flag('--head'), state: 'open' };
    state.prs.push(Object.assign(pr, { base: flag('--base'), title: flag('--title'), body: flag('--body') }));
    answer(pr.url);
  }
  if (args[1] === 'edit') answer(void Object.assign(state.prs.find((pr) => pr.url === args[2]), { title: flag('--title'), body: flag('--body') }));
  fail('fake gh has no pr ' + args[1], 2);
}
if (args[0] !== 'api') fail('fake gh knows only api and pr', 2);
state.calls.push((args.includes('-X') ? flag('-X') : 'GET') + ' ' + args[1]);
if (args[1] === 'user') answer({ login: state.login });
if (args[1] === 'repos/timschoch/skilly') answer({ full_name: 'timschoch/skilly', permissions: state.hubPermissions });
const path = args[1].replace(/^repos\/[^/]+\/[^/?]+/, '');
const method = args.includes('-X') ? flag('-X') : 'GET';
const body = args.includes('--input') ? JSON.parse(readFileSync(0, 'utf8')) : null;
if (state.forbidden.includes(method + ' ' + path)) fail('Resource not accessible (HTTP 403)');
const summary = ({ id, name, source_type, target, enforcement }) => ({ id, name, source_type, target, enforcement });
const ruleset = (id) => state.rulesets.find((item) => String(item.id) === id) ?? fail('Not Found (HTTP 404)');
const routes = {
  'GET ': () => answer(state.repo),
  'PATCH ': () => answer(Object.assign(state.repo, body)),
  'GET /actions/permissions/workflow': () => answer(state.workflow),
  'PUT /actions/permissions/workflow': () => answer(void Object.assign(state.workflow, body)),
  'GET /vulnerability-alerts': () => (state.vulnerabilityAlerts ? answer() : fail('Vulnerability alerts are disabled. (HTTP 404)')),
  'PUT /vulnerability-alerts': () => answer(void (state.vulnerabilityAlerts = true)),
  'GET /rulesets?includes_parents=false': () => answer(state.rulesets.map(summary)),
  'POST /rulesets': () => {
    const created = { bypass_actors: [], ...body, id: state.rulesets.length + 1, source_type: 'Repository' };
    state.rulesets.push(created);
    answer(created);
  },
};
const id = path.match(/^\/rulesets\/(\d+)$/)?.[1];
if (id && method === 'GET') answer(ruleset(id));
if (id && method === 'PUT') answer(Object.assign(ruleset(id), body));
(routes[method + ' ' + path] ?? (() => fail('fake gh has no route for ' + method + ' ' + path)))();
`;

export function useFakeGitHub(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'skilly-fake-github-'));
  const file = join(dir, 'state.json');
  const write = (state) => writeFileSync(file, JSON.stringify(state));
  write({
    repo: {
      allow_auto_merge: false,
      delete_branch_on_merge: false,
      allow_squash_merge: true,
      allow_merge_commit: false,
    },
    workflow: { default_workflow_permissions: 'read', can_approve_pull_request_reviews: false },
    vulnerabilityAlerts: false,
    rulesets: [],
    forbidden: [],
    calls: [],
    prs: [],
    login: 'person',
    hubPermissions: { pull: true },
    ...overrides,
  });
  writeFileSync(join(dir, 'gh'), `#!${process.execPath}\n${GH_SCRIPT}`);
  chmodSync(join(dir, 'gh'), 0o755);
  process.env.PATH = `${dir}:${process.env.PATH}`;
  process.env.FAKE_GITHUB = file;
  const read = () => JSON.parse(readFileSync(file, 'utf8'));
  return {
    read,
    // A person changes a setting by hand.
    edit(change) {
      const state = read();
      change(state);
      write(state);
    },
    writes: () => read().calls.filter((call) => !call.startsWith('GET ')),
  };
}
