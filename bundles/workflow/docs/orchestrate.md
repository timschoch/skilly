> **Fork-only skill.** `orchestrate` is an addition in [`timschoch/mattpocock-skills`](https://github.com/timschoch/mattpocock-skills) — it does not exist in upstream [`mattpocock/skills`](https://github.com/mattpocock/skills), and it is not published on aihero.dev.

Quickstart:

```bash
npx skills add timschoch/mattpocock-skills --skill=orchestrate
```

```bash
npx skills update orchestrate
```

## What it does

`orchestrate` runs an already-specced, already-ticketed feature to completion across parallel [implement](https://aihero.dev/skills-implement) agents, one per sub-issue, each on its own git worktree — and does the mechanical tail itself: sequencing, relay, merge order, CI watch, cleanup.

It never decides what the **work packages** are. The parent issue's sub-issues *are* the packages: it fetches them and hands each one verbatim to an agent. That's Rule Zero, and it's what makes the skill safe to point at a big feature — an orchestrator that re-slices the work silently rewrites the plan you already agreed. Sub-issues missing or ambiguous is a stop-and-ask, never an invitation to invent packages.

## When to reach for it

You invoke this by typing `/orchestrate` — the agent won't reach for it on its own.

Reach for it when a feature is already broken into sub-issues on a real tracker and you want them built concurrently rather than one at a time. For a single ticket, or a chain short enough to work by hand in one session, use [implement](https://aihero.dev/skills-implement) directly — the orchestration overhead only pays off across several independent packages.

## Prerequisites

A **real tracker with native sub-issues** (GitHub today — sub-issues are fetched over GraphQL, since `gh issue view` doesn't render them) and a parent issue whose sub-issues were published by [to-tickets](https://aihero.dev/skills-to-tickets) with their blocking edges wired. It also needs `gh` authenticated for the repo and a clone where git worktrees can be created, because each agent gets its own.

## Orchestrator and agents

The split of labour is the whole design. The **orchestrator** — you, in the session you typed `/orchestrate` into — is read-only plus `gh` plus the ability to spawn. It never edits `src/`. The **agents** run the full `/implement` flow inside their own worktree: native claim, TDD, code review, their own PR. Nothing about implementation is restated in the orchestrator's prompt, because duplicating it is how the two drift apart.

Everything mechanical past "PR open" belongs to the orchestrator: merge order, watching CI, deleting branches and worktrees, the one final docs PR for shared-line docs.

## The ledger

The GitHub issue is the **ledger** — the orchestrator comments on the parent, each agent on its own sub-issue, so a long parallel run leaves a readable trail instead of living only in a transcript you'll close. Entries are condensed and prefixed 🤖, typed as `decision`, `question`, `blocker`, or `progress`, with any decision taken without you explicitly marked `(bot)`.

Questions don't block: they go on the issue and the run proceeds wherever a tolerant default exists. That's deliberate — a parallel run that halts on every open question is slower than doing the work serially.

## Idle is not done

The failure mode this skill is built against: an agent goes quiet and you read that as finished. Before acting on any "finished" signal, the orchestrator verifies **observable state** — the branch on origin, `git diff --stat`, the fix actually present in the diff rather than merely acknowledged. Sequence-sensitive rules (rebase-before-PR, conflict posture, merge order) go into an agent's *original* prompt, because a mid-flight message crosses with its push and lands too late to matter.

## Common questions

**The parent issue has sub-issues, but `gh issue view` doesn't show them.**
It never does — `gh issue view` doesn't render the sub-issue relationship at all. They are only reachable over GraphQL (`gh api graphql … subIssues`). Absence from CLI output is not evidence the links are missing, and the distinction matters: missing sub-issues is a stop-and-ask, so a wrong read here halts a run that was fine.

**Two tickets touch the same file. Do I have to run them serially?**
Not necessarily, but the call is made at sequencing time, before anything spawns. Shared-file hotspots get either serialized or a pre-agreed conflict posture written into both prompts — "keep shared-file changes additive; second-to-merge rebases". "New files only" parallelizes; "touches shared files" wants a single writer. Deciding it after spawning is too late: a mid-flight message crosses with the agent's push.

**A run got binned halfway. Do I restart from scratch?**
No. Archive the branch as `archive/<issue>-<label>` and restart along the same sub-issues with fresh claims, giving each affected prompt the mandatory diff-against-the-archive step. "May consult the archive" is too weak — without the diff step, agents reintroduce bugs the binned run had already fixed.

## It's working if

- Every sub-issue ends with exactly one merged PR carrying `Closes #<sub>`
- The parent issue reads as a 🤖 trail you can follow after the fact, ending in a final tally
- Merges happen only on green CI, in an order the orchestrator chose — second-to-merge rebases
- No worktrees or merged branches are left behind
- The orchestrator's own diff touches no `src/`

## Where it fits

`orchestrate` is an optional step in the main build chain, standing in for running `/implement` yourself once per ticket:

```txt
grill-with-docs → to-spec → to-tickets → orchestrate → (implement × N)
```

It takes over where [to-tickets](https://aihero.dev/skills-to-tickets) leaves off, because the blocking edges it published are exactly what the orchestrator sequences from, and it delegates every actual change to [implement](https://aihero.dev/skills-implement), which drives [tdd](https://aihero.dev/skills-tdd) and [code-review](https://aihero.dev/skills-code-review) per package. Operational detail — salvaging an interrupted run, deploy diagnosis, Projects v2 limits — lives in [`ops.md`](https://github.com/timschoch/mattpocock-skills/blob/main/skills/fork/orchestrate/ops.md) beside the skill. When you're unsure which skill or flow fits, [ask-matt](https://aihero.dev/skills-ask-matt) routes you.
