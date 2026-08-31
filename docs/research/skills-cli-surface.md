# skills CLI surface (vercel-labs/skills)

Research for `timschoch/skilly#3`. Answers what the skilly wrapper can rely on from `npx skills@latest`.

Sources: `vercel-labs/skills` GitHub repo at commit tip of `main` as of 2026-08-31 (latest release `v1.5.23`, published 2026-08-18, via `gh api repos/vercel-labs/skills/releases`), read directly: `README.md`, `src/cli.ts`, `src/add.ts`, `src/remove.ts`, `src/update.ts`, `src/skill-lock.ts`, `src/local-lock.ts`, `src/install.ts`, `src/list.ts`, `package.json`. Live-verified: `npx skills@1.5.23 --version` → `1.5.23`. Local lock files under `/Users/tim/repo/*/skills-lock.json` (15 repos found, all `sourceType: "github"`).

## 1. CLI surface

### `add`

`npx skills add <src> [-s <name>...] [-a <agent>...] [-g] [-y] [--copy] [--all] [--full-depth] [--metadata <json>] [--subagent <name>...]`

- `-s/--skill` is **variadic space-separated**, not comma-separated: `-s a b c`, or repeat the flag `-s a -s b`. `-s a,b,c` is a single literal skill name, not three names. (src/add.ts:2187-2196)
- `-y/--yes` skips prompts; without a TTY the CLI still needs `-y` or it hangs waiting on `@clack/prompts`.
- No `--json`/machine-readable output mode for `add`. All output is colored human text via `@clack/prompts`/`picocolors`. Not parseable for per-skill success/fail — diff `skills-lock.json` before/after instead.
- Exit codes: `0` success. `1` when **zero** of the requested `-s` names match anything in the source (src/add.ts:614-634, :1298-1312), on a missing source arg (src/add.ts:1049-1061), when the source contains no valid skills (src/add.ts:1233-1240), on clone/install exceptions (src/add.ts:2052-2064), and on invalid `--metadata` JSON (src/cli.ts:356-360). Per-agent install failures print `Failed to install N` but still exit `0` (src/add.ts:2036-2048). **Partial match is not an error**: `-s a b c` where `c` doesn't exist installs `a` and `b`, exits `0`, and does not print a distinct "c not found" line. A wrapper cannot detect a partially-missing skill from exit code or a stable stdout marker — it must diff the lock file's skill set against the requested names.
- `-l/--list` lists skills in the source without installing (also no `--json` here).

### `remove`

`npx skills remove [names...] [-g] [-a <agent>...] [-s <name>...] [-y] [--all]`

- Aliases: `rm`, `r`.
- `--all` = shorthand for `--skill '*' --agent '*' -y`.
- Interactive picker when no names/`-s` given and stdin is a TTY.
- Exit `1` only on combining `--all` with named skills (src/remove.ts:83-90) or on invalid `-a` agents (src/remove.ts:155-163). Everything else exits `0` — including "No matching skills found" with explicit names (src/remove.ts:173-175, plain `return`) and per-skill removal failures (printed, src/remove.ts:371-376). A wrapper cannot rely on remove's exit code; verify via the lock file.
- No `--json` output.

### `update`

`npx skills update [names...] [-g] [-p] [-y]`

- Aliases: `check`, `upgrade`.
- `-p/--project` and `-g/--global` restrict scope; both together = `both`. With neither and `-y` (or no TTY), scope auto-detects: project if `skills-lock.json` exists or `.agents/skills/*/SKILL.md` exists, else global (src/update.ts:60-136).
- Project-scope update does **not** hash-compare: it clones each source once, then re-runs `add <src> --skill <name> -y` as a child process for every lock entry that has a `skillPath` — every skill is refreshed unconditionally (src/update.ts:799, :881-931). Global scope compares `skillFolderHash` against the GitHub tree first (src/update.ts:584-591). Entries without `skillPath` cannot be updated (src/update.ts:938-957).
- `process.exit(0)` on cancel (src/update.ts:161); `process.exitCode = 1` iff at least one skill failed to update (src/update.ts:1005-1008) — deletions detected but skipped still exit `0`. No dedicated JSON output.

### `list`

`npx skills list [-g] [-a <agent>...] [--json]` (alias: `ls`)

- `--json` is the CLI's **only** machine-readable output: array of `{name, path, scope, agents[], source, sourceUrl, sourceType}`, no ANSI (src/list.ts:113-129). Wrapper protocol: `list --json` for installed/linked state + `skills-lock.json` diff for add/remove/update outcomes; never parse the human output.

### `experimental_install`

`npx skills experimental_install` — no flags read beyond passthrough to an internal sync step; not documented in README's option tables, only in the CLI's own `--help` banner ("Restore skills from skills-lock.json", src/cli.ts:90,131).

- Reads **project-scope** `skills-lock.json` only (`readLocalLock(cwd)` — ignores the global `~/.agents/.skill-lock.json`). Not a general restore-any-scope command. (src/install.ts:18-20)
- Groups locked skills by source, re-runs `add` per source group with `yes: true`.
- Installs **only** to `.agents/skills/` (the universal-agent directory), regardless of which agent directories the skill was originally symlinked/copied into. It does **not** restore the original per-agent placement (e.g. a skill originally installed to `.claude/skills/` only is *not* recreated there by `experimental_install`; it lands in `.agents/skills/` instead). (src/install.ts:31-33,70-76)
- `node_modules`-sourced entries are restored via `experimental_sync`, not `add`.
- Marked "experimental" — treat as unstable API surface, don't build the wrapper's primary restore path on it without a fallback.

## 2. `skills-lock.json` schema (project/local scope — the file the wrapper actually reads)

