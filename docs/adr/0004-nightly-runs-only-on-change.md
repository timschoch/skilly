# ADR-0004: The nightly runs its tests only after a change, and stops when stuck

Status: proposed, 2026-10-21. `nightly.yml` is a Managed file per [ADR-0008](0008-hub-run-sync-and-pinned-engine.md), not a template or a Shared workflow.

## Context

The `nightly` stage of a product Consumer runs the full `unit` suite, full e2e, deps drift and the security scan every night ([nightly.yml template](../../bundles/setup-project/skills/setup-repo/templates/workflows/nightly.yml)). Many Consumers see no commit on `main` for weeks. The same code gives the same test result, so each such night pays for a run with no new information.

A night that times out or is cancelled opens no issue: the issue step is in the same job, and a job that times out skips its later steps. Such a night fails in silence and costs up to `timeout-minutes` (60) each night.

The nightly opens one issue for the whole run, labels `critical` and `nightly-red`. While it is open, a new red night adds nothing. A new security finding stays hidden behind an open test failure.

## Decision

1. Two dates decide what a night runs. A: the last commit on `main`. B: the start of the last nightly that finished, green or red, scheduled or manual.

   | Dates                            | The night runs                                                                                                                   |
   | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
   | B after A                        | the `nightly-scan` stage only. It holds the checks that find new things without a code change: the security scan and deps drift. |
   | B before A, A at most 2 days old | the `nightly` stage. It extends `nightly-scan`.                                                                                  |
   | B before A, A older than 2 days  | nothing. It opens one issue with the label `nightly-stuck`, unless one is open.                                                  |

2. A cancelled or timed-out night is not finished. It does not count as B.
3. A manual run (`workflow_dispatch`) always runs everything.
4. One open issue per check, never one per problem or one per night. Labels: `nightly-tests` (unit and e2e, plus `critical`), `nightly-security` (plus `critical`), `nightly-stryker`, `nightly-stuck`. The issue lists all problems of its check. A later night with a different list adds a comment. Deps drift opens no issue: it only reports, and Dependabot opens the update PRs.
5. `timeout-minutes: 30`, equal to the stage's `budgetSeconds`. The worst case per change on `main` is 2 nights of 30 minutes.
6. A plan script in the [verify skill](../../bundles/workflow/skills/verify/SKILL.md) applies decision 1. It reads the nightly run history from the Actions API, the last commit on `main` and the open issues. It returns `nightly`, `nightly-scan` or stop. The workflow holds no date logic, so unit tests cover decision 1 with a fake run history. The nightly caller grants `actions: read`.
7. On `nightly` and `nightly-scan`, verify runs every step, also after a red one, and writes one result per step. The issue step reads these results. So a red test step does not hide a security finding.

## Consequences

A flaky red night stays red until the next change on `main` or a manual run. A Consumer with no commits keeps its security scan. The labels of decision 4 replace `nightly-red` of [ADR-0003](0003-pr-stage-defers-full-suites.md) decision 5. The setup-repo run of [ADR-0005](0005-shared-ci-workflows.md) closes an open `nightly-red` issue. The cap on money for all Consumers together is the GitHub Actions spending limit in the account billing settings, outside the repo.

## Rejected

- Compare with the last green nightly only. A red night on unchanged code would run again each night with the same result.
- Count failed nights (3 strikes). Rule 1 already stops tests after one finished night, so the count only mattered for runs that do not finish, and two dates cover those with less code.
- A separate report job for timeouts. Rule 1 opens `nightly-stuck` on day 3 without it.
- One issue per problem. One bad commit that breaks 20 tests opens 20 issues, and Stryker alone can report dozens.
