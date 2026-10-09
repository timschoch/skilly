---
name: setup-repo
description: >
  Tier a repo and build its gate: the tier in `.skilly/config.json`, git hooks
  (lint-staged, verify, conventional commits and branches, protected trunk), CI / nightly /
  ai-review workflows, GitHub ruleset and Dependabot, a Claude Code guard
  against work-destroying git commands, CLAUDE.md scaffold. Use when the user
  wants repo hardening, a dev process, branch protection, or CI set up.
---

# Setup repo

Seven parts, each idempotent — skip what already holds. Prerequisite: the `verify` skill (workflow bundle), since every hook and workflow calls `node .agents/skills/verify/scripts/verify.mjs <stage>`. Not installed → install it first.

Templates sit in `templates/` beside this file. **Copy** them into the repo; never reference a path inside the skill folder, which is wiped on every sync.

## 0. Pick the tier

Ask the user which one this repo is:

- **sandbox** — demos, spikes, dormant repos. Clean code, no required checks (CI and the PR gate report, nothing blocks merge), no spend.
- **tool** — another repo or another person consumes it. Adds required checks, `/ai-review`, dependency security.
- **product** — deployed and depended on. Adds e2e smoke on the PR and a nightly.

The tiers are nested: a product repo runs everything a sandbox repo runs. A lower tier means a smaller net, never a lower standard of code.

Write the answer into `.skilly/config.json` (created by `skilly setup`):

```sh
node -e 'const fs=require("fs"),f=".skilly/config.json",c=JSON.parse(fs.readFileSync(f,"utf8"));c.tier="tool";fs.writeFileSync(f,JSON.stringify(c,null,2)+"\n")'
```

## 1. Hooks

Hooks stay deterministic and fast: they run shell commands only. A new check is a step in `.skilly/verify.json`, never a line in a hook.

Copy the rule scripts in — they become repo-owned, and re-running this skill refreshes them:

- `scripts/check-commit-msg.mjs` → `.claude/hooks/check-commit-msg.mjs` — conventional-commit gate (the why: the `writing-rules` skill, group 7)
- `scripts/check-push-branch.mjs` → `.claude/hooks/check-push-branch.mjs` — refuses a direct push to the detected trunk
- `scripts/check-branch-name.mjs` → `.claude/hooks/check-branch-name.mjs` — Conventional Branch gate, a default `push` step of the verify skill, not a hook line
- `scripts/block-destructive-git.sh` → `.claude/hooks/block-destructive-git.sh` (`chmod +x`) — wired in part 5
- `scripts/block-invalid-branch-push.sh` → `.claude/hooks/block-invalid-branch-push.sh` (`chmod +x`) — wired in part 5, runs `check-branch-name.mjs`
- `scripts/block-unverified-push.sh` → `.claude/hooks/block-unverified-push.sh` (`chmod +x`) — wired in part 5, runs the verify `push` stage

Then wire the manager the repo already has — `.husky/` → husky, `lefthook.yml` → lefthook, neither → `npm i -D husky && npx husky init`:

- **husky**: copy `templates/husky/*` into `.husky/`, `chmod +x`.
- **lefthook**: merge `templates/lefthook.yml` into the repo's, keeping its existing commands.

`pre-commit` calls `lint-staged` directly instead of `verify commit`: lint-staged needs the staged-file list that only the hook holds, so the `commit` stage stays empty.

## 2. `.skilly/verify.json`

The default steps ship with the verify skill: `.agents/skills/verify/references/verify.json`. Never copy them. `.skilly/verify.json` holds only this repo's changes. A step with a default's `name` changes that step; merge rules in the verify skill's `SKILL.md`, section Override. Make two kinds of change and nothing else: the tier gates ship correct, and `verify` skips whatever sits above the repo's tier.

- **Package manager.** The defaults are npm. A `pnpm-lock.yaml` → per step whose `run` has `npm run` or `npx`, add `{ "name": "<step>", "run": "<pnpm form>" }`: `pnpm run` for `npm run`, `pnpm dlx` for `npx`; keep `--if-present` before the script name, pnpm passes it to the script otherwise. A `yarn.lock` → `yarn dlx` for `npx`, `yarn <script>` for `npm run --if-present <script>`, and `"-<step>"` for each step whose script `package.json` lacks: yarn has no `--if-present`.
- **`target`.** One path per step, the file whose absence skips it. Where this repo's file differs, add `{ "name": "<step>", "target": "<path>" }`: `playwright.config.ts` may be `.mjs`; `vitest.config.ts` may be `vite.config.ts` only when that file holds a `test` block, a Vite app without Vitest keeps `vitest.config.ts` so the step skips.

No change needed → no file. Check the result: `node .agents/skills/verify/scripts/verify.mjs push --steps`.

The `lint` step runs the repo's own linter. `skilly setup` keeps formatters off `.agents/` and `.claude/`, not linters. An `eslint.config.*` → add `{ ignores: ['.agents/', '.claude/'] }` as its first entry; a typed config otherwise fails on vendored skill examples outside `tsconfig.json`.

## 3. Workflows

Copy into `.github/workflows/`:

| Template | Install for |
| --- | --- |
| `workflows/ci.yml` | every tier |
| `workflows/nightly.yml` | product |
| `workflows/ai-review.yml` | tool, product |

