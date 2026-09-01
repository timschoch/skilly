#!/usr/bin/env bash
# Gate check `conventional-commits`: every commit the PR adds over its base
# branch matches the conventional-commit pattern; merges skipped. History from
# before a repo adopted skilly is out of scope by construction.
# One Rule, two adapters — this pattern MUST equal the commit-msg hook's in
# bundles/setup-project/skills/setup-repo/scripts/check-commit-msg.mjs.
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

pattern='^(feat|fix|chore|docs|refactor|test|ci|build|perf|style|revert)(\([a-z0-9./-]+\))?!?: [^[:space:]].{0,71}$'
status=0
checked=0
while IFS=$'\t' read -r sha subject; do
  checked=1
  if [[ "$subject" =~ $pattern ]]; then
    echo "ok   ${sha} ${subject}"
  else
    echo "FAIL ${sha} ${subject}"
    status=1
  fi
done < <(git log --no-merges --format=$'%h\t%s' "${ref}..HEAD")

[ "$checked" = 0 ] && echo "no commits over ${ref} — nothing to check"
exit "$status"
