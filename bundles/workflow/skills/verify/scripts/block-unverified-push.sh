#!/usr/bin/env bash
# Moved to the Engine: verify/block-unverified-push.sh. This old path runs it, see run-engine-script.mjs.
exec node "$(dirname "$0")/run-engine-script.mjs" verify/block-unverified-push.sh "$@"
