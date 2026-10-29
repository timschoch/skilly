# skilly

Private skill hub for one person and their agents. It keeps skills, checks and CI the same in every Consumer repo. Why it works this way: [ADR-0008](docs/adr/0008-hub-run-sync-and-pinned-engine.md). Bundle catalog: [docs/bundles.md](docs/bundles.md). Checks per tier: [docs/dev-process.md](docs/dev-process.md).

## How it works

A Consumer gets two things from the Hub, both at one Release:

| What                                                | Lands in                            | Used by            |
| --------------------------------------------------- | ----------------------------------- | ------------------ |
| Knowledge: skills and Router rules                  | `.agents/skills/`, `.claude/rules/` | agents             |
| Engine: the code for sync, setup, verify and checks | `.skilly/engine/`                   | hooks, CI, the CLI |

`.skilly/config.json` names the Bundles, the tier and the Release (`"hub": "v1.4.0"`). Each night the Hub moves every Consumer to the newest Release with one Sync PR:

```mermaid
sequenceDiagram
  participant You
  participant Hub
  participant Consumer
  participant GitHub
  You->>Hub: merge a change
  You->>Hub: merge the Release PR
  Hub->>Hub: tag v1.5.0
  Hub->>Consumer: nightly Sync PR (skills + Engine)
  GitHub->>Consumer: run ci / verify
  GitHub->>Consumer: auto-merge when green
```

The Sync PR waits for you when it removes a skill or the Release is a new major version.

## Set up an account, once

1. Install the skilly App on the account, with "All repositories".
2. Add the account to `HUB_OWNERS`, the owner allowlist in [engine/lib/constants.js](engine/lib/constants.js).
3. Other accounts than `timschoch`: invite the account as a read collaborator on `timschoch/skilly`, then accept the invite as that account. `skilly setup` prints the command when it is missing.

## Set up a repo

Not every repo gets skilly. You choose the repos.

1. Create the repo and push a first commit. skilly refuses an empty repo.

   ```sh
   gh repo create <owner>/<repo> --private --clone && cd <repo>
   echo "# <repo>" > README.md
   git add . && git commit -m "chore: initial commit" && git push -u origin main
   ```

2. Ask your agent to run setup with the newest Release:

   ```sh
   npx -y github:timschoch/skilly#<release> setup
   ```

   Setup has two phases ([ADR-0009](docs/adr/0009-setup-decides-then-applies.md)):
   - **Decide.** Without `.skilly/config.json`, setup points the agent at the [setup-project](bundles/setup-project/skills/setup-project/SKILL.md) skill. The agent reads the repo and asks you for the Bundles and the tier, in one message. It names the dependencies no Bundle covers. Its scripts write `.skilly/config.json`, and `preflight` checks that everything is ready. A missing secret: you set it with `gh secret set`, so it never enters the chat.
   - **Apply.** No more questions, so you can walk away. Setup runs the first sync, opens the setup PR, then sets the repo settings and requires `ci / verify` on the default branch.

   The decide steps also run alone, from a terminal:

   ```sh
   npx -y github:timschoch/skilly#<release> detect                  # the Bundles, pre-ticked from the repo, as JSON
   npx -y github:timschoch/skilly#<release> config <tier> <bundle...>  # write .skilly/config.json
   npx -y github:timschoch/skilly#<release> preflight               # exits 1 and names each red check
   ```

   Setup is safe to run again: with a config it runs only the apply phase.

3. Merge the setup PR. From then on the Hub's nightly keeps the repo up to date.

## Commands in a Consumer

The Engine runs them. `add` and `remove` run at the repo's Release and commit on the current branch. `sync` opens the Sync PR.

```sh
node .skilly/engine/bin/skilly.js add <bundle-or-skill...>     # install now, do not wait for the nightly
node .skilly/engine/bin/skilly.js remove <bundle-or-skill...>  # uninstall, keeps skills another Bundle needs
node .skilly/engine/bin/skilly.js sync                         # the nightly for this repo, now: Sync PR to the newest Release
```

Do not edit `.skilly/engine/`, the managed workflow files or the synced skills. Change checks in `.skilly/verify.json` and the tier in `.skilly/config.json`. Who owns which file: [ADR-0008](docs/adr/0008-hub-run-sync-and-pinned-engine.md#who-owns-what-in-a-consumer).

## Run the sync now

One Consumer: run `node .skilly/engine/bin/skilly.js sync` in it. Every Consumer, Hub owner only:

```sh
gh workflow run sync.yml --repo timschoch/skilly
```
