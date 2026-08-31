---
name: setup-skilly
description: >
  Onboard a repo to skilly: pick bundles, run the onboard command, watch the first
  sync run. Use when the user wants skilly set up in a repo, skills installed via
  bundles, or the nightly skill sync wired up.
---

# Setup skilly

Onboards a consumer repo to [skilly](https://github.com/timschoch/skilly) — bundle-based skill installs plus a nightly sync that opens PRs. Bundle choice is the only judgment step; `skilly onboard` does the rest deterministically. Command internals, file formats, workflow: the [v1 spec](https://github.com/timschoch/skilly/blob/main/docs/spec-v1.md). Bundle catalog: [docs/bundles.md](https://github.com/timschoch/skilly/blob/main/docs/bundles.md).

## Steps

1. **Pick bundles.** Read the catalog, propose a set, let the user confirm:
   - every repo: `workflow`
   - a `project-<x>` bundle when one exists for this project (it already includes its tech bundles)
   - otherwise the `tech-*` bundles matching the stack (check `package.json` / lockfiles)
   - `marketing` only where the repo produces marketing content

2. **Onboard:**

   ```sh
   npx github:timschoch/skilly onboard <bundle...>
   ```

   Deterministic and idempotent: App secrets, skill install, sync workflow, `private-owner` resolution, onboarding PR. On an already-onboarded repo it merges the bundles in and syncs — safe to re-run.

3. **Validate in real CI** after the merge: `gh workflow run skilly-sync.yml`, then `gh run watch` until green; the gate check appears on the next PR. Local auth tests on this Mac lie (the machine SSH key bypasses `$HOME` isolation) — a green CI run is the only proof.

## Known limits

- Gate failures are a red check, not a hard block — Free private repos cannot require checks.
- The nightly never prunes. Removing skills is a local, human-confirmed `npx github:timschoch/skilly sync --prune`.
- Upstream-deleted skills surface only as warnings in the Sync PR body.
