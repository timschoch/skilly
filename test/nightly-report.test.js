import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { groupRedByCheck, issueAction } from '../engine/verify/nightly-report.mjs';

const script = fileURLToPath(new URL('../engine/verify/nightly-report.mjs', import.meta.url));
const RUN_URL = 'https://github.com/owner/repo/actions/runs/1';

const results = [
  { name: 'unit', status: 1, issueLabels: ['nightly-tests', 'critical'] },
  { name: 'e2e full', status: 1, issueLabels: ['nightly-tests', 'critical'] },
  { name: 'security scan', status: 1, issueLabels: ['nightly-security', 'critical'] },
  { name: 'deps drift', status: 1, issueLabels: [] },
  { name: 'stryker', status: 0, issueLabels: ['nightly-stryker'] },
];

test('red steps group by their check, a step without issue labels opens nothing', () => {
  assert.deepEqual(
    [...groupRedByCheck(results)],
    [
      ['nightly-tests', { labels: ['nightly-tests', 'critical'], red: ['e2e full', 'unit'] }],
      ['nightly-security', { labels: ['nightly-security', 'critical'], red: ['security scan'] }],
    ],
  );
});

test('a check opens one issue, comments only when its list changed', () => {
  const check = { labels: ['nightly-tests', 'critical'], red: ['e2e full', 'unit'] };
  const created = issueAction({ check, openIssue: undefined, runUrl: RUN_URL });
  assert.equal(created.kind, 'create');
  assert.deepEqual(created.labels, ['nightly-tests', 'critical']);
  assert.match(created.body, /^Red steps: e2e full, unit$/m);

  assert.equal(issueAction({ check, openIssue: { number: 3, text: created.body }, runUrl: RUN_URL }), null);
  const changed = issueAction({
    check: { ...check, red: ['unit'] },
    openIssue: { number: 3, text: created.body },
    runUrl: RUN_URL,
  });
  assert.deepEqual({ kind: changed.kind, number: changed.number }, { kind: 'comment', number: 3 });
  assert.match(changed.body, /^Red steps: unit$/m);
});

test('the report reads the results file and calls gh once per new problem list', () => {
  const root = mkdtempSync(join(tmpdir(), 'skilly-report-'));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const open = [{ number: 7, body: 'Red steps: security scan\n', comments: [] }];
  writeFileSync(join(root, 'security.json'), JSON.stringify(open));
  writeFileSync(
    join(bin, 'gh'),
    [
      '#!/bin/sh',
      `echo "$*" >> "${join(root, 'gh.log')}"`,
      `case "$*" in *"issue list --label nightly-security"*) cat "${join(root, 'security.json')}" ;; *"issue list"*) echo '[]' ;; esac`,
    ].join('\n'),
  );
  chmodSync(join(bin, 'gh'), 0o755);
  writeFileSync(join(root, 'results.json'), JSON.stringify(results));
  const result = spawnSync(process.execPath, [script, join(root, 'results.json')], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, RUN_URL },
  });
  assert.equal(result.status, 0, result.stderr);
  const log = readFileSync(join(root, 'gh.log'), 'utf8');
  assert.match(log, /issue create .*--label nightly-tests --label critical/);
  assert.doesNotMatch(log, /issue comment/);
  assert.equal((log.match(/issue create/g) ?? []).length, 1);
});
