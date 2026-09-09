# npmjs

Publishing a package to the npm registry from GitHub Actions. One skill: `publish-npm-package` (yigitkonur/skills-by-yigitkonur) — auth, version management, workflow trigger, provenance, validation, recovery. Routing lives in `SKILL.md`, the YAML and tool deep-dives in its `references/`.

Add it to any repo whose `package.json` ships to npm. Stack-agnostic — pair it with the `tech-*` bundle of the package itself.

Depends on release automation, which this bundle does not carry: `setup-release-please` lives in `setup-project` and runs once at bootstrap. The shape it expects: release-please cuts the release on `main`, a second job gated on `release_created` publishes with npm trusted publishing (OIDC, `id-token: write`, no `NPM_TOKEN`).

Left out (2026-09-09): the rest of yigitkonur/skills-by-yigitkonur — a broad personal catalog, pinned to this one skill.

## Own bundle, not a setup-project skill

The skill writes the publish workflow once. That part is setup. Most of the skill is not.

[setup-project](../setup-project/config.json) is removed from a repo after bootstrap. These parts are needed after that:

| Part of the skill | When it runs |
| --- | --- |
| Recovery routing: `EOTP`, `ENEEDAUTH`, `E403`, OIDC 404 on a never-published package, a stuck release-please PR | Every failed publish |
| Wrong version published: unpublish inside 72 hours, else deprecate and patch forward | After a bad release |
| Token leak: revoke, rotate, audit, harden | On an incident |
| Granular token rotation | On a schedule |
| `scripts/check-npm-auth.sh`, `scripts/dry-run-publish.sh`, `scripts/check-package-json.mjs` | Before a publish |
| Auth and versioning decision matrix | Each new package in a workspace |

In `setup-project` the skill would be gone at the first broken release.
