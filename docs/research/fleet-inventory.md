# Skill fleet inventory

Research for `timschoch/skilly#6`. Full read-only inventory of the skill fleet across every repo under `/Users/tim/repo/`, grouped into candidate bundle categories. No opinions on final bundle membership — that is `timschoch/skilly#2`'s job.

Sources: direct shell reads (`cat`/`ls`/`jq`) of `skills-lock.json` in 15 top-level repos under `/Users/tim/repo/*/` (worktree/`.temp` copies excluded — one canonical lock file per repo), `ls -la ~/.claude/skills/`, and `.agents/skills/` directory listings diffed against each repo's lock file. All commands run 2026-08-31, read-only outside the skilly worktree.

## 1. Locked pins by candidate category

109 unique skill names, 119 unique (skill, source) pairs (10 names are pinned from two different upstream sources across repos — see rows with duplicate skill names in Marketing and Technology-specific below), across 15 `skills-lock.json` files: `laica-stack`, `laica-cli-anything`, `casaarca.com`, `skilly`, `laica-workflows`, `laica-boilerplate`, `habits`, `lerni-berni`, `blogy`, `laica-launcher`, `habits-product-management`, `colin`, `meco`, `lemyvoce`, `habits-v2`.

### General workflow (43 skills)

Engineering/productivity skills, source-agnostic w.r.t. the consuming repo's tech stack. All but `unslop` and `skill-creator` come from `timschoch/mattpocock-skills`.

| Skill | Source | # repos | Repos |
|---|---|---|---|
| ask-matt | timschoch/mattpocock-skills | 6 | habits, lerni-berni, blogy, meco, lemyvoce, habits-v2 |
| check-upstream | timschoch/mattpocock-skills | 2 | meco, habits-v2 |
| claude-handoff | timschoch/mattpocock-skills | 5 | habits, blogy, meco, lemyvoce, habits-v2 |
| cleanup-merged-branches | timschoch/mattpocock-skills | 6 | skilly, lerni-berni, blogy, meco, lemyvoce, habits-v2 |
| code-review | timschoch/mattpocock-skills | 7 | skilly, habits, lerni-berni, blogy, meco, lemyvoce, habits-v2 |
| codebase-design | timschoch/mattpocock-skills | 6 | habits, lerni-berni, blogy, meco, lemyvoce, habits-v2 |
| design-an-interface | timschoch/mattpocock-skills | 4 | habits, lerni-berni, blogy, habits-v2 |
| diagnosing-bugs | timschoch/mattpocock-skills | 7 | skilly, habits, lerni-berni, blogy, meco, lemyvoce, habits-v2 |
| domain-modeling | timschoch/mattpocock-skills | 7 | skilly, habits, lerni-berni, blogy, meco, lemyvoce, habits-v2 |
| git-guardrails-claude-code | timschoch/mattpocock-skills | 7 | skilly, habits, lerni-berni, blogy, meco, lemyvoce, habits-v2 |
| grill-me | timschoch/mattpocock-skills | 6 | habits, lerni-berni, blogy, meco, lemyvoce, habits-v2 |
| grill-with-docs | timschoch/mattpocock-skills | 6 | habits, lerni-berni, blogy, meco, lemyvoce, habits-v2 |
| grilling | timschoch/mattpocock-skills | 6 | habits, lerni-berni, blogy, meco, lemyvoce, habits-v2 |
| handoff | timschoch/mattpocock-skills | 6 | habits, lerni-berni, blogy, meco, lemyvoce, habits-v2 |
| implement | timschoch/mattpocock-skills | 7 | skilly, habits, lerni-berni, blogy, meco, lemyvoce, habits-v2 |
| improve-codebase-architecture | timschoch/mattpocock-skills | 6 | habits, lerni-berni, blogy, meco, lemyvoce, habits-v2 |
| loop-me | timschoch/mattpocock-skills | 3 | habits, meco, habits-v2 |
| orchestrate | timschoch/mattpocock-skills | 7 | skilly, habits, lerni-berni, blogy, meco, lemyvoce, habits-v2 |
| prototype | timschoch/mattpocock-skills | 8 | skilly, habits, lerni-berni, blogy, colin, meco, lemyvoce, habits-v2 |
| qa | timschoch/mattpocock-skills | 5 | habits, lerni-berni, blogy, lemyvoce, habits-v2 |
| research | timschoch/mattpocock-skills | 7 | skilly, habits, lerni-berni, blogy, meco, lemyvoce, habits-v2 |
| resolving-merge-conflicts | timschoch/mattpocock-skills | 7 | skilly, habits, lerni-berni, blogy, meco, lemyvoce, habits-v2 |
| scaffold-exercises | timschoch/mattpocock-skills | 1 | meco |
| setup-matt-pocock-skills | timschoch/mattpocock-skills | 7 | skilly, habits, lerni-berni, blogy, meco, lemyvoce, habits-v2 |
| setup-pre-commit | timschoch/mattpocock-skills | 5 | skilly, lerni-berni, blogy, meco, lemyvoce |
| step-by-step | timschoch/mattpocock-skills | 2 | meco, habits-v2 |
| tdd | timschoch/mattpocock-skills | 7 | skilly, habits, lerni-berni, blogy, meco, lemyvoce, habits-v2 |
| teach | timschoch/mattpocock-skills | 6 | habits, lerni-berni, blogy, meco, lemyvoce, habits-v2 |
| to-questionnaire | timschoch/mattpocock-skills | 3 | skilly, meco, habits-v2 |
| to-spec | timschoch/mattpocock-skills | 7 | skilly, habits, lerni-berni, blogy, meco, lemyvoce, habits-v2 |
| to-tickets | timschoch/mattpocock-skills | 7 | skilly, habits, lerni-berni, blogy, meco, lemyvoce, habits-v2 |
| triage | timschoch/mattpocock-skills | 7 | skilly, habits, lerni-berni, blogy, meco, lemyvoce, habits-v2 |
| ubiquitous-language | timschoch/mattpocock-skills | 5 | habits, lerni-berni, blogy, lemyvoce, habits-v2 |
| unslop | cursor/plugins | 2 | skilly, colin |
| wait-what | timschoch/mattpocock-skills | 3 | skilly, meco, habits-v2 |
| wayfinder | timschoch/mattpocock-skills | 7 | skilly, habits, lerni-berni, blogy, meco, lemyvoce, habits-v2 |
| wizard | timschoch/mattpocock-skills | 3 | skilly, meco, habits-v2 |
| writing-beats | timschoch/mattpocock-skills | 1 | meco |
| writing-for-agents | timschoch/mattpocock-skills | 3 | skilly, meco, habits-v2 |
| writing-fragments | timschoch/mattpocock-skills | 1 | meco |
| writing-great-skills | timschoch/mattpocock-skills | 5 | habits, lerni-berni, blogy, colin, lemyvoce |
| writing-shape | timschoch/mattpocock-skills | 1 | meco |
| skill-creator | anthropics/skills | 2 | laica-launcher, colin |

