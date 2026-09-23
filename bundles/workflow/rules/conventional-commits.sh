#!/usr/bin/env bash
# Gate check `conventional-commits`: every commit the PR adds over its base
# branch passes the commit-msg hook's own script, so hook and gate cannot
# drift. Merges skipped. History from before a repo adopted skilly is out of
# scope by construction.
# GITHUB_BASE_REF is set on pull_request events; falls back to DEFAULT_BRANCH,
# then origin/HEAD, then main.
set -euo pipefail

branch="${GITHUB_BASE_REF:-${DEFAULT_BRANCH:-}}"
if [ -z "$branch" ]; then
  branch="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||' || true)"
fi
branch="${branch:-main}"

ref="origin/${branch}"
git rev-parse --verify --quiet "$ref" >/dev/null || ref="$branch"

hook="$(dirname "$0")/../../setup-project/skills/setup-repo/scripts/check-commit-msg.mjs"
status=0
checked=0
while IFS=$'\t' read -r sha subject; do
  checked=1
  if git log -1 --format=%B "$sha" | node "$hook" /dev/stdin 2>/dev/null; then
    echo "ok   ${sha} ${subject}"
  else
    echo "FAIL ${sha} ${subject}"
    status=1
  fi
done < <(git log --no-merges --format=$'%h\t%s' "${ref}..HEAD")

[ "$checked" = 0 ] && echo "no commits over ${ref} — nothing to check"
exit "$status"
