import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

// Skilly-owned files are not the consumer's code — keep its formatter off
// them, or every Sync PR fails the consumer's own CI (design record, #17).
// Runs on setup, add, and update: a formatter added after setup gets patched
// by the next skilly verb, and the nightly update heals every consumer.
const SKILLY_IGNORES = ['.skilly.json', 'skills-lock.json', '.claude/rules/**', '.claude/skills/**', '.agents/**'];

export function addFormatterIgnores(cwd) {
  const biomePath = ['biome.json', 'biome.jsonc'].map((f) => join(cwd, f)).find(existsSync);
  if (biomePath) {
    if (biomePath.endsWith('.jsonc')) {
      console.log(`biome.jsonc found — add these to its ignore list yourself: ${SKILLY_IGNORES.join(', ')}`);
    } else {
      const config = JSON.parse(readFileSync(biomePath, 'utf8'));
      config.files ??= {};
      if (Array.isArray(config.files.includes)) {
        // Biome 2.x: negated patterns in files.includes
        for (const path of SKILLY_IGNORES) {
          if (!config.files.includes.includes(`!${path}`)) config.files.includes.push(`!${path}`);
        }
      } else {
        // Biome 1.x: files.ignore
        config.files.ignore = [...new Set([...(config.files.ignore ?? []), ...SKILLY_IGNORES])];
      }
      writeFileSync(biomePath, JSON.stringify(config, null, 2) + '\n');
      console.log('added skilly-owned files to the biome ignore list');
    }
  }
  // Always ensure .prettierignore, even before any Prettier config exists:
  // Prettier arrives later (setup-pre-commit) and would otherwise reformat
  // vendor skills and invalidate every computedHash in skills-lock.json.
  const prettierIgnore = join(cwd, '.prettierignore');
  const lines = existsSync(prettierIgnore) ? readFileSync(prettierIgnore, 'utf8').split('\n') : [];
  const missing = SKILLY_IGNORES.filter((path) => !lines.includes(path));
  if (missing.length) {
    appendFileSync(prettierIgnore, `${lines.length ? '\n' : ''}# skilly-owned files\n${missing.join('\n')}\n`);
    console.log('added skilly-owned files to .prettierignore');
  }
}
