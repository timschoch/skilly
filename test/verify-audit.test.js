import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchHasFix, parseNpm, parseYarn, validateAccept } from '../engine/verify/audit.mjs';

const BRACES = 'GHSA-vfj7-8cjw-p6xm';
const found = new Map([[BRACES, { name: 'braces', ranges: new Set(['<=3.0.3']) }]]);

// Trimmed `npm audit --json` from a project with micromatch 4.0.8 → braces 3.0.3.
const npmOutput = JSON.stringify({
  auditReportVersion: 2,
  vulnerabilities: {
    braces: {
      name: 'braces',
      severity: 'high',
      via: [
        {
          source: 1240992,
          name: 'braces',
          url: `https://github.com/advisories/${BRACES}`,
          severity: 'high',
          range: '<=3.0.3',
        },
      ],
      fixAvailable: { name: 'micromatch', version: '0.1.0', isSemVerMajor: true },
    },
    micromatch: { name: 'micromatch', severity: 'high', via: ['braces'] },
    lodash: {
      name: 'lodash',
      severity: 'moderate',
      via: [{ name: 'lodash', url: 'https://github.com/advisories/GHSA-low0-0000-0000', severity: 'moderate' }],
    },
  },
});

// Trimmed `yarn audit --json` (yarn 1) from the same project.
const yarnOutput = [
  { type: 'warning', data: 'package.json: No license field' },
  {
    type: 'auditAdvisory',
    data: {
      advisory: {
        github_advisory_id: BRACES,
        module_name: 'braces',
        severity: 'high',
        vulnerable_versions: '<=3.0.3',
        patched_versions: '<0.0.0',
      },
    },
  },
  {
    type: 'auditAdvisory',
    data: { advisory: { github_advisory_id: 'GHSA-low0-0000-0000', module_name: 'lodash', severity: 'moderate' } },
  },
  { type: 'auditSummary', data: { vulnerabilities: { high: 1, moderate: 1 } } },
]
  .map((event) => JSON.stringify(event))
  .join('\n');

test('npm: keeps high and critical advisories, follows no string via', () => {
  assert.deepEqual(parseNpm(npmOutput), found);
});

test('npm: an error report throws', () => {
  assert.throws(() => parseNpm(JSON.stringify({ error: { summary: 'requires a lockfile' } })), /requires a lockfile/);
});

test('yarn 1: keeps high and critical advisories, skips other events', () => {
  assert.deepEqual(parseYarn(yarnOutput), found);
});

test('yarn: output that is not JSON throws', () => {
  assert.throws(() => parseYarn('Usage Error: Couldn\'t find a script named "audit".'));
});

const accept = [{ id: BRACES, why: 'no fix, dev only' }];

test('an advisory not on the list blocks', () => {
  const { problems } = validateAccept(found, [], new Set());
  assert.equal(problems.length, 1);
  assert.match(problems[0], new RegExp(`^${BRACES} \\(braces\\): upgrade`));
});

test('an accepted advisory with no fix passes', () => {
  assert.deepEqual(validateAccept(found, accept, new Set()), {
    accepted: [{ id: BRACES, why: 'no fix, dev only', name: 'braces' }],
    problems: [],
  });
});

test('an accepted advisory that has a fix now blocks', () => {
  assert.match(validateAccept(found, accept, new Set([BRACES])).problems[0], /a fix exists now/);
});

test('an accepted advisory the audit no longer finds blocks', () => {
  assert.match(validateAccept(new Map(), accept, new Set()).problems[0], /no longer finds it/);
});

test('an accept entry without a why blocks, and does not accept', () => {
  const { accepted, problems } = validateAccept(found, [{ id: BRACES }], new Set());
  assert.deepEqual(accepted, []);
  assert.equal(problems.length, 2);
  assert.match(problems[0], new RegExp(`^${BRACES} \\(braces\\): upgrade`));
  assert.match(problems[1], /needs an id and a why/);
});

// Stubs the global fetch with one GitHub advisory API answer for the duration of `run`.
const withAdvisoryResponse = async (status, body, run) => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: status === 200, status, json: async () => body });
  try {
    await run();
  } finally {
    globalThis.fetch = realFetch;
  }
};

const vulnerability = (range, patched) => ({
  package: { ecosystem: 'npm', name: 'braces' },
  vulnerable_version_range: range,
  first_patched_version: patched,
});

test('fix check: a patched single-range advisory is fixed', async () => {
  const finding = { name: 'braces', ranges: new Set(['<3.0.3']) };
  await withAdvisoryResponse(200, { vulnerabilities: [vulnerability('< 3.0.3', '3.0.3')] }, async () => {
    assert.equal(await fetchHasFix('GHSA-grv7-fg5c-xmjg', finding), true);
  });
});

test('fix check: a patch for another range of the package is no fix', async () => {
  const body = { vulnerabilities: [vulnerability('< 2.0.0', '2.0.0'), vulnerability('>= 3.0.0, <= 3.0.3', null)] };
  const finding = { name: 'braces', ranges: new Set(['>=3.0.0,<=3.0.3']) };
  await withAdvisoryResponse(200, body, async () => {
    assert.equal(await fetchHasFix(BRACES, finding), false);
  });
});

test('fix check: a 403 names the token fix', async () => {
  await withAdvisoryResponse(403, {}, async () => {
    await assert.rejects(fetchHasFix(BRACES, found.get(BRACES)), /GITHUB_TOKEN or GH_TOKEN/);
  });
});
