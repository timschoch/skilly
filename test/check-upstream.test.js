import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLACEHOLDER_BODY,
  compareVersions,
  findOurs,
  formatConflictComment,
  formatReleaseComment,
  formatTitle,
  listMarkers,
  parseVersion,
  planRun,
} from '../scripts/check-upstream.mjs';

const release = (tag) => ({
  tag,
  version: parseVersion(tag, 'twenty/v'),
  url: `https://example.test/${tag}`,
  body: `notes ${tag}`,
});
// Newest first, as the script sorts them.
const releases = ['twenty/v2.53.0', 'twenty/v2.52.0', 'twenty/v2.51.0', 'twenty/v2.50.0'].map(release);
const [v53, v52, v51, v50] = releases;
const tags = (plan) => plan.fresh.map(({ tag }) => tag);

test('parseVersion: own prefix only, no pre-releases', () => {
  assert.deepEqual(parseVersion('twenty/v2.51.0', 'twenty/v'), [2, 51, 0]);
  assert.equal(parseVersion('sdk/v2.51.0', 'twenty/v'), null);
  assert.equal(parseVersion('v1.3.1-beta.1', 'v'), null);
  assert.deepEqual(parseVersion('v1.3.1', 'v'), [1, 3, 1]);
});

test('compareVersions: numeric, not lexical', () => {
  assert.ok(compareVersions([2, 10, 0], [2, 9, 0]) > 0);
  assert.equal(compareVersions([1, 2, 3], [1, 2, 3]), 0);
});

test('planRun: no open PR, fork behind → one update, oldest release first', () => {
  const plan = planRun({ releases, ours: v51, skipped: [], openPull: null });
  assert.equal(plan.kind, 'update');
  assert.equal(plan.newest, v53);
  assert.deepEqual(tags(plan), ['twenty/v2.52.0', 'twenty/v2.53.0']);
  assert.equal(formatTitle(plan), 'New upstream release 2.53.0 (2.51.0)');
});

test('planRun: open PR collects only the releases it has no comment for', () => {
  const plan = planRun({
    releases,
    ours: v50,
    skipped: [],
    openPull: { number: 7, postedTags: ['twenty/v2.51.0', 'twenty/v2.52.0'] },
  });
  assert.deepEqual(tags(plan), ['twenty/v2.53.0']);
  assert.equal(formatTitle(plan), 'New upstream release 2.53.0 (2.50.0)');
});

test('planRun: a rerun with every release posted does nothing', () => {
  const postedTags = ['twenty/v2.51.0', 'twenty/v2.52.0', 'twenty/v2.53.0'];
  assert.deepEqual(planRun({ releases, ours: v50, skipped: [], openPull: { number: 7, postedTags } }), {
    kind: 'none',
  });
});

test('planRun: fork has the newest release → close the open PR, or do nothing', () => {
  assert.deepEqual(planRun({ releases, ours: v53, skipped: [], openPull: { number: 7, postedTags: [] } }), {
    kind: 'close',
    newest: v53,
  });
  assert.deepEqual(planRun({ releases, ours: v53, skipped: [], openPull: null }), { kind: 'none' });
});

test('planRun: a closed PR skips its releases; a newer one opens a fresh PR', () => {
  const skipped = ['twenty/v2.51.0', 'twenty/v2.52.0'];
  assert.deepEqual(planRun({ releases: [v52, v51, v50], ours: v50, skipped, openPull: null }), { kind: 'none' });
  const plan = planRun({ releases, ours: v50, skipped, openPull: null });
  assert.deepEqual(tags(plan), ['twenty/v2.53.0']);
  assert.equal(formatTitle(plan), 'New upstream release 2.53.0 (2.50.0)');
});

test('planRun: unknown fork version caps the comments at the newest ten', () => {
  const many = Array.from({ length: 12 }, (_, index) => release(`twenty/v2.${60 - index}.0`));
  const plan = planRun({ releases: many, ours: null, skipped: [], openPull: null });
  assert.equal(plan.fresh.length, 10);
  assert.equal(plan.dropped, 2);
  assert.equal(plan.fresh.at(-1).tag, 'twenty/v2.60.0');
  assert.equal(formatTitle(plan), 'New upstream release 2.60.0 (unknown)');
});

test('planRun: an open PR still on the placeholder body reruns the analysis, no new comments', () => {
  const postedTags = ['twenty/v2.51.0', 'twenty/v2.52.0', 'twenty/v2.53.0'];
  const plan = planRun({
    releases,
    ours: v50,
    skipped: [],
    openPull: { number: 7, postedTags, body: PLACEHOLDER_BODY },
  });
  assert.equal(plan.kind, 'update');
  assert.deepEqual(plan.fresh, []);
  assert.equal(plan.dropped, 0);
  assert.equal(formatTitle(plan), 'New upstream release 2.53.0 (2.50.0)');
});

test('planRun: a rerun after the comment limit never posts the dropped releases', () => {
  const many = Array.from({ length: 12 }, (_, index) => release(`twenty/v2.${60 - index}.0`));
  const postedTags = ['twenty/v2.51.0', 'twenty/v2.52.0', 'twenty/v2.53.0'];
  const plan = planRun({ releases: many, ours: null, skipped: [], openPull: { number: 7, postedTags, body: 'done' } });
  assert.equal(plan.fresh.length, 7);
  assert.equal(plan.fresh[0].tag, 'twenty/v2.54.0');
  assert.equal(plan.dropped, 0);
});

test('findOurs: a squash-merged Upstream PR sets the floor when no tag is an ancestor', () => {
  const ours = findOurs({
    releases,
    merged: ['twenty/v2.51.0', 'twenty/v2.52.0'],
    isAncestor: (tag) => tag === v50.tag,
  });
  assert.equal(ours, v52);
  assert.deepEqual(tags(planRun({ releases, ours, skipped: [], openPull: null })), ['twenty/v2.53.0']);
  assert.equal(findOurs({ releases, merged: [], isAncestor: (tag) => tag === v51.tag }), v51);
  assert.equal(findOurs({ releases, merged: ['twenty/v2.50.0'], isAncestor: (tag) => tag === v51.tag }), v51);
  assert.equal(findOurs({ releases, merged: [], isAncestor: () => false }), null);
});

test('formatReleaseComment: marker round-trips, long notes are cut under the cap', () => {
  assert.deepEqual(listMarkers([{ body: formatReleaseComment(v51) }, { body: 'no marker' }, { body: null }]), [
    'twenty/v2.51.0',
  ]);
  const long = formatReleaseComment({ ...v51, body: 'x'.repeat(70000) });
  assert.ok(long.length < 65536);
  assert.match(long, /\[Full notes\]\(https:\/\/example\.test\/twenty\/v2\.51\.0\)$/);
});

test('formatConflictComment: its own marker kind, so a rerun skips a posted conflict and the release list ignores it', () => {
  const comments = [{ body: formatReleaseComment(v51) }, { body: formatConflictComment('twenty/v2.52.0') }];
  assert.deepEqual(listMarkers(comments, 'conflict'), ['twenty/v2.52.0']);
  assert.deepEqual(listMarkers(comments), ['twenty/v2.51.0']);
});
