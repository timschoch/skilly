import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

// Router-rule install for one skill or bundle (docs/update-rules.mmd).
// Convention: only files named {name}-{rule}.md are ever touched — wipe and
// reinstall, no diffing. sourceDir null (or missing) just deletes (remove flow).
export function updateRules(cwd, name, sourceDir) {
  const matches = (file) => file.startsWith(`${name}-`) && file.endsWith('.md');
  const outDir = join(cwd, '.claude', 'rules');

  if (existsSync(outDir)) {
    for (const file of readdirSync(outDir)) {
      if (matches(file)) unlinkSync(join(outDir, file));
    }
  }

  if (!sourceDir) return [];
  const rulesDir = join(sourceDir, 'rules');
  if (!existsSync(rulesDir)) return [];
  const files = readdirSync(rulesDir).filter(matches);
  if (files.length) mkdirSync(outDir, { recursive: true });
  for (const file of files) copyFileSync(join(rulesDir, file), join(outDir, file));
  return files;
}
