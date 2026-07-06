// Shared notification helpers for the scheduled digests (2026-07 audit §7):
// email via the shared Gmail system account, and OPTIONAL WhatsApp via
// Twilio's WhatsApp API (enabled only when the TWILIO_* env vars are set).
//
// Env vars:
//   REMINDER_EMAILS        — comma-separated recipients (default tanner@onevibemediagroup.com)
//   GMAIL_SENDER           — shared outbound identity (already used by send-email)
//   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM  — optional
//   TWILIO_WHATSAPP_TO     — comma-separated numbers, e.g. +15551234567 (optional)
import { gmail } from './_gmail.js';

export function recipients() {
  return (process.env.REMINDER_EMAILS || 'tanner@onevibemediagroup.com')
    .split(',').map(s => s.trim()).filter(Boolean);
}

export async function sendHtmlEmail({ to, subject, html }) {
  const fromAddr = process.env.GMAIL_SENDER || 'nathan@onevibemediagroup.com';
  const raw = Buffer.from([
    'MIME-Version: 1.0',
    `To: ${Array.isArray(to) ? to.join(', ') : to}`,
    `From: ${fromAddr}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
  ].join('\r\n')).toString('base64url');
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
}

// WhatsApp via Twilio — silently skipped unless fully configured.
export async function sendWhatsApp(bodyText) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_WHATSAPP_FROM;   // e.g. +14155238886 (Twilio sandbox or approved sender)
  const tos   = (process.env.TWILIO_WHATSAPP_TO || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!sid || !token || !from || !tos.length) return { skipped: true };

  const results = [];
  for (const to of tos) {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: `whatsapp:${from}`,
        To:   `whatsapp:${to}`,
        Body: bodyText.slice(0, 1500),
      }),
    });
    results.push({ to, ok: res.ok });
    if (!res.ok) console.warn('Twilio WhatsApp send failed:', to, await res.text().catch(() => ''));
  }
  return { skipped: false, results };
}

// Scheduled-invocation guard shared by the digest functions.
export function isScheduledOrSecret(event) {
  if (process.env.POLL_SECRET && event.headers?.['x-poll-secret'] === process.env.POLL_SECRET) return true;
  try { if (JSON.parse(event.body || '{}').next_run) return true; } catch { /* not scheduled */ }
  return false;
}
