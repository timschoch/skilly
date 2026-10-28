# ADR-0005: CI and nightly run as Shared workflows from the Hub

Status: superseded by [ADR-0008](0008-hub-run-sync-and-pinned-engine.md), 2026-10-28. Never built.

## Context

[setup-repo](../../bundles/setup-project/skills/setup-repo/SKILL.md#3-workflows) copies `ci.yml` and `nightly.yml` into each Consumer, and the Consumer then owns the copy. The Sync PR updates skills, not files under `.github/workflows/`. So a workflow change, for example the stage pick of [ADR-0003](0003-pr-stage-defers-full-suites.md) or the nightly rules of [ADR-0004](0004-nightly-runs-only-on-change.md), reaches a Consumer only when an agent runs setup-repo there again. Copies also drift: glue edited its copy with a trigger and three `test -z "$VERIFY_FULL"` overrides.

The skilly sync already works the other way: [sync.yml](../../.github/workflows/sync.yml) is a `workflow_call` workflow in the Hub, and each Consumer holds a short caller.

## Decision

1. `ci.yml` and `nightly.yml` become Shared workflows in the Hub (`on: workflow_call`). A Shared workflow installs and calls verify with the event: PR, release PR, push or schedule. verify picks the stage and the browsers it needs. The Shared workflow holds no check and no stage logic.
   - verify picks `pr` for each PR of a product-tier repo, except the release PR. Each product repo has a nightly and a release PR: setup-repo installs both, the release PR through [setup-release-please](../../bundles/setup-project/skills/setup-release-please/SKILL.md). So no step looks for a workflow file.
   - The nightly stage comes from the plan script of [ADR-0004](0004-nightly-runs-only-on-change.md) decision 6.
2. Each Consumer holds one caller per workflow, about 10 lines, pinned to `@main`. All Consumers belong to the same owner set, so a tag adds release work and protects against nothing: one fix in the Hub fixes every Consumer.
3. A Consumer configures its CI in these places only:

   | Change                                       | Place                                  |
   | -------------------------------------------- | -------------------------------------- |
   | a check: add, change, remove                 | `.skilly/verify.json`                  |
   | tier                                         | `.skilly/config.json`                  |
   | triggers (`on:`), permissions, `concurrency` | the caller                             |
   | Node version, package manager                | detected, a `with:` input overrides    |
   | secrets and env                              | `secrets: inherit` in the caller       |
   | a service, another OS                        | an extra workflow file in the Consumer |
   | fully custom CI                              | its own copy, no caller                |

   The Shared workflow detects the package manager from the lockfile (`package-lock.json`, `pnpm-lock.yaml`) and the Node version from `.nvmrc` or `package.json` `engines`. With neither, it uses `lts/*`.

4. setup-repo writes the callers. One run per Consumer:
   - replaces an existing copy. It shows the diff first and moves each local edit to the caller or to `.skilly/verify.json`.
   - removes a `test -z "$VERIFY_FULL"` override from `.skilly/verify.json`, or sets `"replaces": null` on it, per [ADR-0003](0003-pr-stage-defers-full-suites.md#consequences).
   - swaps the required check `verify` for `ci / verify` in the ruleset on `main`. `skilly / gate` stays.
   - closes an open `nightly-red` issue.
5. `ai-review.yml` stays a copy.
6. A Shared workflow change that needs a new verify ships in one go: merge it in the Hub, then run the update on all Consumers the same day. All Consumers belong to the same owner set, so one person can do this.
7. The Hub's CI has a fixture Consumer job. It calls both Shared workflows through a local caller and runs `actionlint` on them.

## Consequences

A bad change in a Shared workflow reaches every Consumer on its next run, with no Sync PR between. The fixture job of decision 7 is the guard. The caller job is named `ci`, so the required check is `ci / verify`. Until decision 4 swaps it, every PR waits for a `verify` check that never reports. A Shared workflow gets no more permissions than its caller grants, so the nightly caller grants `issues: write`.

## Rejected

- Keep the copies and run setup-repo after each workflow change. One agent run per Consumer per change, forever.
- Pin callers to a tag. See decision 2.
- One version source per run: the Shared workflow runs verify from the Hub checkout, or checks the verify version. The Shared workflow is on `@main`, verify arrives with the Sync PR, so between the two a workflow that needs a new verify fails. Decision 6 closes that gap with less code.
- Workflow probes for the stage pick (`nightly.yml` present, `release-please-action` in a workflow). A caller with another file name breaks them.
