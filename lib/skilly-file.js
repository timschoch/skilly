import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// The one owner of the Consumer's .skilly.json: shape, format, and the fact
// that an empty bundles list is legal (setup writes one before any add).
const pathOf = (cwd) => join(cwd, '.skilly.json');

export const exists = (cwd) => existsSync(pathOf(cwd));

export function read(cwd) {
  if (!exists(cwd)) throw new Error('no .skilly.json — run `npx github:timschoch/skilly setup` first');
  const parsed = JSON.parse(readFileSync(pathOf(cwd), 'utf8'));
  return { bundles: parsed.bundles ?? [] };
}

export function write(cwd, { bundles }) {
  writeFileSync(pathOf(cwd), JSON.stringify({ bundles }, null, 2) + '\n');
}

// Returns true when it created the file; an existing file is left alone.
export function create(cwd) {
  if (exists(cwd)) return false;
  write(cwd, { bundles: [] });
  return true;
}

export function addBundle(cwd, name) {
  const data = read(cwd);
  if (data.bundles.includes(name)) return false;
  data.bundles.push(name);
  write(cwd, data);
  return true;
}

export function removeBundle(cwd, name) {
  const data = read(cwd);
  if (!data.bundles.includes(name)) return false;
  write(cwd, { bundles: data.bundles.filter((bundle) => bundle !== name) });
  return true;
}
