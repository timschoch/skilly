# tech-twenty

Building Twenty CRM apps with the Twenty SDK, and reading workspace data over the Twenty MCP server. Example: laica-stack builds its CRM apps in `crm/apps/`, and an agent there lists the newest opportunities as a table linked to Twenty.

| # | Skill | Package in twentyhq/twenty | Does |
| --- | --- | --- | --- |
| 1 | [`create-app`](https://github.com/twentyhq/twenty/tree/main/packages/twenty-codex-plugin/skills/create-app) | `twenty-codex-plugin` | Scaffolds a new Twenty app. |
| 2 | [`develop-app`](https://github.com/twentyhq/twenty/tree/main/packages/twenty-codex-plugin/skills/develop-app) | `twenty-codex-plugin` | Adds or changes objects, layouts, logic functions and front components. |
| 3 | [`manage-app`](https://github.com/twentyhq/twenty/tree/main/packages/twenty-codex-plugin/skills/manage-app) | `twenty-codex-plugin` | Sync, build, deploy, logs and CI/CD for an app. |
| 4 | [`twenty-record-presentation`](https://github.com/twentyhq/twenty/tree/main/packages/twenty-claude-skills/skills/twenty-record-presentation) | `twenty-claude-skills` | Fetches records over MCP and shows them as Markdown tables with record links. |

Each package is its own tree URL source in [config.json](config.json). A bare `twentyhq/twenty` source finds only `qa-scout`.

## Broken reference links

The 3 app skills link to `../../references/...`. Those files live in [`packages/twenty-codex-plugin/references/`](https://github.com/twentyhq/twenty/tree/main/packages/twenty-codex-plugin/references), outside the skill folders. The skills CLI copies only the skill folder, so the links do not resolve in a consumer.

About 105 KB of docs is missing. `develop-app` alone points to 9 files, for example `references/develop-app/logic.md`. Need one? Read it on GitHub at the link above. `twenty-record-presentation` holds all its rules in its own `SKILL.md` and works as installed.

Upstream tracks the fix in [twentyhq/twenty#22892 "Publish Twenty App development skills for all Agent Skills-compatible harnesses (skills.sh)"](https://github.com/twentyhq/twenty/issues/22892). When a fix ships, the nightly update pulls it in.

## Left out (2026-09-10)

| # | Skill | Why |
| --- | --- | --- |
| 1 | [`use-twenty-mcp`](https://github.com/twentyhq/twenty/tree/main/packages/twenty-codex-plugin/skills/use-twenty-mcp) | Written for Codex: it names Codex as the agent, and its setup guide configures MCP in Codex. `twenty-record-presentation` covers reading records over MCP. |
| 2 | [`publish-app`](https://github.com/twentyhq/twenty/tree/main/packages/twenty-codex-plugin/skills/publish-app) | Prepares apps for the Twenty marketplace. We do not publish there. |
| 3 | [`syncable-entity-*`](https://github.com/twentyhq/twenty/tree/main/.cursor/skills) (6) | For work on the Twenty server code itself, not on apps. |
| 4 | [`twenty-partner-*`](https://github.com/twentyhq/twenty/tree/main/packages/twenty-apps/internal/twenty-partners/src/skills), [`qa-scout`](https://github.com/twentyhq/twenty/tree/main/.claude/skills/qa-scout) | Internal skills of the Twenty team. |
| 5 | `laica-twenty` | The laica CLI skill. Ships in [project-laica](../project-laica/config.json). |
