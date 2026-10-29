import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runVerb } from '../engine/lib/add-remove.js';
import { sync } from '../engine/lib/sync.js';
import { fakeSkills, makeCheckout, makeSnapshot } from './fixtures/sync.js';

const config = (cwd) => JSON.parse(readFileSync(join(cwd, '.skilly/config.json'), 'utf8'));
const contents = (cwd, files) => files.map((path) => readFileSync(join(cwd, path), 'utf8'));

// The snapshot fetch is injected: tests never clone the Hub.
const offline = { fetchSnapshot: (tag) => ({ ...makeSnapshot(tag), cleanup() {} }) };

test('add writes the same files as a Sync of the config it ends with', () => {
  const viaAdd = makeCheckout({ hub: 'v1.0.0' });
  const viaSync = makeCheckout({ hub: 'v1.0.0', bundles: ['hubby'] });
  const added = runVerb('add', ['hubby'], { cwd: viaAdd, skills: fakeSkills(), ...offline });
  const synced = sync({ cwd: viaSync, snapshot: makeSnapshot('v1.0.0'), skills: fakeSkills() });

  assert.deepEqual(added.files, synced.files);
  assert.deepEqual(contents(viaAdd, added.files), contents(viaSync, synced.files));
});

test('add runs at the pinned Release, not the newest one', () => {
  const cwd = makeCheckout({ hub: 'v1.0.0' });
  const fetched = [];
  runVerb('add', ['other'], {
    cwd,
    skills: fakeSkills(),
    latestRelease: () => 'v9.9.9',
    fetchSnapshot: (tag) => (fetched.push(tag), { ...makeSnapshot(tag), cleanup() {} }),
  });
  assert.deepEqual(fetched, ['v1.0.0']);
});

test('add without a pin runs at the newest Release and pins it', () => {
  const cwd = makeCheckout({});
  runVerb('add', ['other'], { cwd, skills: fakeSkills(), latestRelease: () => 'v2.0.0', ...offline });
  assert.equal(config(cwd).hub, 'v2.0.0');
});

test('add takes a single skill into the config skills list', () => {
  const cwd = makeCheckout({ hub: 'v1.0.0' });
  const report = runVerb('add', ['rules-skill'], { cwd, skills: fakeSkills(), ...offline });
  assert.deepEqual(config(cwd).skills, ['rules-skill']);
  assert.deepEqual(report.skills.added, ['rules-skill']);
});

test('remove takes the Bundle out and the Sync drops its skills', () => {
  const cwd = makeCheckout({ hub: 'v1.0.0' });
  runVerb('add', ['hubby', 'other'], { cwd, skills: fakeSkills(), ...offline });
  const report = runVerb('remove', ['other'], { cwd, skills: fakeSkills(), ...offline });
  assert.deepEqual(config(cwd).bundles, ['hubby']);
  assert.deepEqual(report.skills.removed, ['loose-skill', 'one-skill']);
});

test('an unknown name is an error and leaves the config as it was', () => {
  const cwd = makeCheckout({ hub: 'v1.0.0', bundles: ['other'] });
  const before = readFileSync(join(cwd, '.skilly/config.json'), 'utf8');
  assert.throws(() => runVerb('add', ['nope'], { cwd, skills: fakeSkills(), ...offline }), /no Bundle or skill "nope"/);
  assert.throws(
    () => runVerb('remove', ['hubby'], { cwd, skills: fakeSkills(), ...offline }),
    /"hubby" is not in \.skilly\/config\.json/,
  );
  assert.equal(readFileSync(join(cwd, '.skilly/config.json'), 'utf8'), before);
});

test('a failed Sync puts the config back', () => {
  const cwd = makeCheckout({ hub: 'v1.0.0' });
  const before = readFileSync(join(cwd, '.skilly/config.json'), 'utf8');
  const skills = { ...fakeSkills(), add: () => ({ added: [], missing: ['one-skill'] }) };
  assert.throws(() => runVerb('add', ['other'], { cwd, skills, ...offline }), /left these uninstalled/);
  assert.equal(readFileSync(join(cwd, '.skilly/config.json'), 'utf8'), before);
});