Defined in `src/local-lock.ts:8-60`. This is the **project-local** file (`./skills-lock.json`, committed to git) — distinct from the global lock (`~/.agents/.skill-lock.json` or `$XDG_STATE_HOME/skills/.skill-lock.json`, schema in `src/skill-lock.ts`, not used by the wrapper unless it does `-g` installs).

```ts
interface LocalSkillLockFile {
  version: number;                      // currently 1; version < 1 wipes the file on next read
  skills: Record<string, LocalSkillLockEntry>;  // key = skill name, alphabetically sorted on write
}

interface LocalSkillLockEntry {
  source: string;        // "owner/repo" for GitHub, npm pkg name, or local path
  sourceUrl?: string;    // original remote URL when source was normalized
  ref?: string;          // branch/tag pinned at install time
  sourceType: string;    // "github" | "node_modules" | "local" | provider-specific (e.g. "mintlify")
  skillPath?: string;    // path to SKILL.md within the source repo — REQUIRED for update() to
                          // target only this skill; also the field used to detect upstream deletion
  computedHash: string;  // SHA-256 over all files in the skill folder + their relative paths,
                          // computed from local disk content (not GitHub's tree SHA)
  subagents?: string[];  // Eve subagent targets only; irrelevant outside Eve
  wellKnownDigest?: string;
}
```

No `installedAt`/`updatedAt` timestamps in the local lock (deliberate — src/local-lock.ts:11-13, "minimize merge conflicts", so two branches adding different skills merge cleanly). File is rewritten in full, sorted, with trailing newline, on every add/remove.

Verified against real files: all 15 local `skills-lock.json` under `/Users/tim/repo/*/` (incl. this repo's own `skilly/skills-lock.json`, 22 entries) match this shape exactly — every entry has `source`, `sourceType: "github"`, `skillPath`, `computedHash`; none use `subagents` or `wellKnownDigest` (no Eve or well-known-provider installs among the sampled repos).

## 3. Upstream rename/delete behavior — handoff claim ("silent rot, no prune") is **partially wrong**

`update` actively detects deletions, it does not silently rot by default:

- `checkAndPromptForDeletions` re-discovers the source repo's current skill paths and flags any locked skill whose `skillPath` is no longer present as deleted upstream (src/update.ts:291-307).
- Interactive TTY run: prints a warning listing the deleted skill names, then prompts "Would you like to remove the local copies of these deleted skills?" — confirming runs `removeCommand`, pruning both the lock entry and installed files (src/update.ts:256-289).
- **Non-interactive run (`-y` or no TTY — i.e. every CI/wrapper invocation)**: prints the same warning to stdout, then explicitly skips deletion — `"Skipping deletion in non-interactive mode."` (src/update.ts:274-277). The lock entry and installed files are left in place.

So: **the wrapper's actual failure mode matches "no prune" exactly for its own non-interactive `-y` usage** — that part of the handoff is correct and load-bearing. "Silent" is not accurate: a warning line is printed to stdout on every non-interactive `update` run where a deletion was detected; a wrapper that discards `update`'s stdout will experience it as silent, but the signal exists if captured.

Rename is not special-cased: `skillPath` changing (dir renamed upstream) is indistinguishable from deletion — the old entry is flagged "deleted," and the new path surfaces separately as a "new skill available" via `printNewSkills` (src/update.ts:385+), not auto-linked to the renamed old entry. A rename therefore produces one stale entry (old name) plus one un-adopted new skill, not an automatic rename-in-place.

**Implication for the wrapper**: after every non-interactive `update -y`, parse stdout for the `"appear to have been deleted upstream"` line (or diff `skills-lock.json` skill names against a fresh listing of the source) to detect rot — the CLI will not do this cleanup itself in non-interactive mode.

## 4. Version pinning

- No CLI-level lockfile mechanism (the `pnpm-lock.yaml` in vercel-labs/skills only pins its own dev dependencies, irrelevant to consumers).
- `npx skills@latest` re-resolves to the newest published version on every invocation — no pinning by default, and behavior can change under the wrapper without warning.
- Pin by version: `npx skills@1.5.23 <command>` (verified live: `npx skills@1.5.23 --version` → `1.5.23`). Use this form in the wrapper instead of `@latest`.
- `skills --version` / `-v` prints the running CLI's own `package.json` version (src/cli.ts:19-30, 400-402) — usable in CI to assert the pinned version actually resolved (defends against a stale global npx cache or an unpinned call slipping through).
- Package is published to npm as `skills` (also exposes bin alias `add-skill`), `engines.node >= 22.20.0` (package.json). Releases are frequent (30 tags between 2026-02 and 2026-08, roughly weekly) — pin explicitly and bump deliberately rather than tracking latest.

## 5. Bundle/group feature — still absent as of v1.5.23 (2026-08-18)

No bundle, group, or "install set of skills as one unit" concept in the CLI. Confirmed by:
- No `bundle`/`group` command, flag, or type in `src/cli.ts`, `src/add.ts`, `src/types.ts`, `src/skill-lock.ts`, `src/local-lock.ts`.
- `gh api search/code?q=bundle+repo:vercel-labs/skills` returns only unrelated bundler/build-tooling hits (`build.config.mjs`, `tsconfig.json`, two agent-detection test files).
- README has no bundle/group section.

Closest adjacent feature: **plugin manifest discovery** (`.claude-plugin/marketplace.json` / `plugin.json`) lets a source repo declare named "plugins" that each bundle a list of skill paths, and the global lock records a `pluginName` per skill (src/skill-lock.ts:34; README "Plugin Manifest Discovery" section). This groups skills *for discovery within a source repo*, not for the wrapper's own bundle/group installs — it doesn't give `skilly` a way to add/remove/update a named set of skills as one atomic op. Re-check on future CLI upgrades; nothing in the 2026-08-18 → 2026-08-31 window changed this.
