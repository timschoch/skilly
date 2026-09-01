# The ways to hurt yourself

Good defaults, not law — the developer's word overrides anything here.

1. Never run `gh auth switch`. It is global state; concurrent agent sessions race each other into the wrong account. The account is pinned per repo via the username in the origin URL.
2. Never delete-then-write, or temp-file plus `mv`, over an existing file. Those carry no proof of the state they overwrite, so they silently clobber another agent's concurrent edit.
