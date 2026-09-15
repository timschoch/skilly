#!/usr/bin/env bash
# Block until the PR's checks settle, then print a fresh pr-state.sh snapshot.
#
# Usage: watch.sh <pr-number|url>
#   BABYSIT_MAX_MINUTES caps the wait (default 60), so a stuck queue cannot
#   hold the loop forever.
#
# Exit code mirrors `gh pr checks`: 0 all passed, 8 still pending at the cap,
# anything else a failing check.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
pr="${1:-}"
if [[ -z "$pr" ]]; then
  echo "usage: watch.sh <pr-number|url>" >&2
  exit 2
fi

max="${BABYSIT_MAX_MINUTES:-60}"
deadline=$(( $(date +%s) + max * 60 ))
rc=0

while true; do
  set +e
  gh pr checks "$pr" --watch --fail-fast
  rc=$?
  set -e
  # gh 2.98: 8 = no check has reported yet / still pending, 0 = all passed.
  [[ $rc -eq 8 ]] || break
  if [[ "$(date +%s)" -ge "$deadline" ]]; then
    echo "watch.sh: checks still pending after ${max}m" >&2
    break
  fi
  sleep 30
done

bash "$here/pr-state.sh" "$pr"
exit "$rc"
