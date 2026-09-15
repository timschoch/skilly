// A skilly consumer with one planted defect per audit-skilly-workflow check,
// plus meaning conflicts that share no keywords with the rule they break.
// Kept as strings, not as files on disk: a real CLAUDE.md under test/ would
// load into agents working here.
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// The hook setup-repo ships, so a change to its format breaks the gate parser test.
const COMMIT_HOOK = readFileSync(
  new URL('../../bundles/setup-project/skills/setup-repo/scripts/check-commit-msg.mjs', import.meta.url),
  'utf8',
);

export const REPO_FILES = {
  '.skilly.json': JSON.stringify({ bundles: ['workflow'] }),
  '.agents/skills/demo-skill/SKILL.md': '---\nname: demo-skill\ndescription: Shows a demo.\n---\n\n# Demo\n',
  '.claude/rules/workflow-delegation.md':
    '# Delegation\n\n1. Work one agent finishes in one pass: do it yourself, spawn no subagent.\n',
  '.claude/rules/workflow-delegation.local.md':
    '# Delegation overlay\n\n1. This repo: every task runs in a subagent.\n',
  '.claude/rules/workflow-sign-off.md':
    '# Sign-off\n\n1. Stage finished work and stop. The user commits, pushes and opens the PR.\n',
  '.claude/rules/workflow-commits.md':
    '# Commits\n\n1. Conventional commits, see `.claude/hooks/check-commit-msg.mjs`.\n',
  '.claude/rules/workflow-retired.local.md': '# Retired overlay\n\n1. Overrides a rule that no longer ships.\n',
  '.claude/hooks/check-commit-msg.mjs': COMMIT_HOOK,
  '.claude/hooks/guard.sh': '#!/bin/sh\nexit 0\n',
  '.claude/settings.json': JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: 'Bash', hooks: [{ type: 'command', command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/guard.sh' }] },
        { matcher: 'Bash', hooks: [{ type: 'command', command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/guard.sh' }] },
        {
          matcher: 'Write|Edit|mcp__lean-ctx__ctx_patch',
          hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/gone.mjs"' }],
        },
      ],
    },
  }),
  '.husky/commit-msg': 'node .claude/hooks/check-commit-msg.mjs "$1"\n',
  'commitlint.config.js': "export default { extends: ['@commitlint/config-conventional'] };\n",
  'CLAUDE.md': [
    '# Project',
    '',
    '- Hand every piece of work, however small, to a helper worker so this chat stays clean.',
    '- Keep the first line of a commit under 90 characters.',
    '- A slow pre-commit step? Commit with `git commit -n`.',
    '- When a change is ready, push the branch and open the pull request right away.',
    '- Decisions live in [the log](docs/decisions/).',
    '',
  ].join('\n'),
};

const HOME_FILES = {
  '.claude/CLAUDE.md': '# Me\n\n- Finish every task by merging it yourself; do not wait for a review.\n',
  '.claude/skills/demo-skill/SKILL.md': '---\nname: demo-skill\ndescription: An older demo.\n---\n',
};

function writeFiles(directory, files) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), text);
  }
}

const runGit = (directory, ...parts) =>
  execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...parts], {
    cwd: directory,
    stdio: 'ignore',
  });

// Sync commit, then a later hand edit of one synced rule.
export function writeConsumer(repo, home) {
  writeFiles(repo, REPO_FILES);
  writeFiles(home, HOME_FILES);
  chmodSync(join(repo, '.claude/hooks/guard.sh'), 0o644);
  runGit(repo, 'init', '-q');
  runGit(repo, 'add', '-A');
  runGit(repo, 'commit', '-q', '--no-verify', '-m', 'chore(skilly): update skills');
  writeFileSync(join(repo, '.claude/rules/workflow-commits.md'), '# Commits\n\n1. Any format goes.\n');
  runGit(repo, 'commit', '-q', '--no-verify', '-am', 'docs: loosen commits');
}
