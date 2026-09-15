# babysit-pr

Ported from [`openai/codex`](https://github.com/openai/codex) `.codex/skills/babysit-pr`, commit `84aa75204ad604bcf498df180d128181c89b2f0b`.

Portions derived from openai/codex, Copyright OpenAI, licensed under the Apache License 2.0.

Changed here: the 951-line Python watcher is replaced by four bash + jq scripts in [`scripts/`](scripts); the PR is never merged automatically, the loop stops at green and reports per [workflow-sign-off](../../../../.claude/rules/workflow-sign-off.md); the reviewer set comes from `.skilly/config.json` -> `.review.bots` instead of a hardcoded bot login.
