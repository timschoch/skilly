# Skilly

Personal skill hub: bundle definitions, a CLI wrapper around the skills CLI, and sync workflows that keep way-of-working skills fresh in every consumer repo.

## Language

**Hub**:
This repo. Holds bundle definitions, the skilly CLI, and sync workflows. May also ship skills of its own.
_Avoid_: Registry, launcher

**Skill**:
A directory with a `SKILL.md`, installable by the skills CLI. Lives in its source repo, not (usually) in the hub.

**Source**:
A repo that holds skills — the user's own or third-party. The hub points at sources; it does not own them.
_Avoid_: Upstream, origin

**Bundle**:
A named, categorized group of skills across sources, defined as config data in the hub. Drives install and removal only — never update.
_Avoid_: Preset, collection, group

**Consumer**:
A repo that installs bundles and runs the nightly sync.
_Avoid_: Client, target repo

**Pin**:
One entry in a consumer's `skills-lock.json`, recording a skill and its real source. Owned by the skills CLI, not by skilly.

**Add**:
Adding a new skill or bundle to the repo.
_Avoid_: install, setup

**Remove**:
Removing a skill or bundle from the repo.
_Avoid_: delete

**Update**:
Update skills to latest versions.
_Avoid_: upgrade, sync

**Setup**:
Setting up the repo to work with Skilly, our workflow or a tech stack.
_Avoid_: install, config, onboard

**Sync PR**:
The pull request the nightly workflow opens in a consumer after `skills update`.

**PR gate**:
Checks on a sync PR that block merge when the consumer breaks its rules.

**Rule**:
A named workflow requirement attached to a bundle (e.g. conventional commits). A consumer enforces the union of the rules of all its bundles, via the PR gate.
_Avoid_: Check, policy

**Router rule**:
An always-loaded line that tells the agent "when <trigger> → read <skill file> in full and apply it". Ships skills the agent may not invoke (`disable-model-invocation`) without forking them. Ships with its skill, named `{skill-name}-{rule-name}`; installed and removed wholesale by the rules script, never diffed.
_Avoid_: Rule (that's the PR-gate concept), principle
