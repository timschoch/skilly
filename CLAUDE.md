# skilly

## No Slack

Never post or offer Slack summaries for this repo — skip the git-shortcuts post-merge Slack step entirely.

## Bundle rules

- tech-* bundles: max 3-4 skills (rare exceptions allowed). Consumers load many tech-* at once — don't pollute their context window.
- Record left-out skills and why in the bundle's README.md.

## Skill writing

- Name the capability, not the host. The running agent detects what its env offers. Host names, tool names and rollout details go stale and break the skill.
  - Bad: "T3 Code: call `t3_thread_launch` with `workspaceStrategy`... Claude Projects: claude.ai/code only, not the CLI..."
  - Good: "Start each agent as a thread when your host offers threads. Fall back to a background subagent only when it does not."

## Agent skills

### Issue tracker

Issues live as GitHub issues in `timschoch/skilly`, driven by the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary — each label string equals its canonical role name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
