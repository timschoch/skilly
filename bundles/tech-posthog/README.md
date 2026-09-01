# tech-posthog

Official integrations for our stacks + hogql + hub `posthog-cli`. Upstream has 200+ skills — stay minimal.

Sourced via a tree URL into `skills/posthog/all/` — a maintained aggregate, byte-identical to the per-group skills, but nested too deep for the skills CLI to discover from the repo root. Both framework integrations are deliberate: `integration-nextjs-app-router` (Next.js stacks), `integration-tanstack-start` (habits stack).

Left out (2026-08-31):

- `error-tracking-nextjs` / `error-tracking-react` — add when a project adopts PostHog error tracking.
- Everything omnibus/* and team/* — PostHog-internal ops and sales tooling.
- Other per-framework integrations — not our stacks.
