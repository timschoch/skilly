# ADR-0002: One `allow` shape and stack files for every file-checking PR gate

Status: accepted, 2026-09-28

## Context

The naming gate failed Payload consumers on names they cannot change: `{ db, payload, req }` in the migration signature Payload defines, `20240523_120000.ts` migration files, a generated `importMap.js`. The only exception was a flat `allow` list of regexes. It silenced every rule for a name, could not tie a name to a path, carried no reason, and could not be dropped by key. Vendored and generated paths were hard-coded in [check.mjs](../../bundles/workflow/skills/naming/scripts/check.mjs), beyond the consumer's reach.

## Decision

1. A PR gate that checks files skips names the code does not declare. The naming gate leaves out a destructured key without a rename.
2. Exceptions live in one keyed `allow` object. Each entry: `paths` and/or `names` (regexes, both must match), `rules` (rule IDs or `"*"`), `why` (required). A malformed entry fails the gate. Shape: [lint.md](../../bundles/workflow/skills/naming/references/lint.md#exceptions).
3. Built-in skips (`node_modules`, `.agents`, `*.d.ts`, …) are default `allow` entries, not code. A consumer drops one with `null`.
4. Stack defaults ship next to the gate's config as `stacks/<bundle>.json`, same shape, keys prefixed `<stack>/`. They merge between the hub defaults and the consumer's override, for each bundle listed directly in `.skilly/config.json`.
5. [validateAndUpdateSkilly](../../lib/validate-and-update-skilly.js) converts an old config shape in place, so every skilly verb and the nightly sync fix consumers. The gate fails on the old shape and names the command that converts it.
6. Third-party tools (Semgrep, Biome, ESLint) keep their own ignore settings. skilly does not wrap them.

## Consequences

The next file-checking gate copies this shape and reads its own `stacks/<bundle>.json`. Bundles reached only through `includes` bring no stack file. The consumer checkout has no hub bundle configs to resolve them, and local runs must match CI. Converted entries carry a placeholder `why` until a person replaces it. The workflow bundle's naming skill holds one file per stack that needs one.

## Rejected

- A separate `ignore` key next to `allow`. Two words for one job.
- The flat `allow` list. It has no rule scope, no path and name together, no reason, and no drop by key.
- Stack files inside each tech bundle. The naming skill ships to consumers and a tech bundle's config does not, so local runs would miss them.
- One filter in [run-gate.mjs](../../scripts/run-gate.mjs) for all gates. Gates print text today, not `{file, line, rule}` data. Revisit when a second file-checking gate exists.
- An inline `// naming-ignore` comment. It is a second way to do the same thing.
