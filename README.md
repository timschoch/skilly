# skilly

Personal skill hub: bundles + CLI + nightly sync. Spec: [docs/spec-v1.md](docs/spec-v1.md). Bundle catalog: [docs/bundles.md](docs/bundles.md).

## New-repo setup, in order

Skilly first — a fresh repo has no hooks or rules yet, so the onboarding commit lands cleanly, and it installs every setup skill the later steps need. Guardrails last — they block the pushes the middle steps make.

1. `gh repo create <owner>/<repo> --private --clone` — create the repo before any tooling.
2. `npx github:timschoch/skilly onboard setup-project` — secrets, setup skills only, sync workflow, onboarding PR.
3. `/setup-project` — asks: default workflow or just skilly; either way it onboards the repo's bundles (`workflow`, `tech-*`, … — onboard re-runs merge in), default also drives steps 4–8.
4. `/setup-pre-commit` or skip — asks: Husky + lint-staged + Prettier, or the repo's own pre-commit stack (skip — nothing automated yet).
5. `/setup-repo` — GitHub repo config, conventional-commit + protected-branch rules wired into step 4's hooks, the writing-rules write-action hook, CLAUDE.md scaffold (pattern: habits-v2).
6. `/setup-matt-pocock-skills` — issue tracker, triage labels, domain-doc layout.
7. `/setup-release-please` — release automation plus the merge settings git-shortcuts expects.
8. `/git-guardrails-claude-code` — hooks that block dangerous git commands; last, so earlier steps can still push.

Stack-specific installers (e.g. `/trigger-setup`) run between steps 7 and 8, only where the stack needs them.
