# Lessons

- When the user has placed a file at a deliberate location, ask before moving it — even to a previously agreed path. State the intended move and wait for OK.
- The user (and other agents) edit this repo concurrently. A surprise rename or new dir is likely intentional, not an error. Never "fix" it — report the mismatch and ask before renaming or reverting anything I did not create.
- Pushed + closed a wayfinder ticket without showing the work → rule added to CLAUDE.md (Sign-off): stage finished work and stop; commit/push/PR only after the user signs off.
- "Workspace rules" means `bundles/workflow/rules/` (the always-on rules the workflow bundle syncs to consumers) — not `~/.claude/rules/`. Never write to `~/.claude` for a fleet-wide rule; it belongs in the hub.
- A surprising bundle layout may encode an intended agentic flow, not a bug. Declared it a "clear bug" and merged a fix (#25) — the real design: onboard installs only the entry skill, the skill decides the rest. Before "fixing" bundle contents, state the surprise and ask for the intent.
