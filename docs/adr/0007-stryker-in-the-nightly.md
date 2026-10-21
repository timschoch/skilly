# ADR-0007: Stryker checks the strength of the tests each night

Status: proposed, 2026-10-21

## Context

Agents write tests that pass but check little. Coverage does not show this: a line counts as covered when a test runs it, also when no assertion looks at its result.

Mutation testing does show it. A tool makes one small change to the code, for example `a > b` to `a >= b`, or `return x` to `return {}`. Each changed copy is a mutant. The tool runs the tests against each mutant. Red tests kill the mutant. Green tests let it survive, and a surviving mutant marks code with no real test. [Stryker](https://stryker-mutator.io/) does this for JavaScript and TypeScript, with a Vitest runner (`@stryker-mutator/vitest-runner`).

Stryker runs the tests once per mutant, so a full run takes minutes to hours. That is too slow for a PR or a hook.

## Decision

1. Stryker runs in the `nightly` stage of product Consumers, as one step in the [verify defaults](../../bundles/workflow/skills/verify/references/verify.json).
2. It runs in incremental mode (`--incremental`): it tests again only the code that changed since its last run, and keeps the result file between nights in the Actions cache.
3. It runs only on nights that run everything, per [ADR-0004](0004-nightly-runs-only-on-change.md) decision 1. A night with no change on `main` has no new code to mutate.
4. Surviving mutants open or update the one `nightly-stryker` issue. It is not `critical`: a weak test blocks nothing.

## Consequences

The first night after the rollout runs Stryker on the whole code once, with no incremental result. It can hit the 30-minute limit of ADR-0004 decision 5 and end as `nightly-stuck`. Seed the result file with one manual run (`workflow_dispatch`) per Consumer.

## Rejected

- Stryker on each PR. Too slow, and a PR would wait on it.
- A manual skill only. Nobody runs a check that is not scheduled.
- A minimum mutation score as a gate. A score on all the code punishes old code. The issue lists the survivors in new code instead.

## Open questions

- Run time on a real product Consumer, for example glue. Not measured.
- Whether the Actions cache keeps the incremental file long enough on a Consumer with few changes. GitHub drops a cache entry after 7 days with no access.
