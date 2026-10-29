import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySettings, validateSettings } from '../engine/lib/repo-settings.js';
import { sync } from '../engine/lib/sync.js';
import { useFakeGitHub } from './fixtures/fake-github.js';
import { fakeSkills, makeCheckout, makeSnapshot } from './fixtures/sync.js';

const REPO = 'owner/consumer';
const ALL_SETTINGS = [
  'allow_auto_merge',
  'allow_merge_commit',
  'delete_branch_on_merge',
  'can_approve_pull_request_reviews',
  'vulnerability_alerts',
  'ruleset protect-trunk',
];
const settingNames = (drift) => drift.map(({ setting }) => setting).sort();
const requiredChecks = (ruleset) =>
  ruleset.rules.find(({ type }) => type === 'required_status_checks').parameters.required_status_checks;

test('a new repo drifts on every setting skilly manages', () => {
  useFakeGitHub();
  const { drift, unavailable } = validateSettings(REPO);
  assert.deepEqual(settingNames(drift), [...ALL_SETTINGS].sort());
  assert.deepEqual(unavailable, []);
  assert.deepEqual(
    drift.find(({ setting }) => setting === 'allow_auto_merge'),
    {
      setting: 'allow_auto_merge',
      want: true,
      have: false,
    },
  );
});

test('checking writes nothing', () => {
  const github = useFakeGitHub();
  validateSettings(REPO);
  assert.deepEqual(github.writes(), []);
});

test('apply sets every setting, a second apply changes nothing', () => {
  const github = useFakeGitHub();
  assert.deepEqual(settingNames(applySettings(REPO).drift), [...ALL_SETTINGS].sort());

  const state = github.read();
  assert.equal(state.repo.allow_auto_merge, true);
  assert.equal(state.repo.delete_branch_on_merge, true);
  assert.equal(state.repo.allow_squash_merge, true);
  assert.equal(state.repo.allow_merge_commit, true);
  assert.equal(state.workflow.can_approve_pull_request_reviews, true);
  assert.equal(state.workflow.default_workflow_permissions, 'read', 'the default token stays read-only');
  assert.equal(state.vulnerabilityAlerts, true);
  assert.equal(state.rulesets.length, 1);
  assert.equal(state.rulesets[0].name, 'protect-trunk');
  assert.deepEqual(state.rulesets[0].conditions, { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } });
  assert.deepEqual(requiredChecks(state.rulesets[0]), [{ context: 'verify' }]);
  assert.deepEqual(state.rulesets[0].rules.map(({ type }) => type).sort(), [
    'deletion',
    'non_fast_forward',
    'required_status_checks',
  ]);

  const writes = github.writes().length;
  assert.deepEqual(applySettings(REPO), { drift: [], unavailable: [] });
  assert.equal(github.writes().length, writes, 'the second apply makes no write call');
});

test('a setting changed by hand shows up as drift', () => {
  const github = useFakeGitHub();
  applySettings(REPO);
  github.edit((state) => {
    state.repo.allow_auto_merge = false;
    requiredChecks(state.rulesets[0]).push({ context: 'skilly / gate' });
  });
  const { drift } = validateSettings(REPO);
  assert.deepEqual(settingNames(drift), ['allow_auto_merge', 'ruleset protect-trunk']);
});

test('an existing protect-trunk drops skilly / gate and keeps the owner rules and bypass actors', () => {
  const bypass = [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }];
  const github = useFakeGitHub({
    rulesets: [
      {
        id: 7,
        name: 'protect-trunk',
        source_type: 'Repository',
        target: 'branch',
        enforcement: 'active',
        conditions: { ref_name: { exclude: [], include: ['~DEFAULT_BRANCH'] } },
        bypass_actors: bypass,
        rules: [
          { type: 'deletion' },
          { type: 'non_fast_forward' },
          { type: 'pull_request', parameters: { required_approving_review_count: 1 } },
          {
            type: 'required_status_checks',
            parameters: {
              do_not_enforce_on_create: false,
              required_status_checks: [{ context: 'verify' }, { context: 'skilly / gate' }],
              strict_required_status_checks_policy: false,
            },
          },
        ],
      },
    ],
  });
  assert.ok(settingNames(validateSettings(REPO).drift).includes('ruleset protect-trunk'));
  applySettings(REPO);

  const [ruleset] = github.read().rulesets;
  assert.equal(github.read().rulesets.length, 1, 'updated in place, not a second ruleset');
  assert.deepEqual(requiredChecks(ruleset), [{ context: 'verify' }]);
  assert.ok(
    ruleset.rules.some(({ type }) => type === 'pull_request'),
    'the owner rule stays',
  );
  assert.deepEqual(ruleset.bypass_actors, bypass);
  assert.ok(!settingNames(validateSettings(REPO).drift).includes('ruleset protect-trunk'));
});

test('a setting the gh login may not change is reported, the others are still set', () => {
  const github = useFakeGitHub({ forbidden: ['POST /rulesets'] });
  const { drift, unavailable } = applySettings(REPO);
  assert.deepEqual(
    unavailable.map(({ setting }) => setting),
    ['ruleset protect-trunk'],
  );
  assert.match(unavailable[0].reason, /HTTP 403/);
  assert.ok(!settingNames(drift).includes('ruleset protect-trunk'));
  assert.equal(github.read().repo.allow_auto_merge, true);
});

test('the Sync report carries the drift when the Sync is given the repo', () => {
  useFakeGitHub();
  const snapshot = makeSnapshot();
  const report = sync({ cwd: makeCheckout({ bundles: ['other'] }), snapshot, skills: fakeSkills(), repo: REPO });
  assert.deepEqual(settingNames(report.settings.drift), [...ALL_SETTINGS].sort());

  const local = sync({ cwd: makeCheckout({ bundles: ['other'] }), snapshot, skills: fakeSkills() });
  assert.equal(local.settings, null, 'a local Sync makes no GitHub call');
});