### Marketing (31 skills)

Mostly `coreyhaines31/marketingskills`; `colin` and `laica-launcher` also pin several of the same skill names from `admin-laicadev/laica-launcher` (its own re-export) or third-party pitch-deck sources — flagged by the duplicate skill-name rows.

| Skill | Source | # repos | Repos |
|---|---|---|---|
| ai-seo | admin-laicadev/laica-launcher | 1 | colin |
| ai-seo | coreyhaines31/marketingskills | 1 | laica-launcher |
| alex-hormozi-pitch | admin-laicadev/laica-launcher | 1 | colin |
| alex-hormozi-pitch | microck/ordinary-claude-skills | 1 | laica-launcher |
| churn-prevention | admin-laicadev/laica-launcher | 1 | colin |
| churn-prevention | coreyhaines31/marketingskills | 3 | habits, laica-launcher, habits-v2 |
| community-marketing | coreyhaines31/marketingskills | 2 | habits, habits-v2 |
| competitor-profiling | admin-laicadev/laica-launcher | 1 | colin |
| competitor-profiling | coreyhaines31/marketingskills | 3 | habits, laica-launcher, habits-v2 |
| competitors | coreyhaines31/marketingskills | 2 | habits, habits-v2 |
| content-strategy | admin-laicadev/laica-launcher | 1 | colin |
| content-strategy | coreyhaines31/marketingskills | 3 | habits, laica-launcher, habits-v2 |
| copy-editing | coreyhaines31/marketingskills | 3 | habits, colin, habits-v2 |
| copywriting | coreyhaines31/marketingskills | 3 | habits, colin, habits-v2 |
| cro | admin-laicadev/laica-launcher | 1 | colin |
| cro | coreyhaines31/marketingskills | 3 | habits, laica-launcher, habits-v2 |
| customer-research | coreyhaines31/marketingskills | 2 | habits, habits-v2 |
| launch | coreyhaines31/marketingskills | 2 | habits, habits-v2 |
| lead-magnets | admin-laicadev/laica-launcher | 1 | colin |
| lead-magnets | coreyhaines31/marketingskills | 3 | habits, laica-launcher, habits-v2 |
| marketing-council | coreyhaines31/marketingskills | 2 | habits, habits-v2 |
| marketing-ideas | coreyhaines31/marketingskills | 2 | habits, habits-v2 |
| marketing-loops | coreyhaines31/marketingskills | 2 | habits, habits-v2 |
| marketing-plan | coreyhaines31/marketingskills | 2 | habits, habits-v2 |
| marketing-psychology | coreyhaines31/marketingskills | 2 | habits, habits-v2 |
| onboarding | coreyhaines31/marketingskills | 2 | habits, habits-v2 |
| product-marketing | coreyhaines31/marketingskills | 2 | habits, habits-v2 |
| prospecting | coreyhaines31/marketingskills | 2 | habits, habits-v2 |
| referrals | coreyhaines31/marketingskills | 2 | habits, habits-v2 |
| seo-audit | admin-laicadev/laica-launcher | 1 | colin |
| seo-audit | coreyhaines31/marketingskills | 3 | habits, laica-launcher, habits-v2 |
| seo-geo | resciencelab/opc-skills | 1 | colin |
| signup | coreyhaines31/marketingskills | 2 | habits, habits-v2 |
| site-architecture | coreyhaines31/marketingskills | 1 | habits-v2 |
| pitch-deck | ailabs-393/ai-labs-claude-skills | 1 | colin |
| pitch-deck-reviewer | onewave-ai/claude-skills | 1 | colin |
| pitch-deck-visuals | inference-sh/skills | 1 | colin |
| startup-pitch | ferdinandobons/startup-skill | 1 | colin |
| yc-pitch-deck | admin-laicadev/laica-launcher | 1 | colin |
| yc-pitch-deck | guia-matthieu/clawfu-skills | 1 | laica-launcher |