`ci.yml` triggers on pushes to `main` — rename the branch if the default differs.

`ai-review.yml` needs a secret. Hand the user `claude setup-token` then `gh secret set CLAUDE_CODE_OAUTH_TOKEN`; never ask for the token in chat. It is subscription-billed ($0 marginal) and documented to last a year.

## 4. GitHub settings

Give the default branch (`git symbolic-ref --short refs/remotes/origin/HEAD | sed 's|^origin/||'`, fallback `main`) a ruleset refusing force pushes and deletions. Skip when `gh api repos/{owner}/{repo}/rulesets --jq '.[].name'` already lists `protect-trunk`:

```sh
gh api repos/{owner}/{repo}/rulesets --input - <<'JSON'
{
  "name": "protect-trunk",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [{ "type": "deletion" }, { "type": "non_fast_forward" }]
}
JSON
```

On **tool** and **product**, add the CI job and the PR gate as required checks — a third rule in the same array:

```json
{ "type": "required_status_checks", "parameters": {
  "strict_required_status_checks_policy": true,
  "required_status_checks": [{ "context": "verify" }, { "context": "skilly / gate" }] } }
```

Then allow auto-merge. The gate merges a green Sync PR with `gh pr merge --auto`, which waits for the required checks only when this is on:

```sh
gh api -X PATCH repos/{owner}/{repo} -F allow_auto_merge=true
```

A **403** on the rulesets call means rulesets are unavailable for this repo. Fall back without fuss: tell the user trunk protection stays local — the `pre-push` hook from part 1 — and continue. Free private repos cannot *require* checks, so the gate stays a red check rather than a hard block; GitHub Pro and Team can. State that once and move on; never push a plan or suggest making the repo public. Merge-method settings (squash, delete-branch-on-merge) live in `/setup-release-please`, not here.

On **tool** and **product**, also scaffold `.github/dependabot.yml`:

```yaml
version: 2
updates: [{ package-ecosystem: npm, directory: /, schedule: { interval: weekly }, rebase-strategy: disabled }]
```

`rebase-strategy: disabled`: by default Dependabot force-pushes a PR each time it conflicts with the trunk, and every force-push reruns CI and the preview builds. A lockfile that changes often makes that dozens of runs per PR. Comment `@dependabot rebase` on a PR to update it by hand.

## 5. Claude Code hooks

Merge each entry into `.claude/settings.json` `hooks.PreToolUse`; skip an entry whose command is already there. Never overwrite other settings.

**Destructive-git guard** — blocks `reset --hard`, `clean -f`, `checkout .` / `restore .`, `branch -D`, bare `push --force`. Plain pushes and `--force-with-lease` pass; trunk safety is part 4 and the `pre-push` hook. Needs `jq`.

```json
{
  "matcher": "Bash|mcp__lean-ctx__ctx_shell|mcp__lean-ctx__shell",
  "hooks": [{ "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/block-destructive-git.sh" }]
}
```

Verify: `echo '{"tool_input":{"command":"git reset --hard"}}' | .claude/hooks/block-destructive-git.sh` exits 2.

**Branch-name guard** — runs `check-branch-name.mjs` before the agent's `git push` or `gh pr create`. The `pre-push` hook needs `npm install`, which a fresh worktree lacks; this one needs only `node` and `jq`, and `--no-verify` does not skip it.

```json
{
  "matcher": "Bash|mcp__lean-ctx__ctx_shell|mcp__lean-ctx__shell",
  "hooks": [{ "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/block-invalid-branch-push.sh" }]
}
```

Verify: on a branch named `wip`, `echo '{"tool_input":{"command":"git push"}}' | .claude/hooks/block-invalid-branch-push.sh` exits 2.

**Unverified-push guard** — runs the verify `push` stage before the agent's `git push` when git will not: no installed `pre-push` hook (a fresh worktree before `npm install`), or `--no-verify` in the command. With the hook installed it does nothing, so the stage runs once. The workflow bundle must be added first; without the verify skill the guard passes. Needs `node` and `jq`.

```json
{
  "matcher": "Bash|mcp__lean-ctx__ctx_shell|mcp__lean-ctx__shell",
  "hooks": [{ "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/block-unverified-push.sh" }]
}
```

Verify: `echo '{"tool_input":{"command":"git push --no-verify"}}' | .claude/hooks/block-unverified-push.sh` prints the `push` steps.

**Writing-rules injection** — the `writing-rules` skill (workflow bundle) injects its rule sidecars on every file-writing tool call. The workflow bundle must be added first — the script lives in the installed skill. Not installed? Skip this entry and say so.

```json
{
  "matcher": "Write|Edit|NotebookEdit|mcp__lean-ctx__ctx_patch|mcp__lean-ctx__ctx_call",
  "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/skills/writing-rules/scripts/inject-writing-rules.mjs\"" }]
}
```

## 6. CLAUDE.md

Missing → scaffold the constitution pattern: the file is an index plus the few rules that stop real damage, no rule that has a home elsewhere. Sections: **Commands** (what to run), **Which skill, in which order**, pointers to `GLOSSARY.md` / docs. Present → leave it; suggest gaps at most.
