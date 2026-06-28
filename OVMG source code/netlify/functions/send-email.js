// Sends an email via Gmail API. Supports new messages and threaded replies.
// Open to all authenticated users — sends as nathan@onevibemediagroup.com,
// with X-Sent-By header tracking which team member actually sent it.
import { gmail } from './_gmail.js';
import { requireAuth, getUser } from './_auth.js';
import { CORS, ok, err } from './_notion.js';

// Email always sends from the SHARED system account (env GMAIL_REFRESH_TOKEN /
// GMAIL_SENDER — e.g. nathan@onevibemediagroup.com), NOT a user's personally
// connected Google account. That keeps the email composer locked to one shared
// outbound identity for everyone with access — connecting personal/calendar
// Gmails never exposes them in the email tool.
function buildRaw({ to, subject, body, attachmentName, attachmentBase64, threadId, inReplyTo, references, sentBy }) {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const fromAddr = process.env.GMAIL_SENDER || 'nathan@onevibemediagroup.com';

  const lines = [
    'MIME-Version: 1.0',
    `To: ${to}`,
    `From: ${fromAddr}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    ...(inReplyTo  ? [`In-Reply-To: ${inReplyTo}`]           : []),
    ...(references ? [`References: ${references} ${inReplyTo || ''}`.trim()] : []),
    ...(sentBy     ? [`X-Sent-By: ${sentBy}`]               : []),
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    body || '',
    '',
  ];

  if (attachmentName && attachmentBase64) {
    lines.push(
      `--${boundary}`,
      `Content-Type: text/html; name="${attachmentName}"`,
      `Content-Disposition: attachment; filename="${attachmentName}"`,
      'Content-Transfer-Encoding: base64',
      '',
      attachmentBase64,
      '',
    );
  }

  lines.push(`--${boundary}--`);
  return Buffer.from(lines.join('\r\n')).toString('base64url');
}

export const handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  // Any authenticated user can send — all mail goes as nathan@onevibemediagroup.com
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const user   = await getUser(event);
    const sentBy = user
      ? `${user.user_metadata?.full_name || ''} <${user.email}>`.trim()
      : '';

    const {
      to, subject, body,
      attachmentName, attachmentBase64,
      threadId, inReplyTo, references,
    } = JSON.parse(event.body || '{}');

    if (!to)      return err(400, 'to is required');
    if (!subject) return err(400, 'subject is required');

    const raw    = buildRaw({ to, subject, body, attachmentName, attachmentBase64, threadId, inReplyTo, references, sentBy });
    const result = await gmail.users.messages.send({
      userId:      'me',
      requestBody: {
        raw,
        ...(threadId ? { threadId } : {}),
      },
    });

    return ok({ messageId: result.data.id, threadId: result.data.threadId });
  } catch (e) {
    console.error('send-email error:', e);
    return err(500, e.message);
  }
};
