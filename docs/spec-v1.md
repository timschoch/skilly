# Skilly v1 — build spec

Build-ready. All decisions locked on the [wayfinder map](https://github.com/timschoch/skilly/issues/1). Glossary: `CONTEXT.md`. Bundle format + signed-off set: `docs/bundles.md` + `bundles/` (shipped, e4536d4). Research detail: `docs/research/` on the `research/*` branches; auth proof in [#8](https://github.com/timschoch/skilly/issues/8).

## Architecture

- **Hub** (this repo, public): bundles, the `skilly` CLI, the shared sync workflow, gate check scripts, hub-maintained skills.
- **Consumer**: `.skilly.json` + a ~10-line caller workflow + pins in `skills-lock.json`.
- The skills CLI does every install/update. Skilly prepares `skills add`/`skills remove` calls and diffs `skills-lock.json`; updates stay native (`skills update -p -y`).
- Pin the skills CLI as `npx skills@1.5.23` — one constant `SKILLS_CLI_VERSION` in the CLI source, referenced everywhere (no `@latest`; `add` output is unparseable and exit codes lie, see `docs/research/skills-cli-surface.md`).

Flows: one-time onboarding (runbook below) → nightly sync opens a Sync PR → PR gate checks it → human merges.

## CLI — `npx skilly`

Distribution: `npx github:timschoch/skilly`. No npm publish. Plain Node (ESM, zero deps, no build step) with a `bin` entry in `package.json`. The npx tarball contains `bundles/`, so bundle resolution is a local read — no API calls.

### `skilly init <bundle...>`

1. Write `.skilly.json` with `bundles: [<args>]` and empty `status`.
2. Scaffold the caller workflow `.github/workflows/skilly-sync.yml` from a template (a real file — symlinked workflows never run). Pick a random cron minute per repo.
3. Run `skilly sync`.

### `skilly sync [--prune] [--dry-run]`

1. Read `bundles` from `.skilly.json`. Resolve `includes` recursively; a cycle is a hard error. Result: the union of sources+skills, gate rules, and always-on rule files.
2. Diff the resolved skill set against `skills-lock.json` pins:
   - **Missing** → one call per source: `npx skills@<pin> add <owner>/<repo> -s <a> <b> <c> -y --agent claude-code` (`-s` is space-separated). Re-read the lock after each call and report names still missing — `add` exits 0 on partial failure.
   - **Pinned but not in any bundle, and its source appears in the resolved bundles** → prune candidate. Print the list; remove via `skills remove` only with `--prune` plus interactive confirmation. Pins from sources no bundle mentions are hand-pins — never listed, never touched (consumers pin their own one-offs, see `docs/bundles.md`).
   - The nightly never prunes. Prune is a local, human-run act.
3. Config sync, file-ownership model (`docs/research/config-sync-patterns.md`; AGENTS.md sync dropped — fleet is Claude-only):
   - Hub owns `.claude/rules/skilly-*.md`, whole files. For each `bundles/<b>/rules/<name>.md` in the resolved bundles, write `.claude/rules/skilly-<name>.md` wholesale. Delete any `.claude/rules/skilly-*.md` whose `<name>` is no longer in the resolved set.
   - The repo owns everything else, `CLAUDE.md` included. No merging, no sentinels.
4. If anything changed, set `status.skilly = { lastUpdate: <ISO date>, commit: <hub SHA> }`. The hub SHA comes from `$SKILLY_COMMIT` (set by the workflow) or, locally, `gh api repos/timschoch/skilly/commits/main --jq .sha`.

`--dry-run` prints the planned calls and file writes, changes nothing.

Freshness check (no command needed): compare `status.skilly.commit` to hub `main`.

## Consumer files

`.skilly.json` — `bundles` human-owned; `status` sync-owned, each tracker set only when its own source changed:

```json
{
  "bundles": ["workflow", "project-laica"],
  "status": {
    "skills": { "lastUpdate": "2026-09-01", "pr": "https://…/pull/12" },
    "skilly": { "lastUpdate": "2026-09-01", "commit": "e4536d4…" }
  }
}
```

Caller workflow (scaffolded by `init`):

```yaml
name: skilly sync
on:
  schedule: [{ cron: "<m> 3 * * *" }]
  workflow_dispatch: {}
  pull_request: {}
jobs:
  skilly:
    uses: timschoch/skilly/.github/workflows/sync.yml@main
    secrets: inherit
    with:
      private-owner: admin-laicadev # only when a bundle pulls private sources from another owner; defaults to the repo owner
```

## Shared workflow — `.github/workflows/sync.yml`

Reusable (`workflow_call`), two jobs. `sync` runs on `schedule`/`workflow_dispatch`; `gate` runs on `pull_request`.

### Job `sync`

1. Checkout consumer; checkout hub at `main` into a subdir (source of `SKILLY_COMMIT` and the CLI).
2. Mint two App tokens with `actions/create-github-app-token@v2` (App `skilly-sync`, ID 4778931, secrets `SKILLY_APP_ID`/`SKILLY_APP_PRIVATE_KEY`):
   - **read token** scoped to `private-owner` → exported as `GH_TOKEN` for the skills CLI. Token auth flows through the `gh` CLI (`gh repo clone`) — present on hosted runners; plain git ignores `GH_TOKEN` (#8).
   - **write token** scoped to the consumer repo → for PR creation.
3. `npx skills@1.5.23 update -p -y` — capture stdout; collect `deleted upstream` warnings (the only rot signal; `-y` mode never prunes).
4. `npx skilly sync` (adds + config sync; no prune).
5. Set `status.skills` if step 3 changed the lock; `status.skilly` if step 4 changed anything.
6. `peter-evans/create-pull-request@v7` with the **write token**, branch `skilly/sync`. PR body: lock diff summary, deleted-upstream warnings, failed adds. Write the PR URL into `status.skills.pr` before creating. No changes → no PR.

The write token matters: a PR opened with `GITHUB_TOKEN` triggers no workflows, so the gate would never run on the Sync PR.

### Job `gate`

1. Checkout consumer + hub at `main`.
2. Read `.skilly.json`, resolve bundles, take the union of their `rules`.
3. Run each rule's check script `bundles/<b>/rules/<rule>.sh`. Any failure fails the job — a red check on the PR.

v1 ships one rule: `conventional-commits` (declared by `workflow`). Check: the last 20 commits on the default branch match `^(feat|fix|chore|docs|refactor|test|ci|build|perf|style|revert)(\(.+\))?!?: `; merge commits skipped.

Enforcement: on GitHub Free, private repos cannot *require* checks (no branch protection). The red check is the v1 signal — consistent with "a failing nightly PR is signal enough" (map, out-of-scope note on drift detection).

### Bundle `rules/` layout

`bundles/<b>/rules/<name>.md` = always-on rule file, config-synced to consumers. `bundles/<b>/rules/<name>.sh` = gate check script for declared rule `<name>`, runs only in CI. (Amends the `rules/` line in `docs/bundles.md`.)

## Hub CI (this repo)

Extend the existing PR action:

- `config.json` shape valid; `includes` acyclic; every declared rule has a `<rule>.sh` in its bundle.
- Rule-file `<name>`s unique across all bundles (they flatten into one `.claude/rules/` namespace).
- Router-rule generator output up to date (`bundles/workflow/scripts/update-router-rules.py` — already wired).

Keep `validate-app-auth.yml` as the auth regression test; keep `timschoch/skilly-auth-test` as the private-source fixture.

## Onboarding runbook

One-time, before the first consumer — **App permission widening** (browser, App settings for `skilly-sync`): add `contents: write` + `pull requests: write`, then approve the permission request on all three installations (`timschoch`, `Habits-Family`, `admin-laicadev`). Why: the Sync PR must be opened with an App token so the gate fires. Read scoping is unchanged — tokens are minted per owner/repo at run time.

Per consumer (all CLI, no browser):

```sh
gh secret set SKILLY_APP_ID  -R <owner>/<repo> --body 4778931
gh secret set SKILLY_APP_PRIVATE_KEY -R <owner>/<repo> < ~/repo/.skilly/skilly-app.pem
npx github:timschoch/skilly init <bundle...>
git checkout -b chore/skilly && git add -A && git commit -m "chore: onboard skilly" && gh pr create --fill
```

Secrets are per-repo because personal accounts on Free have no account-level secrets. Do not trust local auth tests on the Mac — the machine SSH key bypasses `$HOME` isolation (#8); validate in real CI only.

## Known v1 limits

- One private-source owner per consumer (`private-owner` input) — the skills CLI takes a single `GH_TOKEN`. A consumer needing private sources from two owners → make one source public (#4's preferred fix).
- Gate = red check, not a hard block, on Free private repos.
- Prune is manual. Upstream deletions surface as PR-body warnings only.

## Build order

Two sessions, then rollout:

1. **CLI session**: `package.json` (`bin`, `SKILLS_CLI_VERSION`), resolver (includes, cycles), lock diff + add calls, prune listing, config sync, `.skilly.json` status writes, `--dry-run`. Prove it against `timschoch/skilly-auth-test` and a `--dry-run` in one real consumer.
2. **Workflow session**: `sync.yml` (both jobs), `conventional-commits.sh`, caller template in `init`, App permission widening, hub CI checks. Pilot end-to-end on one small consumer before touching the fleet.
3. **Rollout** (beyond this map): per-consumer runbook above across the 14 repos — smallest first, drifted repos (colin's hand-copies) last, each ending in a merged onboarding PR.
