---
name: powersync-cli
description: Run PowerSync operations with the powersync CLI — init/link a project, validate and deploy sync rules, check instance status. Use when a task touches PowerSync config, sync rules, or instances. Not for writing client sync code.
---

# PowerSync CLI

PowerSync has a first-class CLI: `powersync` (npm, v0.9.0+). Use it before writing API calls or clicking the dashboard.

- Install: `npm install -g powersync` (or `npx powersync`)
- Scaffold config: `powersync init cloud` (or `init docker` for self-hosted)
- Link a cloud instance: `powersync link cloud --create --project-id <id>`
- Validate sync config: `powersync validate`
- Deploy sync config: `powersync deploy` (self-hosted dev: `powersync docker reset`)
- Instance overview: `powersync status`
- List instances: `powersync fetch instances --project-id <id>`
- Discover more: `powersync --help`

Auth: `powersync login` once per machine, or `PS_ADMIN_TOKEN` in env (CI).

Docs: https://docs.powersync.com/tools/cli
