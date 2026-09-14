#!/usr/bin/env bash
# Gate check `naming`: every file the PR adds or changes over its base branch
# passes the machine-checkable part of the naming Rule. Files untouched by the
# PR are out of scope by construction — the gate never asks for a rename sweep.
# The checks live in naming.mjs; this wrapper only picks the base ref and the
# file list, exactly like conventional-commits.sh does.
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

files="$(git diff --name-only --diff-filter=ACMR "${ref}...HEAD")"
if [ -z "$files" ]; then
  echo "no files changed over ${ref} — nothing to check"
  exit 0
fi

printf '%s\n' "$files" | node "$(dirname "$0")/naming.mjs"
