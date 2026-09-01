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

1. Create the repo and give `main` its first commit — skilly refuses a bare repo:

   ```sh
   gh repo create <owner>/<repo> --private --clone && cd <repo>
   echo "# <repo>" > README.md
   git add . && git commit -m "chore: initial commit" && git push -u origin main
   ```

2. `npx -y github:timschoch/skilly setup` — switches to `chore/skilly-setup`, sets the App secrets, writes `.skilly.json` (no bundles), writes `.github/workflows/skilly-sync.yml`, adds formatter ignores, installs the `setup-project` skill, commits, opens the PR.
3. `/setup-project` in Claude Code — asks: setup workflow? tech stack? Drives the setup skills in order and adds Bundles via `skilly add`. (Or by hand: `npx -y github:timschoch/skilly add workflow` plus your `tech-*`/`project-*` bundles.)
4. `npx -y github:timschoch/skilly update` — asks to drop bundle-less setup skills (e.g. `setup-project` once you're done with it); say yes.
5. Merge the PR, then prove the workflow: `gh workflow run skilly-sync.yml && gh run watch`. No changes → no Sync PR.

From then on: `add` / `remove` / `update` any time. The nightly workflow runs `update` headless and keeps one standing Sync PR (`chore/skilly-update`); the gate merges it when green and removal-free — removals always wait for you.
