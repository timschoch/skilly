import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { tryRun } from './run.js';

// The domain-modeling skill reads GLOSSARY.md and GLOSSARY-MAP.md. A consumer
// set up before that name carries CONTEXT.md and CONTEXT-MAP.md, so update
// moves them in the same Sync PR that brings the new skill text.
const OLD_NAME = /\bCONTEXT(-MAP)?\.md\b/g;
const renamed = (text) => text.replace(OLD_NAME, 'GLOSSARY$1.md');

// Agent docs that point at the glossary (setup-matt-pocock-skills writes them).
const POINTER_FILES = ['CLAUDE.md', 'AGENTS.md', join('docs', 'agents', 'domain.md')];
// Hub-owned text: the nightly update rewrites it, the consumer does not.
const HUB_OWNED = [':(exclude).agents', ':(exclude).claude'];

const gitPaths = (cwd, args) => (tryRun('git', [...args, ...HUB_OWNED], { cwd }) ?? '').split('\n').filter(Boolean);

// Returns the moved files, and the files that still name the old file: skilly
// fixes the pointer files only, the rest need a person.
export function migrateGlossary(cwd) {
  const moved = [];
  for (const from of gitPaths(cwd, ['ls-files', '--', ':(glob)**/CONTEXT.md', ':(glob)**/CONTEXT-MAP.md'])) {
    const to = join(dirname(from), renamed(basename(from)));
    if (existsSync(join(cwd, to))) continue; // the consumer already wrote the new file
    renameSync(join(cwd, from), join(cwd, to));
    moved.push({ from, to });
  }
  if (!moved.length) return { moved, mentions: [] };

  // A moved map file links to the glossaries that moved with it.
  for (const path of [...POINTER_FILES, ...moved.map(({ to }) => to)]) {
    if (!existsSync(join(cwd, path))) continue;
    const text = readFileSync(join(cwd, path), 'utf8');
    if (renamed(text) !== text) writeFileSync(join(cwd, path), renamed(text));
  }
  const mentions = gitPaths(cwd, ['grep', '-l', '-E', 'CONTEXT(-MAP)?\\.md', '--', '.']);
  return { moved, mentions };
}
