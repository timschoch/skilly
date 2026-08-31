---
name: setup-project
description: >
  Main entry point when starting work in a new repo. Asks whether to run the full
  default setup or just skilly, onboards the repo's bundles, and drives the other
  setup skills in order. Use when the user wants to set up a new project or repo.
---

# Setup project

Drives the new-repo setup order from the [hub README](https://github.com/timschoch/skilly#new-repo-setup-in-order). Skilly first (it installs the setup skills), guardrails last (they block the pushes the middle steps make).

## Steps

1. **Ask**: full default setup, or just skilly (skill installs + nightly sync only)?

2. **Onboard the bundles.** Propose the set from the [catalog](https://github.com/timschoch/skilly/blob/main/docs/bundles.md), let the user confirm:
   - every repo: `workflow`
   - a `project-<x>` bundle when one exists (it already includes its tech bundles)
   - otherwise the `tech-*` bundles matching the stack (check `package.json` / lockfiles)
   - `marketing` only where the repo produces marketing content

   ```sh
   npx github:timschoch/skilly onboard <bundle...>
   ```

   Idempotent — a re-run merges the bundles into the existing `.skilly.json`.

3. **Just skilly → done.** Full default → run each of these, finishing one before the next:
   1. Ask which pre-commit stack: Husky + lint-staged + Prettier → `/setup-pre-commit`; the repo's own stack → skip (nothing automated for it yet — add a sibling skill when one earns its place).
   2. `/setup-repo` — GitHub settings, commit/branch rules wired into the hooks just chosen, `CLAUDE.md` scaffold.
   3. `/setup-matt-pocock-skills` — issue tracker, triage labels, domain-doc layout.
   4. `/setup-release-please` — release automation plus merge settings.
   5. Stack installers where the stack needs them (e.g. `/trigger-setup`).
   6. `/git-guardrails-claude-code` — last: it blocks the git pushes earlier steps need.

4. **Validate in real CI** after the onboarding PR merges: `gh workflow run skilly-sync.yml`, then `gh run watch` until green. Local auth tests on this Mac lie (the machine SSH key bypasses `$HOME` isolation).
