# tech-shopify

Shopify's official `shopify` skill (Shopify/Shopify-AI-Toolkit): one skill for every Shopify developer surface — Liquid themes, Admin/Storefront GraphQL, ShopifyQL, Functions, Custom Data (metafields/metaobjects), Shopify CLI. Its references load per topic, so one skill stays small in context. It searches shopify.dev and validates generated code through its bundled `scripts/*.mjs` (Node.js required) and reports usage back to Shopify (`log_feedback.mjs`, `log_skill_use.mjs`).

Left out (2026-10-05):

- `ucp` — buyer-side UCP CLI (find, compare, buy products across merchants); not merchant work.
- The repo's `deprecated/` per-surface skills (`shopify-admin`, `shopify-liquid`, …) — replaced upstream by the single `shopify` skill.
