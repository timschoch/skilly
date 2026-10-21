# ADR-0005: CI and nightly run as Shared workflows from the Hub

Status: proposed, 2026-10-21

## Context

[setup-repo](../../bundles/setup-project/skills/setup-repo/SKILL.md#3-workflows) copies `ci.yml` and `nightly.yml` into each Consumer, and the Consumer then owns the copy. The Sync PR updates skills, not files under `.github/workflows/`. So a workflow change, for example the stage pick of [ADR-0003](0003-pr-stage-defers-full-suites.md) or the nightly rules of [ADR-0004](0004-nightly-runs-only-on-change.md), reaches a Consumer only when an agent runs setup-repo there again. Copies also drift: glue edited its copy with a trigger and three `test -z "$VERIFY_FULL"` overrides.

The skilly sync already works the other way: [sync.yml](../../.github/workflows/sync.yml) is a `workflow_call` workflow in the Hub, and each Consumer holds a short caller.

## Decision

1. `ci.yml` and `nightly.yml` become Shared workflows in the Hub (`on: workflow_call`). A Shared workflow installs, picks the stage and calls `verify <stage>`. It holds no check.
2. Each Consumer holds one caller per workflow, about 10 lines, pinned to `@main`. All Consumers belong to the same owner set, so a tag adds release work and protects against nothing: one fix in the Hub fixes every Consumer.
3. A Consumer configures its CI in these places only:

   | Change                                       | Place                                  |
   | -------------------------------------------- | -------------------------------------- |
   | a check: add, change, remove                 | `.skilly/verify.json`                  |
   | tier                                         | `.skilly/config.json`                  |
   | triggers (`on:`), permissions, `concurrency` | the caller                             |
   | Node version, package manager                | `with:` inputs of the caller           |
   | secrets and env                              | `secrets: inherit` in the caller       |
   | a service, another OS                        | an extra workflow file in the Consumer |
   | fully custom CI                              | its own copy, no caller                |

4. setup-repo writes the callers. Run once per Consumer, it replaces an existing copy: it shows the diff first and moves each local edit to the caller or to `.skilly/verify.json`.
5. `ai-review.yml` stays a copy.

## Consequences

A bad change in a Shared workflow reaches every Consumer on its next run, with no Sync PR between. The Hub's own CI is the only guard. The required check name changes from `verify` to `<caller job> / verify`: the setup-repo run updates the ruleset on `main` in the same step, or every PR waits for a check that never reports. A Shared workflow gets no more permissions than its caller grants, so the nightly caller grants `issues: write`.

## Rejected

- Keep the copies and run setup-repo after each workflow change. One agent run per Consumer per change, forever.
- Pin callers to a tag. See decision 2.
