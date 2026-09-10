# tech-twenty

Building Twenty CRM apps with the Twenty SDK. Ships 3 skills from [twentyhq/twenty `packages/twenty-codex-plugin/skills/`](https://github.com/twentyhq/twenty/tree/main/packages/twenty-codex-plugin/skills): `create-app`, `develop-app`, `manage-app`. Example: laica-stack builds its CRM apps in `crm/apps/` with them.

Reading workspace data over MCP ships in [tech-twenty-mcp](../tech-twenty-mcp/README.md). A repo that builds apps and reads data adds both bundles.

## Broken reference links

The skills link to `../../references/...`. Those files live in [`packages/twenty-codex-plugin/references/`](https://github.com/twentyhq/twenty/tree/main/packages/twenty-codex-plugin/references), outside the skill folders. The skills CLI copies only the skill folder, so the links do not resolve in a consumer.

About 105 KB of docs is missing. `develop-app` alone points to 9 files, for example `references/develop-app/logic.md`. Need one? Read it on GitHub at the link above.

Upstream tracks the fix in [twentyhq/twenty#22892 "Publish Twenty App development skills for all Agent Skills-compatible harnesses (skills.sh)"](https://github.com/twentyhq/twenty/issues/22892). When a fix ships, the nightly update pulls it in.

## Left out (2026-09-10)

| # | Skill | Why |
| --- | --- | --- |
| 1 | [`publish-app`](https://github.com/twentyhq/twenty/tree/main/packages/twenty-codex-plugin/skills/publish-app) | Prepares apps for the Twenty marketplace. We do not publish there. |
| 2 | [`syncable-entity-*`](https://github.com/twentyhq/twenty/tree/main/.cursor/skills) (6) | For work on the Twenty server code itself, not on apps. |
| 3 | [`twenty-partner-*`](https://github.com/twentyhq/twenty/tree/main/packages/twenty-apps/internal/twenty-partners/src/skills), [`qa-scout`](https://github.com/twentyhq/twenty/tree/main/.claude/skills/qa-scout) | Internal skills of the Twenty team. |
| 4 | `laica-twenty` | The laica CLI skill. Ships in [project-laica](../project-laica/config.json). |
