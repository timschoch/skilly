# skilly

## Bundle rules

- tech-* bundles: max 3-4 skills (rare exceptions allowed). Consumers load many tech-* at once — don't pollute their context window.
- Record left-out skills and why in the bundle's README.md.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `timschoch/skilly`, driven by the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary — each label string equals its canonical role name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
