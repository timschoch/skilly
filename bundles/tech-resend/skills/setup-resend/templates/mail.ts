// Single entry point for all mail in this repo. Addresses come from resend.json.
import { Resend } from 'resend';
import config from '../resend.json'; // adjust to the repo root

export type MailAddress = (typeof config.addresses)[number];

let client: Resend | undefined;

// Lazy, so a build without RESEND_API_KEY does not throw on import.
export function getResend(): Resend {
  client ??= new Resend();
  return client;
}

export function getAddress(name = 'default'): MailAddress {
  const address = config.addresses.find((candidate) => candidate.name === name);
  if (!address) throw new Error(`Unknown mail address "${name}" (see resend.json)`);
  return address;
}

/** The address entry if `recipient` is one of this repo's inbound addresses. */
export function findInboundAddress(recipient: string): MailAddress | undefined {
  const normalized = parseAddress(recipient);
  return config.addresses.find((candidate) => candidate.inbound && candidate.address.toLowerCase() === normalized);
}

/** "Name <foo@bar.com>" -> "foo@bar.com" */
export function parseAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

type Mail = {
  to: string | string[];
  subject: string;
  /** Address name from resend.json. */
  from?: string;
  replyTo?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  headers?: Record<string, string>;
  /** Stops duplicates on retries, e.g. `reset-password/${user.id}/${token}`. */
  idempotencyKey?: string;
} & ({ text: string; html?: string } | { html: string; text?: string });

export async function sendMail({ from, idempotencyKey, ...mail }: Mail) {
  const sender = getAddress(from);

  const { data, error } = await getResend().emails.send(
    {
      ...mail,
      from: `${sender.displayName} <${sender.address}>`,
      // Replies go back to the sender address, so an inbound address receives them.
      replyTo: mail.replyTo ?? sender.address,
    },
    idempotencyKey ? { idempotencyKey } : undefined,
  );

  if (error) throw new Error(`Mail send failed (${error.name}): ${error.message}`);
  return data;
}
