import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATES_DIR = fileURLToPath(new URL('../../engine/templates/', import.meta.url));

// A fixture Release snapshot and a fixture checkout for the Sync tests.
// The snapshot holds two Bundles and a two-file Engine. The Hub bundle pulls
// its skills from the Hub, so the Sync must pin them to the Release.
export function writeFiles(root, files) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

export function makeSnapshot(release = 'v1.0.0') {
  const dir = mkdtempSync(join(tmpdir(), 'skilly-snapshot-'));
  writeFiles(dir, {
    'bundles/hubby/config.json': JSON.stringify({
      sources: [{ source: 'timschoch/skilly', skills: ['hub-skill'] }],
      hooks: {
        lefthook: {
          'pre-push': { commands: { 'skilly-verify': { run: 'node .skilly/engine/verify/verify.mjs push' } } },
        },
        claude: {
          PreToolUse: [
            { matcher: 'Bash', hooks: [{ type: 'command', command: 'node .skilly/engine/gdd/check-pr.mjs' }] },
          ],
        },
      },
    }),
    'bundles/hubby/rules/hubby-rule.md': '# hubby rule\n',
    'bundles/other/config.json': JSON.stringify({
      sources: [{ source: 'owner/one', skills: ['one-skill', 'loose-skill'] }],
    }),
    'bundles/other/rules/other-rule.md': '# other rule\n',
    'bundles/extra/config.json': JSON.stringify({ sources: [{ source: 'owner/two', skills: ['rules-skill'] }] }),
    'engine/bin/skilly.js': `// engine ${release}\n`,
    'engine/lib/thing.js': 'export const thing = 1;\n',
  });
  // The real Managed file templates, so the Sync tests check what Consumers get.
  cpSync(TEMPLATES_DIR, join(dir, 'engine', 'templates'), { recursive: true });
  return { dir, release };
}

export function makeCheckout(config) {
  const cwd = mkdtempSync(join(tmpdir(), 'skilly-checkout-'));
  writeFiles(cwd, { '.skilly/config.json': JSON.stringify({ tier: 'sandbox', bundles: [], ...config }) });
  return cwd;
}

// Stands in for the skills CLI: keeps skills-lock.json and the skill folders,
// and records each call. A skill named `rules-skill` ships its own Router rule.
export function fakeSkills() {
  const calls = [];
  const lockPath = (cwd) => join(cwd, 'skills-lock.json');
  const readLock = (cwd) => (existsSync(lockPath(cwd)) ? JSON.parse(readFileSync(lockPath(cwd), 'utf8')).skills : {});
  const writeLock = (cwd, skills) => writeFileSync(lockPath(cwd), JSON.stringify({ version: 1, skills }, null, 2));
  return {
    calls,
    readLock,
    add(cwd, source, names) {
      calls.push(['add', source, names]);
      const lock = readLock(cwd);
      for (const name of names) {
        lock[name] = { source: source.split('#')[0], ref: source.split('#')[1] };
        writeFiles(cwd, { [`.claude/skills/${name}/SKILL.md`]: `# ${name} from ${source}\n` });
        if (name === 'rules-skill') writeFiles(cwd, { [`.claude/skills/${name}/rules/${name}-x.md`]: '# x\n' });
      }
      writeLock(cwd, lock);
      return { added: names, missing: [] };
    },
    remove(cwd, names) {
      calls.push(['remove', names]);
      const lock = readLock(cwd);
      for (const name of names) {
        delete lock[name];
        rmSync(join(cwd, '.claude/skills', name), { recursive: true, force: true });
      }
      writeLock(cwd, lock);
      return { removed: names, left: [] };
    },
    update() {
      calls.push(['update']);
      return { changed: [] };
    },
  };
}
