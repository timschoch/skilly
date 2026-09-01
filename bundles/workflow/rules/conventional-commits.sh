#!/usr/bin/env bash
# Gate check `conventional-commits`: the last 20 commits on the default branch
# match the conventional-commit pattern; merges skipped.
# One Rule, two adapters — this pattern MUST equal the commit-msg hook's in
# bundles/setup-project/skills/setup-repo/scripts/check-commit-msg.mjs.
# DEFAULT_BRANCH comes from the workflow; falls back to origin/HEAD, then main.
set -euo pipefail

branch="${DEFAULT_BRANCH:-}"
if [ -z "$branch" ]; then
  branch="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||' || true)"
fi
branch="${branch:-main}"

ref="origin/${branch}"
git rev-parse --verify --quiet "$ref" >/dev/null || ref="$branch"

pattern='^(feat|fix|chore|docs|refactor|test|ci|build|perf|style|revert)(\([a-z0-9./-]+\))?!?: [^[:space:]].{0,71}$'
status=0
while IFS=$'\t' read -r sha subject; do
  if [[ "$subject" =~ $pattern ]]; then
    echo "ok   ${sha} ${subject}"
  else
    echo "FAIL ${sha} ${subject}"
    status=1
  fi
done < <(git log --no-merges -20 --format=$'%h\t%s' "$ref")

exit "$status"
