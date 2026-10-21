#!/usr/bin/env node
// Gate check `mermaid`: every mermaid diagram in the Markdown files a branch
// adds or changes parses, so a broken one fails before the push instead of
// rendering as an error box on GitHub. A consumer's `verify` push stage runs it
// from `.agents/skills/writing-rules/scripts/`.
//   node check-mermaid.mjs [files...]   no files: every .md / .mdx / .mmd file the
//                                       branch adds or changes over its base
// Parses with the consumer's own `mermaid` and `jsdom` devDependencies (the
// setup-repo skill installs them): mermaid's parser needs a DOM, jsdom stands
// in for the browser. Without them the check skips and says so, so a consumer
// that synced this script before installing them keeps a green gate.
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdx']);
const FENCE_OPEN = /^\s*(`{3,}|~{3,})\s*mermaid\s*$/;

// The diagrams in one file: a `.mmd` file is one diagram, Markdown holds one per
// ```mermaid fence. `line` is the diagram's first line in the file, 1-based.
export function extractDiagrams(file, text) {
  if (extname(file) === '.mmd') return [{ line: 1, source: text }];
  if (!MARKDOWN_EXTENSIONS.has(extname(file))) return [];
  const lines = text.split('\n');
  const diagrams = [];
  for (let index = 0; index < lines.length; index++) {
    const open = FENCE_OPEN.exec(lines[index]);
    if (!open) continue;
    const fence = open[1];
    const close = new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`);
    let end = index + 1;
    while (end < lines.length && !close.test(lines[end])) end++;
    diagrams.push({ line: index + 2, source: lines.slice(index + 1, end).join('\n') });
    index = end;
  }
  return diagrams;
}

// Loads mermaid from the repo at `root`, with jsdom as its DOM. Null when the
// repo lacks either package.
export async function loadMermaid(root) {
  const require = createRequire(join(root, 'package.json'));
  let paths;
  try {
    paths = { jsdom: require.resolve('jsdom'), mermaid: require.resolve('mermaid') };
  } catch {
    return null;
  }
  const { JSDOM } = await import(pathToFileURL(paths.jsdom).href);
  const { window } = new JSDOM('');
  globalThis.window = window;
  globalThis.document = window.document;
  const { default: mermaid } = await import(pathToFileURL(paths.mermaid).href);
  return mermaid;
}

// One finding per diagram that fails to parse. A parse error names its line
// inside the diagram; the finding moves it to the line in the file and keeps
// the rest: the source with a caret under the error, then what was expected.
export async function validateMermaid(diagrams, mermaid) {
  const failures = [];
  for (const { file, line, source } of diagrams) {
    try {
      await mermaid.parse(source);
    } catch (error) {
      const message = String(error.message ?? error);
      const inner = /on line (\d+)/.exec(message);
      const parts = message.split('\n').filter((part) => part.trim());
      const detail = (inner ? parts.slice(1) : parts).join('\n    ');
      failures.push({ file, line: line + (inner ? Number(inner[1]) - 1 : 0), message: detail });
    }
  }
  return failures;
}

const git = (...args) => spawnSync('git', args, { encoding: 'utf8' });

// The base branch: GITHUB_BASE_REF on pull_request events, then DEFAULT_BRANCH,
// then origin/HEAD, then main. Its origin ref when fetched, else the local one.
function baseRef() {
  const branch =
    process.env.GITHUB_BASE_REF ||
    process.env.DEFAULT_BRANCH ||
    git('symbolic-ref', '--short', 'refs/remotes/origin/HEAD').stdout.trim().replace(/^origin\//, '') ||
    'main';
  return git('rev-parse', '--verify', '--quiet', `origin/${branch}`).status === 0 ? `origin/${branch}` : branch;
}

function changedFiles(ref) {
  const diff = git('diff', '--merge-base', '--name-only', '--diff-filter=ACMR', ref);
  if (diff.status !== 0) throw new Error(`git diff over ${ref} failed: ${diff.stderr.trim()}`);
  return diff.stdout.split('\n').filter(Boolean);
}

async function main(argv) {
  const root = process.cwd();
  const diagrams = (argv.length ? argv : changedFiles(baseRef()))
    .filter((file) => extname(file) === '.mmd' || MARKDOWN_EXTENSIONS.has(extname(file)))
    .flatMap((file) => extractDiagrams(file, readFileSync(join(root, file), 'utf8')).map((diagram) => ({ file, ...diagram })));
  if (!diagrams.length) {
    console.log('mermaid: no changed diagrams');
    return 0;
  }
  const mermaid = await loadMermaid(root);
  if (!mermaid) {
    console.log('mermaid: skipped, the repo lacks the mermaid or jsdom package. Install: npm i -D mermaid jsdom');
    return 0;
  }
  const failures = await validateMermaid(diagrams, mermaid);
  for (const { file, line, message } of failures) console.log(`FAIL ${file}:${line}\n    ${message}`);
  console.log(`mermaid: ${failures.length} of ${diagrams.length} diagrams fail to parse`);
  return failures.length ? 1 : 0;
}

// realpath: import.meta.url resolves symlinks, argv[1] does not.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    process.exit(await main(process.argv.slice(2)));
  } catch (failure) {
    console.error(failure.message);
    process.exit(1);
  }
}
