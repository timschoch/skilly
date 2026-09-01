# skilly

Personal skill hub: Bundles + CLI + nightly Update behind a PR gate. Flows: [docs/flows user.mmd](docs/flows%20user.mmd) and [docs/flows sync.mmd](docs/flows%20sync.mmd) — the per-script diagrams in `docs/*.mmd` are the spec. Bundle catalog: [docs/bundles.md](docs/bundles.md).

## Commands (run in the Consumer repo)

```sh
npx github:timschoch/skilly setup                       # one-time: secrets, .skilly.json, caller workflow, setup-project skill
npx github:timschoch/skilly add <bundle-or-skill...>    # install, rules, commit, ensure PR
npx github:timschoch/skilly remove <bundle-or-skill...> # uninstall (keeps skills other bundles claim), rules, commit
npx github:timschoch/skilly update                      # pull hub changes, update all skills, rules, commit
```

Every command guards its branch (`skilly-*`, main → `chore/skilly-setup`, anything else asks once and remembers in `.git/config`) and ends with its own commit + PR.

## New-repo setup, in order

1. `gh repo create <owner>/<repo> --private --clone` — create the repo before any tooling.
2. `npx github:timschoch/skilly setup` — secrets, empty `.skilly.json`, caller workflow, formatter ignores, the `setup-project` skill, PR.
3. `/setup-project` — asks: setup workflow? tech stack? Drives the setup skills in order and adds Bundles via `skilly add`.
4. From then on: `add` / `remove` / `update`. The nightly workflow runs `update` headless and keeps one standing Sync PR; the gate merges it when green and removal-free.
