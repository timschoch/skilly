// Resend inbound webhook (event: email.received). Web Request in, Response out,
// so any framework's POST route can call it.
// Webhooks are account-wide: this endpoint receives the inbound mail of every
// repo on the shared domain. Mail for another repo is ignored with 200.
import type { GetReceivingEmailResponseSuccess } from 'resend';
import { findInboundAddress, getResend, type MailAddress } from './mail';

export async function handleInboundRequest(request: Request): Promise<Response> {
  // Raw body: parsing and re-stringifying the JSON breaks the signature.
  const payload = await request.text();

  const id = request.headers.get('svix-id');
  const timestamp = request.headers.get('svix-timestamp');
  const signature = request.headers.get('svix-signature');
  if (!id || !timestamp || !signature) return new Response('Missing signature headers', { status: 400 });

  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('RESEND_WEBHOOK_SECRET is not set');
    return new Response('Server misconfigured', { status: 500 });
  }

  const resend = getResend();

  let event;
  try {
    event = resend.webhooks.verify({ payload, headers: { id, timestamp, signature }, webhookSecret });
  } catch {
    return new Response('Invalid signature', { status: 401 });
  }

  if (event.type !== 'email.received') return Response.json({ ignored: 'event type' });

  const { email_id: emailId, to, cc, received_for: receivedFor } = event.data;
  const address = [...(receivedFor ?? []), ...(to ?? []), ...(cc ?? [])].map(findInboundAddress).find(Boolean);
  if (!address) return Response.json({ ignored: 'not addressed to this repo' });

  // The webhook carries metadata only. A non-200 answer makes Resend retry.
  const { data: email, error } = await resend.emails.receiving.get(emailId);
  if (error || !email) {
    console.error('Failed to fetch received email', error);
    return new Response('Fetch failed', { status: 500 });
  }

  try {
    await handleMail(address, email);
  } catch (error) {
    console.error('Inbound handler failed', error);
    return new Response('Handler failed', { status: 500 });
  }

  return Response.json({ ok: true });
}

// App logic goes here, keyed by address name. Keep it fast; enqueue long work.
// Must be idempotent: Resend delivers a webhook at least once.
// Attachments: getResend().emails.receiving.attachments.list({ emailId: email.id })
async function handleMail(address: MailAddress, email: GetReceivingEmailResponseSuccess) {
  switch (address.name) {
    default:
      console.log(`Inbound mail for ${address.address} from ${email.from}: ${email.subject}`);
  }
}
