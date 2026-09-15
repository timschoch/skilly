import { test } from 'node:test';
import assert from 'node:assert/strict';

// Probe for the babysit-pr loop: red on the runner only, green locally.
test('babysit probe', () => {
  assert.equal(process.env.CI, undefined, 'probe: deliberate CI failure for babysit-pr');
});
