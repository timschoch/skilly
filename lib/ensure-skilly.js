import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as skillyFile from './skilly-file.js';
import { migrateAllow } from '../bundles/workflow/skills/naming/scripts/config.mjs';

// Guard: this repo is a skilly Consumer (docs/ensure-skilly.mmd).
export function ensureSkilly(cwd) {
  if (!existsSync(join(cwd, 'skills-lock.json'))) {
    throw new Error('no skills-lock.json — set up skilly first: npx github:timschoch/skilly setup');
  }
  if (skillyFile.migrate(cwd)) console.log(`moved .skilly.json → ${skillyFile.CONFIG_PATH}`);
  const migratedNaming = migrateAllow(cwd);
  if (migratedNaming) console.log(`converted the old allow list in ${migratedNaming} — fill in each "why"`);
  if (!skillyFile.exists(cwd)) {
    throw new Error(
      `no ${skillyFile.CONFIG_PATH} — skilly is not set up here; use the skills CLI directly, or run: npx github:timschoch/skilly setup`,
    );
  }
}
