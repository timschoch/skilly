# ADR-0006: Oxlint replaces ESLint, and lint runs on each agent edit

Status: proposed, 2026-10-21

## Context

The first lint error an agent sees today comes from the PR gate (`npm run lint`), one CI round after the edit. The `commit` stage runs only the Consumer's lint-staged config, often Prettier alone. No Claude Code hook lints after an edit ([.claude/settings.json](../../.claude/settings.json)). A human sees red lines only if their own editor is set up. An agent in T3 Code or a terminal has no editor, and fix on save never runs for an agent: it writes the file, nobody saves it.

ESLint is too slow for a check on each edit. State in October 2026, from vendor numbers, not measured here: [fast-js-linting.md](../research/fast-js-linting.md).

| Tool                         | Status                                                                            | Speed vs ESLint       |
| ---------------------------- | --------------------------------------------------------------------------------- | --------------------- |
| Oxlint                       | 1.x stable since June 2025, 871 rules                                             | 50 to 100x            |
| Oxlint type-aware (tsgolint) | stable since July 2026, 59 of 61 typescript-eslint type rules, needs TypeScript 7 | 12 to 18x             |
| oxfmt                        | beta, no Prettier plugins                                                         | about 30x vs Prettier |
| ESLint 10                    | `--concurrency` only; typescript-eslint does not run on TypeScript 7              | 1x                    |

## Decision

1. A new Consumer gets Oxlint, not ESLint. setup-repo writes the config and `npm run lint` calls `oxlint --type-aware`.
2. An existing Consumer migrates when it chooses: setup-repo runs `npx @oxlint/migrate`. A Consumer whose ESLint plugin has no Oxlint port keeps ESLint, or runs both with `eslint-plugin-oxlint`.
3. Prettier stays the formatter until oxfmt leaves beta.
4. A Claude Code PostToolUse hook runs `oxlint --fix` and Prettier on each file the agent edits. It is silent when the file is clean. With errors left it exits 2, so Claude Code shows the errors to the agent. Oxc's own [coding agents recipe](https://oxc.rs/docs/guide/usage/coding-agents.html) exits 0, and Claude Code hides the output of a hook that exits 0.
5. lint-staged runs `oxlint --fix` and Prettier on the staged files.
6. setup-repo writes `.vscode/extensions.json` (the Oxc and Prettier extensions) and `.vscode/settings.json` (format on save, `source.fixAll.oxc`).
7. `verify.json` and the Shared workflows do not change: they call `npm run lint`, and the Consumer decides what that runs.

## Consequences

Each agent edit pays the start time of `oxlint` on one file. Nobody has measured it. Measure it in one product Consumer before the rollout. Type-aware rules need TypeScript 7, so a Consumer on TypeScript 6 runs Oxlint without `--type-aware` until it moves. Lint errors reach the agent at the edit, and the PR gate stays the full check.

## Rejected

- ESLint in the edit hook. Too slow on each edit.
- Biome. Mature and fast, but 7 type-aware rules against 59.
- Wait a month and check Oxc again. Oxlint and tsgolint are stable now. Only oxfmt waits, see decision 3.
- Force Oxlint on every Consumer through the Sync PR. The lint config belongs to the Consumer.
