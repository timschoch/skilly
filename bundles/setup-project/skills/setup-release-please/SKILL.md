---
name: setup-release-please
description: >
  Install release-please release automation plus the repo merge settings git-shortcuts
  expects (delete-branch-on-merge, squash merges for ticket branches, merge commits for
  epics). Use when the user wants release automation, a release-PR/changelog workflow,
  or release-please set up in a repo.
---

# Setup release-please

Sets up [release-please](https://github.com/googleapis/release-please) via [release-please-action](https://github.com/googleapis/release-please-action). How it works, release types, config options, first-run bootstrapping: the official READMEs — consult them instead of guessing.

## Steps

1. **Already set up?** `grep -rl release-please .github/workflows/ 2>/dev/null` — a hit: skip to step 3, verify settings only.

2. **Install the workflow** at `.github/workflows/release.yml`. Substitute the trunk (`git symbolic-ref --short refs/remotes/origin/HEAD | sed 's|^origin/||'`, fallback `main`); release type `node` when `package.json` exists, else `simple`:

   ```yaml
   name: Release

   on:
     push:
       branches: [main]

   concurrency:
     group: release
     cancel-in-progress: false

   permissions:
     contents: write
     pull-requests: write

   jobs:
     release:
       runs-on: ubuntu-latest
       steps:
         # A PR opened with GITHUB_TOKEN triggers no workflows, so the
         # required checks would never report. The App token makes them fire.
         - uses: actions/create-github-app-token@v3
           id: app-token
           with:
             app-id: ${{ secrets.SKILLY_APP_ID }}
             private-key: ${{ secrets.SKILLY_APP_PRIVATE_KEY }}
         - uses: googleapis/release-please-action@v5
           id: release
           with:
             release-type: node
             token: ${{ steps.app-token.outputs.token }}
         # Per-project deploy steps go below, each gated on:
         #   if: steps.release.outputs.release_created == 'true'
   ```

3. **Repo merge settings:**

   ```bash
   gh api -X PATCH repos/{owner}/{repo} \
     -F delete_branch_on_merge=true \
     -F allow_squash_merge=true \
     -F allow_merge_commit=true
   ```

4. **Let Actions open PRs** (release-please fails with "GitHub Actions is not permitted to create or approve pull requests" otherwise):

   ```bash
   gh api -X PUT repos/{owner}/{repo}/actions/permissions/workflow \
     -f default_workflow_permissions=write \
     -F can_approve_pull_request_reviews=true
   ```

5. **Commit** (`ci: add release-please workflow`) and confirm the run is green once it lands on the trunk (`gh run watch`).

## Our quirks vs the official setup

- The deploy half stays per-project, hooked after the release-please step and gated on `release_created` — full migrate-and-deploy example: `admin-laicadev/colin` `.github/workflows/release.yml`.
- The merge settings in step 3 are what `git-shortcuts` relies on: `m` expects `delete_branch_on_merge`; ticket branches squash, `epic/*` → trunk uses merge commits so release-please sees the per-ticket conventional commits.
- `--release` (git-shortcuts) is what merges the release PR, found by the `autorelease: pending` label.
- The release PR runs on the skilly App token (`SKILLY_APP_ID` / `SKILLY_APP_PRIVATE_KEY`, set by `skilly setup`), so its checks fire; [`setup-repo`'s `ci.yml`](../setup-repo/templates/workflows/ci.yml) then skips `verify` on `release-please--*` branches. A ruleset scopes by target branch and bypass actor only, never by source branch, so skipping is the one honest way to clear required checks. Never post a success status for a check that did not run.
- Conventional commits are already enforced fleet-wide by the workflow bundle's `conventional-commits` rule.
