// A Consumer gets every file under bundles/ by Sync PR, and the skilly CLI runs from lib/. A script
// those files run must arrive the same way, so a fix to it reaches every Consumer on the next sync.
// A copy under .claude/hooks/, or a path into a bundle the Consumer may not have, never updates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// Every Consumer has the workflow bundle, so only its skills are sure to be installed.
const BASE_BUNDLE = 'workflow';
const SCRIPT_PATH = /\.(?:agents|claude)\/[\w./-]+\.(?:mjs|js|sh)\b/g;
const SKILL_PATH = /^\.(?:agents|claude)\/skills\/([\w-]+)\/(.+)$/;
const HOOKS_JOIN = /['"]\.claude['"],\s*['"]hooks['"]/;
const OTHER_BUNDLE = /\.\.\/\.\.\/([\w-]+)\/skills\//g;
// file -> skill it may run outside its own bundle, with the reason.
const ALLOWED = {
  // The same line runs `skilly add gdd` first, so the gdd skill is installed.
  'bundles/setup-project/skills/setup-project/SKILL.md': 'gdd',
};

function listFiles(directory) {
  return readdirSync(join(ROOT, directory), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(ROOT, join(entry.parentPath, entry.name)));
}

function bundleOf(file) {
  return file.match(/^bundles\/([\w-]+)\//)?.[1] ?? BASE_BUNDLE;
}

function findSkillBundle(skill) {
  return readdirSync(join(ROOT, 'bundles')).find((bundle) =>
    existsSync(join(ROOT, 'bundles', bundle, 'skills', skill)),
  );
}

function findUnsyncedPaths(files, read = (file) => readFileSync(join(ROOT, file), 'utf8')) {
  const findings = [];
  for (const file of files) {
    const text = read(file);
    const bundle = bundleOf(file);
    if (HOOKS_JOIN.test(text)) findings.push(`${file}: runs a script from .claude/hooks/`);
    for (const [path] of text.matchAll(SCRIPT_PATH)) {
      if (path.startsWith('.claude/hooks/')) {
        findings.push(`${file}: ${path} is a copy that never updates`);
        continue;
      }
      const [, skill, rest] = path.match(SKILL_PATH) ?? [];
      if (!skill) continue;
      const owner = findSkillBundle(skill);
      if (!owner || !existsSync(join(ROOT, 'bundles', owner, 'skills', skill, rest))) {
        findings.push(`${file}: ${path} does not exist in any bundle`);
      } else if (owner !== BASE_BUNDLE && owner !== bundle && ALLOWED[file] !== skill) {
        findings.push(`${file}: ${path} is in the ${owner} bundle, which a Consumer may not have`);
      }
    }
    for (const [, other] of text.matchAll(OTHER_BUNDLE)) {
      if (other !== bundle) findings.push(`${file}: reaches into the ${other} bundle, which a Consumer may not have`);
    }
  }
  return findings;
}

test('a synced file runs only scripts that sync with it', () => {
  const files = [...listFiles('bundles'), ...listFiles('lib')].filter(
    (file) => !/\.(png|jpe?g|gif|pdf|ico)$/.test(file),
  );
  assert.deepEqual(findUnsyncedPaths(files), []);
});

test('findUnsyncedPaths: flags a hook copy, a missing script and a script from another bundle', () => {
  const files = {
    'bundles/setup-project/skills/a/SKILL.md': 'node .claude/hooks/check-commit-msg.mjs',
    'bundles/workflow/skills/b/SKILL.md': 'node .agents/skills/verify/scripts/gone.mjs',
    'bundles/setup-project/templates/c': 'node .claude/skills/gdd/scripts/setup.mjs',
    'bundles/workflow/rules/d.sh': 'hook="$(dirname "$0")/../../setup-project/skills/x"',
    'lib/e.js': "join(cwd, '.claude', 'hooks', 'x.mjs')",
    'bundles/workflow/skills/f/SKILL.md': 'node .agents/skills/verify/scripts/verify.mjs push',
  };
  const findings = findUnsyncedPaths(Object.keys(files), (file) => files[file]);
  assert.equal(findings.length, 5, findings.join('\n'));
  assert.ok(!findings.some((finding) => finding.startsWith('bundles/workflow/skills/f/')));
});
