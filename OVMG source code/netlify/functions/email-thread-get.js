// Fetches a full Gmail thread with all message bodies. Marks thread as read.
import { gmail, extractBody, getHeader } from './_gmail.js';
import { requireAuth } from './_auth.js';
import { CORS, ok, err } from './_notion.js';

// Walk the MIME payload tree and collect attachment parts.
function extractAttachments(payload, messageId, result = []) {
  if (!payload) return result;
  const { parts = [], mimeType, body, filename } = payload;
  // A part is an attachment if it has a filename and a body with data or attachmentId
  if (filename && body && (body.data || body.attachmentId)) {
    result.push({
      filename,
      mimeType,
      size: body.size || 0,
      attachmentId: body.attachmentId || null,
      // Inline small attachments (data URI available immediately)
      data: body.data ? body.data.replace(/-/g, '+').replace(/_/g, '/') : null,
    });
  }
  parts.forEach(p => extractAttachments(p, messageId, result));
  return result;
}

export const handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  const { id } = event.queryStringParameters || {};
  if (!id) return err(400, 'thread id required');

  try {
    // Fetch full thread
    const res      = await gmail.users.threads.get({ userId: 'me', id, format: 'full' });
    const messages = (res.data.messages || []).map(msg => {
      const headers = msg.payload?.headers || [];
      return {
        id:           msg.id,
        threadId:     msg.threadId,
        from:         getHeader(headers, 'From'),
        to:           getHeader(headers, 'To'),
        cc:           getHeader(headers, 'Cc'),
        subject:      getHeader(headers, 'Subject'),
        date:         getHeader(headers, 'Date'),
        internalDate: msg.internalDate,
        messageId:    getHeader(headers, 'Message-ID'),
        references:   getHeader(headers, 'References'),
        body:         extractBody(msg.payload),
        snippet:      msg.snippet || '',
        labelIds:     msg.labelIds || [],
        unread:       (msg.labelIds || []).includes('UNREAD'),
        attachments:  extractAttachments(msg.payload, msg.id),
      };
    });

    // Mark thread as read (best-effort — don't fail the response if this errors)
    gmail.users.threads.modify({
      userId: 'me', id,
      requestBody: { removeLabelIds: ['UNREAD'] },
    }).catch(() => {});

    return ok({ id, messages });
  } catch (e) {
    console.error('email-thread-get error:', e);
    return err(500, e.message);
  }
};
