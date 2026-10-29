#!/usr/bin/env bash
# Gate check `naming`: every file the PR adds or changes over its base branch
# passes the machine-checkable part of the naming Rule. The check, base branch
# included, lives in the Engine's naming/check.mjs, so a consumer's `verify`
# push stage runs the same code from `.skilly/engine/naming/`.
set -euo pipefail

exec node "$(dirname "$0")/../../../engine/naming/check.mjs"
