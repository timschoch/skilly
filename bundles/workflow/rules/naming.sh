#!/usr/bin/env bash
# Gate check `naming`: every file the PR adds or changes over its base branch
# passes the machine-checkable part of the naming Rule. The check, base branch
# included, lives in the naming skill's check.mjs, so a consumer's `verify`
# push stage runs the same code from `.agents/skills/naming/scripts/`.
set -euo pipefail

exec node "$(dirname "$0")/../skills/naming/scripts/check.mjs"
