import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBundles } from '../engine/lib/resolve.js';
import * as skillsCli from '../engine/lib/skills-cli.js';

// Live: the real skills CLI installs every skill of every Bundle from the
// source the Bundle names. Upstream repos move skills and add marketplace
// files that hide folders, so only a real install proves a Source.
// Needs the network and a GitHub token: run with SKILLY_LIVE=1.
const bundlesDir = fileURLToPath(new URL('../bundles', import.meta.url));
const bundles = readdirSync(bundlesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const { sources } = resolveBundles(bundles, bundlesDir);

for (const [source, names] of sources) {
  test(`the skills CLI installs every Bundle skill from ${source}`, { skip: !process.env.SKILLY_LIVE }, () => {
    const cwd = mkdtempSync(join(tmpdir(), 'skilly-live-'));
    try {
      assert.deepEqual(skillsCli.add(cwd, source, [...names].sort()).missing, []);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
}