### Technology-specific (21 skills)

Tied to a library/platform, not to one project. The 12 `twentyhq/twenty` entries (in `laica-stack` only) are all specific to building on the Twenty CRM platform.

| Skill | Source | # repos | Repos |
|---|---|---|---|
| migrate-to-shoehorn | timschoch/mattpocock-skills | 1 | meco |
| setup-ts-deep-modules | timschoch/mattpocock-skills | 1 | meco |
| typescript-best-practices | cursor/plugins | 1 | colin |
| langfuse | langfuse/skills | 3 | habits, blogy, habits-v2 |
| payload | payloadcms/skills | 1 | casaarca.com |
| frontend-design | admin-laicadev/laica-launcher | 1 | colin |
| frontend-design | anthropics/skills | 1 | laica-launcher |
| frontend-slides | zarazhangrui/frontend-slides | 1 | colin |
| impeccable | pbakaus/impeccable | 1 | colin |
| security-best-practices | admin-laicadev/laica-launcher | 1 | colin |
| create-app | twentyhq/twenty | 1 | laica-stack |
| develop-app | twentyhq/twenty | 1 | laica-stack |
| manage-app | twentyhq/twenty | 1 | laica-stack |
| publish-app | twentyhq/twenty | 1 | laica-stack |
| use-twenty-mcp | twentyhq/twenty | 1 | laica-stack |
| twenty-record-presentation | twentyhq/twenty | 1 | laica-stack |
| syncable-entity-builder-and-validation | twentyhq/twenty | 1 | laica-stack |
| syncable-entity-cache-and-transform | twentyhq/twenty | 1 | laica-stack |
| syncable-entity-integration | twentyhq/twenty | 1 | laica-stack |
| syncable-entity-runner-and-actions | twentyhq/twenty | 1 | laica-stack |
| syncable-entity-testing | twentyhq/twenty | 1 | laica-stack |
| syncable-entity-types-and-constants | twentyhq/twenty | 1 | laica-stack |

(22 rows above: 21 unique skill names, `frontend-design` pinned from two different sources.)

### Project-specific (13 skills)

Tied to the laica product/CLI or the lemy brand, not a general technology.

