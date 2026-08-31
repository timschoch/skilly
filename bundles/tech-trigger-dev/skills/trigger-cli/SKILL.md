---
name: trigger-cli
description: Run and deploy Trigger.dev tasks with the CLI — local dev runs, deploys, auth checks. Use when a task runs or deploys Trigger.dev jobs. Not for writing task code.
---

# Trigger.dev CLI

Trigger.dev ships a CLI. Use it — do not hand-roll deploy scripts or guess at the dashboard.

- Local dev (runs tasks against the cloud): `npx trigger.dev@latest dev`
- Deploy: `npx trigger.dev@latest deploy`
- Check login/project: `npx trigger.dev@latest whoami`
- Discover more: `npx trigger.dev@latest --help`

CI deploys use the `TRIGGER_ACCESS_TOKEN` secret.
