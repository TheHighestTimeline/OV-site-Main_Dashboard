// Lists threads for a Gmail label with subject/sender metadata.
import { gmail, getHeader } from './_gmail.js';
import { requireAuth } from './_auth.js';
import { CORS, ok, err } from './_notion.js';

export const handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  const { labelId = 'INBOX', pageToken, q } = event.queryStringParameters || {};

  try {
    // 1. Get thread IDs for this label
    const listRes = await gmail.users.threads.list({
      userId:    'me',
      labelIds:  [labelId],
      maxResults: 25,
      ...(pageToken ? { pageToken } : {}),
      ...(q         ? { q }         : {}),
    });

    const threadStubs = listRes.data.threads || [];

    // 2. Fetch metadata for each thread in parallel (lightweight — headers only)
    const threads = await Promise.all(threadStubs.map(async stub => {
      try {
        const res      = await gmail.users.threads.get({
          userId:          'me',
          id:              stub.id,
          format:          'metadata',
          metadataHeaders: ['Subject', 'From', 'To', 'Date'],
        });
        const messages = res.data.messages || [];
        const first    = messages[0];
        const last     = messages[messages.length - 1];
        const fh       = first?.payload?.headers || [];
        const lh       = last?.payload?.headers  || [];

        return {
          id:           stub.id,
          snippet:      last?.snippet || stub.snippet || '',
          subject:      getHeader(fh, 'Subject') || '(no subject)',
          from:         getHeader(fh, 'From'),
          lastFrom:     getHeader(lh, 'From'),
          date:         getHeader(lh, 'Date'),
          internalDate: last?.internalDate,
          messageCount: messages.length,
          unread:       (last?.labelIds || []).includes('UNREAD'),
          labelIds:     last?.labelIds || [],
        };
      } catch {
        // If metadata fetch fails for one thread, return minimal stub
        return { id: stub.id, snippet: stub.snippet || '', subject: '(no subject)', from: '', unread: false, messageCount: 1 };
      }
    }));

    return ok({
      threads,
      nextPageToken: listRes.data.nextPageToken || null,
    });
  } catch (e) {
    console.error('email-threads error:', e);
    return err(500, e.message);
  }
};