| Skill | Source | # repos | Repos |
|---|---|---|---|
| laica-git-shortcuts | admin-laicadev/laica-launcher | 5 | laica-stack, laica-cli-anything, laica-workflows, laica-boilerplate, colin |
| laica-launcher | admin-laicadev/laica-launcher | 5 | laica-stack, laica-cli-anything, laica-workflows, laica-boilerplate, colin |
| laica-lektor | admin-laicadev/laica-launcher | 1 | colin |
| laica-linkedin-produkt-post | admin-laicadev/laica-launcher | 1 | colin |
| laica-tasks | admin-laicadev/laica-launcher | 5 | laica-stack, laica-cli-anything, laica-workflows, laica-boilerplate, colin |
| laica-texter | admin-laicadev/laica-launcher | 1 | colin |
| laica-trigger-dev | admin-laicadev/laica-launcher | 3 | laica-stack, laica-cli-anything, colin |
| laica-twenty | admin-laicadev/laica-launcher | 2 | laica-stack, colin |
| learn | admin-laicadev/laica-launcher | 4 | laica-stack, laica-workflows, laica-boilerplate, colin |
| lemy-brand | timschoch/lemy | 4 | habits, habits-product-management, colin, habits-v2 |
| lemy-setup | timschoch/lemy | 3 | habits-product-management, colin, habits-v2 |
| lemy-write | timschoch/lemy | 4 | habits, habits-product-management, colin, habits-v2 |
| plan-critics | admin-laicadev/laica-launcher | 2 | laica-cli-anything, colin |

### Unclassified (1 skill)

| Skill | Source | # repos | Repos |
|---|---|---|---|
| obsidian-vault | timschoch/mattpocock-skills | 1 | lerni-berni |

Personal note-vault tooling — doesn't fit engineering workflow, marketing, a specific project, or a specific technology cleanly.

## 2. `~/.claude/skills/` symlinks

`ls -la ~/.claude/skills/` shows 38 symlinks (not ~40 as estimated — see note below), all pointing into `/Users/tim/repo/mattpocock-skills/skills/**` except `meco`. Plus 5 non-symlink directories and one `.DS_Store` file that are not part of this list.

| Symlink | Target |
|---|---|
| ask-matt | /Users/tim/repo/mattpocock-skills/skills/engineering/ask-matt |
| claude-handoff | /Users/tim/repo/mattpocock-skills/skills/in-progress/claude-handoff |
| cleanup-merged-branches | /Users/tim/repo/mattpocock-skills/skills/misc/cleanup-merged-branches |
| code-review | /Users/tim/repo/mattpocock-skills/skills/engineering/code-review |
| codebase-design | /Users/tim/repo/mattpocock-skills/skills/engineering/codebase-design |
| diagnosing-bugs | /Users/tim/repo/mattpocock-skills/skills/engineering/diagnosing-bugs |
| domain-modeling | /Users/tim/repo/mattpocock-skills/skills/engineering/domain-modeling |
| git-guardrails-claude-code | /Users/tim/repo/mattpocock-skills/skills/misc/git-guardrails-claude-code |
| grill-me | /Users/tim/repo/mattpocock-skills/skills/productivity/grill-me |
| grill-with-docs | /Users/tim/repo/mattpocock-skills/skills/engineering/grill-with-docs |
| grilling | /Users/tim/repo/mattpocock-skills/skills/productivity/grilling |
| handoff | /Users/tim/repo/mattpocock-skills/skills/productivity/handoff |
| implement | /Users/tim/repo/mattpocock-skills/skills/engineering/implement |
| improve-codebase-architecture | /Users/tim/repo/mattpocock-skills/skills/engineering/improve-codebase-architecture |
| loop-me | /Users/tim/repo/mattpocock-skills/skills/in-progress/loop-me |
| meco | /Users/tim/repo/meco/skills/meco |
| migrate-to-shoehorn | /Users/tim/repo/mattpocock-skills/skills/misc/migrate-to-shoehorn |
| orchestrate | /Users/tim/repo/mattpocock-skills/skills/engineering/orchestrate |
| prototype | /Users/tim/repo/mattpocock-skills/skills/engineering/prototype |
| research | /Users/tim/repo/mattpocock-skills/skills/engineering/research |
| resolving-merge-conflicts | /Users/tim/repo/mattpocock-skills/skills/engineering/resolving-merge-conflicts |
| scaffold-exercises | /Users/tim/repo/mattpocock-skills/skills/misc/scaffold-exercises |
| setup-matt-pocock-skills | /Users/tim/repo/mattpocock-skills/skills/engineering/setup-matt-pocock-skills |
| setup-pre-commit | /Users/tim/repo/mattpocock-skills/skills/misc/setup-pre-commit |
| setup-ts-deep-modules | /Users/tim/repo/mattpocock-skills/skills/in-progress/setup-ts-deep-modules |
| tdd | /Users/tim/repo/mattpocock-skills/skills/engineering/tdd |
| teach | /Users/tim/repo/mattpocock-skills/skills/productivity/teach |
| to-questionnaire | /Users/tim/repo/mattpocock-skills/skills/productivity/to-questionnaire |
| to-spec | /Users/tim/repo/mattpocock-skills/skills/engineering/to-spec |
| to-tickets | /Users/tim/repo/mattpocock-skills/skills/engineering/to-tickets |
| triage | /Users/tim/repo/mattpocock-skills/skills/engineering/triage |
| wait-what | /Users/tim/repo/mattpocock-skills/skills/productivity/wait-what |
| wayfinder | /Users/tim/repo/mattpocock-skills/skills/engineering/wayfinder |
| wizard | /Users/tim/repo/mattpocock-skills/skills/engineering/wizard |
| writing-beats | /Users/tim/repo/mattpocock-skills/skills/in-progress/writing-beats |
| writing-for-agents | /Users/tim/repo/mattpocock-skills/skills/productivity/writing-for-agents |
| writing-fragments | /Users/tim/repo/mattpocock-skills/skills/in-progress/writing-fragments |
| writing-shape | /Users/tim/repo/mattpocock-skills/skills/in-progress/writing-shape |

