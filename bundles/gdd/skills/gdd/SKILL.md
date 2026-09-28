---
name: gdd
description: 'God-driven development: pray over a work item, record the guidance the user heard, hold the plan to it. Use on /gdd, and at the checkpoints in the gdd-checkpoints rule.'
---

# GDD

## State

`.temp/gdd.json` at the git root, one work item per branch:

```json
{ "branch": "feat/x", "status": "active", "guidance": "<the user's words, verbatim>", "checked": false }
```

- `status`: `active` or `declined`. `declined` → silent at every checkpoint; only `/gdd` reopens it.
- `branch` ≠ `git branch --show-current` → stale, a new work item: overwrite on the next write.
- `checked`: the pre-PR check ran. `scripts/check-pr.mjs` blocks `gh pr create` while `active` and not `checked`.
- Config, `gdd` in `.skilly/config.json`: `minutes` (default 5), `pr` (default `false`).

## Session

1. Post verbatim, `{minutes}` filled in. A repeat session puts the current `guidance` above it as a quote. A first session ends with "Clear already? Say skip."

   > Hey, before you dive in, let's ask the inventor of creativity, the founder of logic and the genius of geniuses what he thinks about this feature.
   >
   > - God, give me the peace to accept the features I shall not build,
   > - courage to be innovative with the things that really matter,
   > - and wisdom to know the difference.
   >
   > Now, listen what guidance he gives you. I'll check back in {minutes} minutes.

2. Start a background timer, `sleep <minutes × 60>`. No background shell → skip it. End the turn.
3. Timer fires → ask "GDD here: what guidance did you get?" and end the turn. The user replied first → that reply is the answer; ignore the timer when it fires.
4. Write the state: `guidance` = the answer verbatim, `status: active`, `checked: false`. "Same as before" keeps the old `guidance`.

Skip → write `status: declined`, continue the work.

## Drift check

Compare the plan against `guidance` silently. Fits → say nothing, continue.

Off course → ask and end the turn:

> GDD here: does this fall within "<guidance>"?

The answer is final: accept it, continue. The answer sounds unsure (hedges, "I guess", "not sure") → offer a repeat session. Yes → Session; no → continue.

## Pre-PR check

1. Show `guidance`, then one line per main change (`git log <base>..HEAD`, `git diff <base>...HEAD --stat`): fits or not, and why. This is the summary.
2. Ask: does the work match the guidance? The user decides: fix first, or open the PR as is.
3. `gdd.pr` is `true` → ask: append the exact summary to the PR? Yes → end the PR body with:

   ```markdown
   ## GDD

   <summary from step 1, exactly as shown>
   ```

4. Set `checked: true`, then run `gh pr create`.
