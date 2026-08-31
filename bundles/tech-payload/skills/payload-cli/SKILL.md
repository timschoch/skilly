---
name: payload-cli
description: Run Payload migrations and type generation with the payload CLI. Use after changing Payload collections or fields, or to run/check migrations. Not for content edits or raw SQL.
---

# Payload CLI

Payload ships its own CLI (run via the repo's package scripts). Schema work goes through it, never through raw SQL.

- Create a migration after schema changes: `payload migrate:create`
- Run migrations: `payload migrate`
- Check migration status: `payload migrate:status`
- Regenerate TS types after collection changes: `payload generate:types`
- Discover more: `payload --help`

Check the repo's package.json — these are usually wrapped in npm scripts.