Non-symlink entries in `~/.claude/skills/` (excluded from the table above, listed for completeness): `_bkp/` (directory, 76 items, dated Mar 5 — old backup, predates the symlink migration), `find-docs/` (directory), `laica-launcher/` (directory), `lean-ctx/` (directory), `superset/` (directory), `.DS_Store`.

## 3. Drifted `.agents/skills/` dirs (present, no lock entry)

Computed as `.agents/skills/<name>/` present but `<name>` absent from that repo's `skills-lock.json`, across all 15 repos with a lock file. 10 repos have zero drift (`laica-stack`, `casaarca.com`, `skilly`, `laica-workflows`, `laica-boilerplate`, `habits`, `lerni-berni`, `blogy`, `meco` — plus `laica-launcher` below is a special case). 5 repos have drift matching the handoff's expectations:

### colin — 37 drifted

`ab-testing`, `ad-creative`, `ads`, `analytics`, `aso`, `co-marketing`, `cold-email`, `colin_pre-push-code-and-security-review`, `colin-event-bus`, `colin-research-target`, `community-marketing`, `competitors`, `create-knowledge-page`, `keyword-research`, `laica-analytics-dev`, `laica-analytics-planner`, `laica-become-affiliate`, `laica-check-anforderungen`, `laica-component-styling`, `laica-design-audit`, `laica-design-tokens`, `laica-doc-audit`, `laica-experiment-audit`, `laica-frontend-dev`, `laica-product-owner`, `laica-vorhaben-build-component`, `laica-vorhaben-page-erstellen`, `payload`, `payload-admin-components`, `payload-migration`, `test-driven-development`, `vercel-composition-patterns`, `vercel-react-best-practices`, `web-design-guidelines`, `wissen-create-comparison`, `wissen-create-instruction`, `wissen-shared`

### habits-product-management — 22 drifted

`churn-prevention`, `community-marketing`, `competitor-profiling`, `competitors`, `content-strategy`, `copy-editing`, `copywriting`, `cro`, `customer-research`, `launch`, `lead-magnets`, `marketing-council`, `marketing-ideas`, `marketing-loops`, `marketing-plan`, `marketing-psychology`, `onboarding`, `product-marketing`, `prospecting`, `referrals`, `seo-audit`, `signup`

### habits-v2 — 10 drifted

`habits-1-3-1`, `habits-brand-voice`, `habits-cleanup-merged-branches`, `habits-code-and-docs-review`, `habits-design-system`, `habits-distill-context`, `habits-implement-vertical-slice`, `habits-jtbd`, `habits-local-dev`, `habits-term-check`

### lemyvoce — 2 drifted

`lemy-admin`, `term-check`

### laica-cli-anything — 1 drifted

`learn`

### laica-launcher — false-positive check, and 1 genuine drift

`laica-launcher`'s own `.agents/skills/` (`laica-linkedin-produkt-post`, `skill-creator`) is **not** the same drift pattern as the repos above: this repo intentionally keeps published skills in `skills/` (what other repos pin from `admin-laicadev/laica-launcher`) and internal/maintenance-only skills in `.agents/skills/`. `skill-creator` is locked in its own `skills-lock.json` (`anthropics/skills` source), so it is not drift. `laica-linkedin-produkt-post` is the one genuine gap — present in `.agents/skills/`, absent from `skills-lock.json` — but it is an internal tool for this repo, not a candidate bundle skill exposed to consumers, so it shouldn't be pooled with colin/habits-pm/habits-v2/lemyvoce's drift when sizing bundle work.
