# ADR-0003: A `pr` stage defers the full suites to the release PR and the nightly

Status: accepted, 2026-10-05. Decision 3: verify picks the stage. `ci.yml` is a Managed file per [ADR-0008](0008-hub-run-sync-and-pinned-engine.md), and the required check is `ci / verify`. Decision 5: replaced by [ADR-0004](0004-nightly-runs-only-on-change.md).

## Context

The `ci` stage extends `push`, so each PR run of a Consumer ran `unit (changed)` and then the full `unit` suite, which holds the same tests. Measured in one product Consumer over 14 PR runs:

| Step                          | Time                                           |
| ----------------------------- | ---------------------------------------------- |
| whole PR run, mean            | 645 s                                          |
| full `unit`                   | 243 to 440 s                                   |
| `e2e smoke`                   | 30 to 41 s, plus about 23 s of browser install |
| each unit step on a wide diff | about 410 s                                    |

Source: [#154 verify: the ci stage runs the unit tests two times](https://github.com/timschoch/skilly/issues/154).

`vitest --changed` follows imports only. No test imports a lockfile or a migration, so such a diff ran too few tests. Vitest's `forceRerunTriggers` globs do not match in a checkout under a dot folder, because `**` skips a dot segment.

## Decision

1. A step drops the step it covers with `replaces`. The full `unit` step replaces `unit (changed)`, so `ci` runs each test one time. Only a step that runs replaces another.
2. A stage drops inherited steps with `without`. The default `pr` stage is `ci` without full `unit` and `e2e smoke`.
3. A PR runs `pr` only in a product-tier repo that has a nightly workflow and a release-please workflow. Each other repo runs `ci` on each PR. A push to main runs the same stage as a PR, so in a `pr` repo it runs no full suite. The [ci.yml template](../../bundles/setup-project/skills/setup-repo/templates/workflows/ci.yml) picks the stage on each run.
4. The release PR runs `ci`. release-please updates that PR after each merge to main, so each releasable merge meets the full suites before it ships. `verify` is a required check, so a red release PR blocks the release.
5. The `nightly` stage runs the full `unit` suite. A red night opens one issue with the labels `critical` and `nightly-red`.
6. The verify skill owns the changed-tests guard: [run-changed-tests.mjs](../../engine/verify/run-changed-tests.mjs) runs the full suite when the diff holds a `fullSuiteTriggers` path. It reads paths from git, so a dot folder does not change the result.

This narrows [ADR-0001](0001-dev-process-tiers.md) decision 1: a product repo on the `pr` stage runs fewer checks on a PR than a tool repo does. It runs them on the release PR and each night instead.

## Consequences

Main can be red between a merge and the next full run. A merge with no releasable commit does not update the release PR, so the nightly is its first full run. A Consumer that overrides the `run` of `unit (changed)` has no guard until its override calls `run-changed-tests.mjs`. A Consumer with its own copy of `ci.yml` stays on `ci` until it takes the new template, and still gets decision 1.

An override merges by step name and keeps the `replaces` of the default. A Consumer override that makes `unit` a conditional no-op, for example `"run": "test -z \"$VERIFY_FULL\" || pnpm exec vitest run"`, still drops `unit (changed)`. The PR of that Consumer then runs no unit test and goes green. The code cannot detect this. Before the Consumer syncs, remove such an override or set `"replaces": null` on it.

## Rejected

- The split as the default for every tier. The `nightly` stage is product only, so a smaller repo would never run its full suite.
- A step field `skipIn` or `only`. It lets any step leave any stage, with no statement of what covers it.
- A guard in each Consumer's `vitest.config.ts`. The skill cannot see that it is there, and its globs break under a dot folder.
- Stages `ci` (fast) and `release` (full). A Consumer workflow that calls `ci` would lose the full suites on the next sync, with no change on its side.
