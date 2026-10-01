---
name: setup-resend
description: Our Resend conventions for a pre-launch app - the shared domain, address naming, one API key per repo, resend.json, the usual mail.ts and inbound.ts. Use when a repo needs to send or receive mail, when adding or changing a mail address, or when moving a repo to its own domain at launch.
---

# Setup Resend

Pre-launch apps share one Resend account and one domain, `apps.timschoch.com`. This skill holds our conventions only. Code and commands beyond the templates come from the vendor skills: `resend` (SDK), `resend-cli` (every `resend` command), `agent-email-inbox` (when inbound mail triggers actions).

## Conventions

- **Record**: `resend.json` at the repo root, committed. Read it first and reuse what it records.
- **Default address**: `<repo>@apps.timschoch.com`. `<repo>` is the repository name from the git remote, lowercased, `a-z0-9-` only.
- **More addresses**: `<name>.<repo>@apps.timschoch.com`, one per concrete reason, the reason written in `purpose`.
- **API key**: one per repo, named `<repo>`.
- **Secrets**: `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET`, in `.env.local` and the hosting env. `resend.json` holds ids, never secrets.
- **Admin key**: creating keys and webhooks needs a full-access key. Ask the user to export it in the shell for this session. It stays out of the repo and out of `.env.local`.

## Steps

1. Check the shared domain: `resend domains list` shows `apps.timschoch.com` verified, sending and receiving on. Missing or unverified: stop and tell the user. The domain is set up once by hand, for all repos.
2. Copy [templates/resend.json](templates/resend.json) to the repo root. Fill in the addresses. Set `"inbound": true` only on an address the app must react to.
3. Create the API key, then record its name, id and permission in `resend.json`:
   - Send only: `sending_access`, scoped to the domain id of `apps.timschoch.com`.
   - Any inbound address: `full_access`. Resend has no narrower permission that reads received mail. Tell the user this key can manage the whole account, for every repo.
4. Copy [templates/mail.ts](templates/mail.ts) into the repo's lib folder and fix the import path to `resend.json`. All mail goes through `sendMail()`; pick the sender by address name: `sendMail({ from: 'notifications', ... })`.
5. Inbound only:
   1. Copy [templates/inbound.ts](templates/inbound.ts) next to `mail.ts`. Put the app's logic in `handleMail()`.
   2. Add a POST route at `/api/mail/inbound` that hands the request to `handleInboundRequest`:

      ```ts
      // Next.js: app/api/mail/inbound/route.ts
      export { handleInboundRequest as POST } from '@/lib/inbound';
      ```

      ```ts
      // TanStack Start: src/routes/api/mail/inbound.ts
      export const Route = createFileRoute('/api/mail/inbound')({
        server: { handlers: { POST: ({ request }) => handleInboundRequest(request) } },
      });
      ```

   3. Create a webhook for `email.received` on the production URL. Preview URLs change. Save its signing secret as `RESEND_WEBHOOK_SECRET` and record id and endpoint in `resend.json`.
6. Prove it: send one mail from the default address to the user and confirm it arrives. Inbound: mail the inbound address and see `handleMail()` run; mail an address of another repo and see `ignored` with status 200.

## Shared account

- **Webhooks are account-wide.** Every `email.received` webhook gets the inbound mail of every repo on the domain. `inbound.ts` drops mail for other repos with 200. Keep that check.
- **Quota**: the free plan's 3,000 mails per month and 100 per day count across all repos. On a quota error, tell the user.
- **Retention**: received mail stays 30 days on the free plan. Store what the app needs in its own database.

## Launch

The shared domain is for pre-launch only. At launch:

1. Add the app's own domain in Resend.
2. Update `domain` and every address in `resend.json`.
3. Create a new key for the new domain, swap `RESEND_API_KEY`, delete the old key.
