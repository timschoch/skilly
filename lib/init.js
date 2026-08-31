import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveBundles } from './resolve.js';
import { sync } from './sync.js';
import { scaffoldCallerWorkflow, CALLER_WORKFLOW_PATH } from './caller-workflow.js';

export async function init(bundles, { cwd = process.cwd(), bundlesDir }) {
  if (!bundles.length) throw new Error('usage: skilly init <bundle...>');
  resolveBundles(bundles, bundlesDir); // fail on unknown names before writing anything

  const path = join(cwd, '.skilly.json');
  if (existsSync(path)) throw new Error('.skilly.json already exists — edit its `bundles` and run `skilly sync`');
  writeFileSync(path, JSON.stringify({ bundles, status: {} }, null, 2) + '\n');
  console.log(`wrote .skilly.json (bundles: ${bundles.join(', ')})`);

  if (scaffoldCallerWorkflow(cwd)) console.log(`wrote ${CALLER_WORKFLOW_PATH}`);

  await sync({ cwd, bundlesDir });
}
