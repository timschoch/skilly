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
- **product** — deployed and depended on. Adds e2e smoke and a nightly.

The tiers are nested: a product repo runs everything a sandbox repo runs. A lower tier means a smaller net, never a lower standard of code.

Write the answer into `.skilly/config.json` (created by `skilly setup`):

```sh
node -e 'const fs=require("fs"),f=".skilly/config.json",c=JSON.parse(fs.readFileSync(f,"utf8"));c.tier="tool";fs.writeFileSync(f,JSON.stringify(c,null,2)+"\n")'
```

## 1. Hooks

Nothing to do here. The Sync writes the git hooks and the Claude Code hooks from the Bundles' hook entries:

- lefthook: the skilly commands in `.skilly/lefthook.json`, pulled into `lefthook.yml` by its `extends` list. A repo on husky moves to lefthook.
- Claude Code: the skilly entries in `.claude/settings.json`.

The repo's own entries in both files stay. A new check is a step in `.skilly/verify.json`, never a line in a hook.

A copy in `.claude/hooks/` from an earlier run: delete it, and delete the entry in `.claude/settings.json` that runs it.

## 2. `.skilly/verify.json`

The default steps ship with the Engine: `.skilly/engine/verify/verify.json`. Never copy them. `.skilly/verify.json` holds only this repo's changes. A step with a default's `name` changes that step; merge rules in the verify skill's `SKILL.md`, section Override. Make three kinds of change and nothing else: the tier gates ship correct, and `verify` skips whatever sits above the repo's tier.

- **Package manager.** The defaults are npm. A `pnpm-lock.yaml` → per step whose `run` has `npm run` or `npx`, add `{ "name": "<step>", "run": "<pnpm form>" }`: `pnpm run` for `npm run`, `pnpm dlx` for `npx`; keep `--if-present` before the script name, pnpm passes it to the script otherwise. In `unit (changed)` change only the test command, keep the `node .agents/skills/verify/scripts/run-changed-tests.mjs origin/main` in front of it: that script is the guard. A `yarn.lock` → `yarn dlx` for `npx`, `yarn <script>` for `npm run --if-present <script>`, and `"-<step>"` for each step whose script `package.json` lacks: yarn has no `--if-present`.
- **`target`.** One path per step, the file whose absence skips it. Where this repo's file differs, add `{ "name": "<step>", "target": "<path>" }`: `playwright.config.ts` may be `.mjs`; `vitest.config.ts` may be `vite.config.ts` only when that file holds a `test` block, a Vite app without Vitest keeps `vitest.config.ts` so the step skips.
- **`fullSuiteTriggers`.** `unit (changed)` runs only the tests that import a changed file. Add each path that changes test results and that no test imports, for example the migrations folder: `"fullSuiteTriggers": ["drizzle/"]`. Lockfiles, `package.json` and the Vitest config are defaults.

No change needed → no file. Check the result: `node .agents/skills/verify/scripts/verify.mjs push --steps`.

The `mermaid` step parses diagrams with the repo's own packages. A `package.json` → `npm i -D mermaid jsdom` (pnpm and yarn: `add -D`).

The `lint` step runs the repo's own linter. `skilly setup` keeps formatters off `.agents/` and `.claude/`, not linters. An `eslint.config.*` → add `{ ignores: ['.agents/', '.claude/'] }` as its first entry; a typed config otherwise fails on vendored skill examples outside `tsconfig.json`.

## 3. Workflows

Copy into `.github/workflows/`:

| Template | Install for |
| --- | --- |
| `workflows/ci.yml` | every tier |
| `workflows/nightly.yml` | product |
| `workflows/ai-review.yml` | tool, product |

`ci.yml` triggers on pushes to `main` — rename the branch if the default differs.

`ci.yml` picks the verify stage on each run:

| Repo | A PR runs | The release PR runs |
| --- | --- | --- |
| product tier, with `nightly.yml` and a release-please workflow | `pr`: the tests the diff reaches, no e2e | `ci`: full unit suite, e2e smoke |
| any other | `ci` | `ci` |

The release PR and the nightly are the net for what `pr` leaves out, so `pr` runs only where both exist. Make `verify` a required check, so a red release PR blocks the release. `nightly.yml` opens one issue (labels `critical`, `nightly-red`) on a red night.

`ai-review.yml` needs a secret. Hand the user `claude setup-token` then `gh secret set CLAUDE_CODE_OAUTH_TOKEN`; never ask for the token in chat. It is subscription-billed ($0 marginal) and documented to last a year.

## 4. GitHub settings

Give the default branch (`node .agents/skills/verify/scripts/default-branch.mjs`) a ruleset refusing force pushes and deletions. Skip when `gh api repos/{owner}/{repo}/rulesets --jq '.[].name'` already lists `protect-trunk`:

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

Nothing to do here: the Sync writes them, see part 1. Check one guard after the first Sync: `echo '{"tool_input":{"command":"git reset --hard"}}' | bash .skilly/engine/verify/block-destructive-git.sh` exits 2.

## 6. CLAUDE.md

Missing → scaffold the constitution pattern: the file is an index plus the few rules that stop real damage, no rule that has a home elsewhere. Sections: **Commands** (what to run), **Which skill, in which order**, pointers to `GLOSSARY.md` / docs. Present → leave it; suggest gaps at most.
