# ADR-0001: One verify regime, three nested tiers

Status: accepted, 2026-09-15

## Context

Checks ran too early and too often. An LLM review step in a pre-push hook cost up to 5 minutes per push. Across 20 leading public repos, 0 run an LLM inside a git hook. A sample of ~100 merged PRs shows zero reviews despite a required check. Private repos on GitHub Free cannot require checks on `main`. The budget is one Claude Max subscription; `claude-code-action` runs on it at zero marginal cost.

## Decision

1. Three tiers, nested: sandbox ⊂ tool ⊂ product. Every stage a lower tier runs, the higher tiers run too. Stage table: [dev-process.md](../dev-process.md#tiers).
2. One config, `.skilly/verify.json`. Entry point `verify <stage>`. Hooks and CI call it. Adding a check is one line there, never a line in a hook or a workflow.
3. No LLM in any git hook. Review runs on request: `/code-review` locally, `/ai-review` as a PR comment runs the same skill via `claude-code-action` on the Max OAuth token.
4. `.skilly/` replaces `.skilly.json`, `docs/agents/naming.json`, and each consumer's own verify config.
5. GitHub Pro per account for tool- and product-tier private repos, with `verify` as the required check on `main`.
6. `babysit-pr` is ported from `openai/codex` (Apache-2.0, attribution required). No auto-merge. Reviewers come from `.skilly/config.json`.
7. The product tier owns nightly full e2e, dependency drift, and security scan, plus `/security-review` before release.

## Consequences

Consumers drop their own LLM hook steps, such as a pre-push `claude -p` review. Nightly is the cost driver, roughly 360 minutes per month per product repo. The sandbox tier keeps the same code quality bar as product; the tier sets the net's size, not the standard. Rollout: the consumer closest to the target shape first, the one with the most bespoke hooks last.

## Rejected

- LLM review on every push.
- Auto-merge inside `babysit-pr`.
- One flat config file for tier, verify steps, naming, and writing overrides.
