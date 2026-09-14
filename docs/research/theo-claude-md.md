# Theo's AGENTS.md: what we took

Input for `bundles/workflow/rules/*` and two skills. Researched 2026-09-14.

Source: Theo (t3.gg), "My AGENTS.md & SKILLS.md Breakdown (Don't copy them)", <https://www.youtube.com/watch?v=e1snsuY4lTI>. Timestamps `[mm:ss]` point into the video. Quotes are paraphrases from the auto-transcript.

## Adopted

| # | Finding | Where it lives |
| --- | --- | --- |
| 1 | Bad and good example pairs are the highest-leverage rule format. A repeated correction becomes one pair, not more prose `[15:18]` | [workflow-writing-standards.md](../../bundles/workflow/rules/workflow-writing-standards.md) |
| 2 | PR title says why it matters. Body opens with the problem in the user's own words, then the solution. Never a draft PR, review bots skip drafts `[15:18]`, `[15:55]`, `[16:26]` | [git-shortcuts, PR creation protocol](../../bundles/workflow/skills/git-shortcuts/SKILL.md#pr-creation-protocol) |
| 3 | Questions are read only. Newer models edit when only asked `[07:53]` | [workflow-dialog.md](../../bundles/workflow/rules/workflow-dialog.md) |
| 4 | Give the model a stop point and it honours it `[46:54]` | [workflow-dialog.md](../../bundles/workflow/rules/workflow-dialog.md) |
| 5 | Match ceremony to the task: no subagents for one-pass work, delegation is for breadth or adversarial review `[07:53]` | [workflow-model-selection.md](../../bundles/workflow/rules/workflow-model-selection.md) |
| 6 | Mine your own session logs per model and harness, count failure modes, write the top three as rules. This is how his "three ways to hurt yourself" list was made `[19:56]` to `[22:16]`, `[30:41]` | [audit-agent-history](../../bundles/workflow/skills/audit-agent-history/SKILL.md), feeds [workflow-hazards.md](../../bundles/workflow/rules/workflow-hazards.md) |
| 7 | Interrogate a bad thread ("what gave you the indication this was right?") and a slow thread (group the tool calls, mark the useless groups) `[23:27]`, `[23:60]` | steps 6 and 7 of [audit-agent-history](../../bundles/workflow/skills/audit-agent-history/SKILL.md) |

## Already had

Skill description as a trigger, not a summary `[12:34]`. "Good defaults, not law" plus developer override `[29:38]`. A hazards list `[30:41]`. Attribution of the model on PRs `[16:56]`.

## Left out

| # | Finding | Why not |
| --- | --- | --- |
| 8 | babysit-pr skill: loop until green, act only on comments newer than the last push, never let review grow the PR `[10:36]` | no review bots on our PRs yet |
| 9 | Hit-every-surface checklist per repo `[32:38]` | project content, fits the `setup-project` AGENTS.md template later |
| 10 | "Do not install skills wholesale" `[50:18]` | skilly bundles are the curation |
| 11 | Letter-style global file, taste sentences to slow overeager models `[05:48]`, `[06:21]` | personal file, not a distributed rule |
