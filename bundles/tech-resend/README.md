# tech-resend

Official `resend/resend-skills` core + hub `setup-resend` (our conventions for the shared pre-launch domain, plus the usual `mail.ts` / `inbound.ts`). Keep minimal.

Left out (2026-10-01):

- `email-best-practices` — deliverability, compliance, marketing mail. Pre-launch apps send auth and notification mail only. Add when an app sends marketing mail.
- `react-email` — HTML templates with React. The usual `mail.ts` sends text or plain HTML. Add when an app needs designed templates.
