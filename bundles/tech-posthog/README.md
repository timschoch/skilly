# tech-posthog

The official integrations for our stacks, hogql, and Hub `posthog-cli`. PostHog/skills has 200+ skills, so stay minimal.

The Source is a tree URL into `skills/posthog/all/`. That folder is a maintained aggregate, byte-identical to the per-group skills. It sits too deep for the skills CLI to find from the repo root. Both framework integrations are deliberate: `integration-nextjs-app-router` (Next.js stacks), `integration-tanstack-start` (habits stack).

Left out (2026-08-31):

- `error-tracking-nextjs` / `error-tracking-react`: add when a project adopts PostHog error tracking.
- Everything omnibus/* and team/*: PostHog-internal ops and sales tooling.
- Other per-framework integrations: not our stacks.
