import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as skillyFile from './skilly-file.js';

// Guard: this repo is a skilly Consumer (docs/ensure-skilly.mmd).
export function ensureSkilly(cwd) {
  if (!existsSync(join(cwd, 'skills-lock.json'))) {
    throw new Error('no skills-lock.json — set up skilly first: npx github:timschoch/skilly setup');
  }
  if (!skillyFile.exists(cwd)) {
    throw new Error(
      'no .skilly.json — skilly is not set up here; use the skills CLI directly, or run: npx github:timschoch/skilly setup',
    );
  }
}
