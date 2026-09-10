# tech-twenty-mcp

Reading data from a live Twenty workspace through the Twenty MCP server. Example: an agent lists the newest opportunities as a table, each name linked to its record in Twenty.

| # | Skill | Does |
| --- | --- | --- |
| 1 | [`use-twenty-mcp`](https://github.com/twentyhq/twenty/tree/main/packages/twenty-codex-plugin/skills/use-twenty-mcp) | Connects the agent to a workspace over MCP. Reads records and metadata. |
| 2 | [`twenty-record-presentation`](https://github.com/twentyhq/twenty/tree/main/packages/twenty-claude-skills/skills/twenty-record-presentation) | Shows records as Markdown tables and summaries, with record links, readable dates and values. |

Does not include [tech-twenty](../tech-twenty/README.md): a repo that only reads CRM data builds no apps.

`use-twenty-mcp` links to 2 reference files that do not install, see [Broken reference links](../tech-twenty/README.md#broken-reference-links). `twenty-record-presentation` holds its formatting rules in its own `SKILL.md`, so it works as installed.
