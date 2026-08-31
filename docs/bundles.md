# Bundles

One directory per bundle under `bundles/`:

```
bundles/<name>/
  config.json   # required: { "includes": [...], "rules": [...], "sources": [{ "source": "owner/repo", "skills": [...] }] }
  skills/       # only skills maintained in this repo; external skills live in config.json only
  rules/        # <name>.md always-on rule files (config-synced to consumers) + <name>.sh gate check scripts for declared rules
  docs/         # optional bundle docs
```

- `includes`: names of other bundles pulled in recursively (subbundles). A repo that adds `project-x` gets the union of `project-x` and everything it includes. Cycles are an error.
- `rules`: rule names declared by this bundle; each script lives in the bundle's own `rules/`. A repo enforces the union of its bundles' rules.
- Hub-maintained skills (e.g. `orchestrate`) live in `bundles/workflow/skills/` and are listed in `config.json` with source `timschoch/skilly` like any other source.

## Bundles

- `workflow` — engineering/productivity skills, stack-agnostic. Carries rule `conventional-commits`. Includes `context7` (netresearch/context7-skill) for live library docs where no vendor docs skill exists. Hub-maintained: `orchestrate`, `step-by-step`, `cleanup-merged-branches`, plus `qa` (resurrected — deprecated+deleted upstream in mattpocock/skills, hub is its canonical home; its successors `triage`+`to-tickets` don't cover the conversational file-issues-from-a-chat flow). Grilling family: only `grilling` is bundled; `grill-me`/`grill-with-docs` are 1-line slash aliases for it, dropped.
- `setup-repo` — one-time repo setup skills, installed when bootstrapping a repo, not carried everywhere: `git-guardrails-claude-code`, `setup-pre-commit` (timschoch/mattpocock-skills).
- `marketing` — minimal set: 4 skills from coreyhaines31/marketingskills (canonical source, laica-launcher re-exports dropped) plus `lemy-write` sourced directly — NOT via `tech-lemy`, which would pull all three lemy skills.
- `marketing-extended` — full suite: includes `marketing` + `tech-lemy` (all three lemy skills) and the remaining 20 coreyhaines31/marketingskills.
- `tech-*` — one bundle per technology, from verified vendor skill repos: `tech-twenty`, `tech-langfuse`, `tech-payload` (payloadcms/skills), `tech-neon` (neondatabase/agent-skills, includes `tech-postgres`), `tech-postgres` (neondatabase/postgres-skills), `tech-trigger-dev` (triggerdotdev/skills), `tech-vercel` (vercel-labs/agent-skills), `tech-posthog` (PostHog/skills), `tech-tanstack` (TanStack/router), `tech-powersync` (powersync-ja/agent-skills), `tech-better-auth` (better-auth/skills), `tech-drizzle` (hub-only — no vendor skill repo exists), `tech-react` (vercel-labs/agent-skills React skills, moved out of `tech-vercel`), `tech-shadcn` (shadcn-ui/ui official `shadcn` skill), `tech-nextjs` (vercel/next.js `skills/` — version-matched official skills, includes `tech-react`; the old vercel-labs/next-skills repo is a dead pointer), `tech-typescript` (cursor/plugins `typescript-best-practices` + wshobson/agents `typescript-advanced-types` — complementary: discipline vs type-system mechanics; wshobson is a big marketplace repo, pinned to this one skill).
- CLI reminder skills — hub-maintained minimal skills that remind agents to use the product CLI: `neon-cli`, `trigger-cli`, `vercel-cli`, `payload-cli`, `posthog-cli`, `drizzle-cli`, each in its tech bundle's `skills/`. Descriptions are scoped to what the CLI covers. Docs coverage per tool: trigger/payload/posthog/neon/vercel get docs via their vendor skills in the same bundle; drizzle has none (its CLI skill points to `context7`). `neonctl skills` and `vercel skills` are skill INSTALLERS, not docs commands — deliberately not referenced, skilly owns skill installs. drizzle-team ships skills inside the `drizzle-kit` npm package on the 1.0.0-rc line only — revisit at 1.0 stable.
- `project-laica` — private source `admin-laicadev/laica-launcher` (skills stay private); includes the tech bundles of the colin/laica-workflows stacks plus `tech-lemy`, `tech-nextjs`, `tech-typescript`. `tech-twenty` NOT included — only laica-stack uses Twenty; add it there directly.
- `project-habits` — includes-only bundle for the habits stack (TanStack Start, Neon/Drizzle, PowerSync, Better Auth, PostHog, Vercel, Langfuse) plus `tech-react`, `tech-typescript`, `marketing` (minimal), and `tech-lemy`.
- `tech-lemy` — lemy brand skills (verified against the refactored `timschoch/lemy`: still `lemy-brand`, `lemy-setup`, `lemy-write`; `lemy-admin` is internal-only there and stays out).
- `pitchdeck` — deck creation, review, and visuals from external sources (verified via colin's skills-lock.json): `pitch-deck` (ailabs-393/ai-labs-claude-skills), `pitch-deck-reviewer` (onewave-ai/claude-skills), `pitch-deck-visuals` (inference-sh/skills, needs external `belt` CLI), `startup-pitch` (ferdinandobons/startup-skill), `yc-pitch-deck` and `alex-hormozi-pitch` (admin-laicadev/laica-launcher). Caveat: `alex-hormozi-pitch` delegates to a laica-launcher-local command (`${PAI_DIR}/commands/create-hormozi-pitch.md`) — may need that file to work outside laica-launcher.

## Deliberately not bundled

- `setup-matt-pocock-skills` — replaced by skilly.
- meco-only: `writing-beats`, `writing-fragments`, `writing-shape`, `scaffold-exercises`, `migrate-to-shoehorn`, `setup-ts-deep-modules` — meco pins them itself.
- colin one-offs (`impeccable`, `frontend-slides`, `typescript-best-practices`, `frontend-design`, `security-best-practices`, `seo-geo`) — colin pins its own.
- `obsidian-vault` — lerni-berni only.
