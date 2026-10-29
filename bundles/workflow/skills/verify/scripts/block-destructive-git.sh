#!/usr/bin/env bash
# Moved to the Engine: verify/block-destructive-git.sh. This old path runs it, see run-engine-script.mjs.
exec node "$(dirname "$0")/run-engine-script.mjs" verify/block-destructive-git.sh "$@"
