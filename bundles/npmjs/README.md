# npmjs

Publishing a package to the npm registry from GitHub Actions. One skill: `publish-npm-package` (yigitkonur/skills-by-yigitkonur) — auth, version management, workflow trigger, provenance, validation, recovery. Routing lives in `SKILL.md`, the YAML and tool deep-dives in its `references/`.

Add it to any repo whose `package.json` ships to npm. Stack-agnostic — pair it with the `tech-*` bundle of the package itself.

Depends on release automation, which this bundle does not carry: `setup-release-please` lives in `setup-project` and runs once at bootstrap. The proven shape (timschoch/animateTextWeight): release-please cuts the release on `main`, a second job gated on `release_created` publishes with npm trusted publishing (OIDC, `id-token: write`, no `NPM_TOKEN`).

Left out (2026-09-09): the rest of yigitkonur/skills-by-yigitkonur — a broad personal catalog, pinned to this one skill.
