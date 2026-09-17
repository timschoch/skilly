# tech-twenty

Building Twenty CRM apps with the Twenty SDK, and reading workspace data over the Twenty MCP server. Example: laica-stack builds its CRM apps in `crm/apps/`, and an agent there lists the newest opportunities as a table linked to Twenty.

| # | Skill | Does |
| --- | --- | --- |
| 1 | [`create-app`](https://github.com/twentyhq/twenty/tree/agent-skills/skills/create-app) | Scaffolds a new Twenty app. |
| 2 | [`develop-app`](https://github.com/twentyhq/twenty/tree/agent-skills/skills/develop-app) | Adds or changes objects, layouts, logic functions and front components. |
| 3 | [`manage-app`](https://github.com/twentyhq/twenty/tree/agent-skills/skills/manage-app) | Sync, build, deploy, logs and CI/CD for an app. |
| 4 | [`use-twenty-mcp`](https://github.com/twentyhq/twenty/tree/agent-skills/skills/use-twenty-mcp) | Connects a workspace over MCP, then shows records as Markdown tables with record links. Setup covers Claude Code, Codex and Cursor. |

## Source

All four come from the [`agent-skills`](https://github.com/twentyhq/twenty/tree/agent-skills) publishing branch of `twentyhq/twenty`, built from `packages/twenty-agent-skills` on `main`. Each skill on that branch carries its own `references/`, so it installs self-contained.

Take the skills from the branch, never from `main`: the source package shares one `references/` tree across all skills, and the skills CLI copies only the skill folder. A bare `twentyhq/twenty` source finds only `qa-scout`.

## Left out (2026-09-17)

| # | Skill | Why |
| --- | --- | --- |
| 1 | [`publish-app`](https://github.com/twentyhq/twenty/tree/agent-skills/skills/publish-app) | Prepares apps for the Twenty marketplace. We do not publish there. |
| 2 | [`twenty-record-presentation`](https://github.com/twentyhq/twenty/tree/main/packages/twenty-claude-skills/skills/twenty-record-presentation) | `use-twenty-mcp` now covers reading and presenting records, and adds the MCP setup this one assumes. |
| 3 | [`syncable-entity-*`](https://github.com/twentyhq/twenty/tree/main/.cursor/skills) (6) | For work on the Twenty server code itself, not on apps. |
| 4 | [`twenty-partner-*`](https://github.com/twentyhq/twenty/tree/main/packages/twenty-apps/internal/twenty-partners/src/skills), [`qa-scout`](https://github.com/twentyhq/twenty/tree/main/.claude/skills/qa-scout) | Internal skills of the Twenty team. |
| 5 | `laica-twenty` | The laica CLI skill. Ships in [project-laica](../project-laica/config.json). |
