// Returns Gmail labels (folders) for the sidebar.
import { gmail } from './_gmail.js';
import { requireAuth } from './_auth.js';
import { CORS, ok, err } from './_notion.js';

// Labels to always show first, in this order
const PINNED = ['INBOX', 'SENT', 'DRAFTS', 'STARRED', 'SPAM', 'TRASH'];

export const handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const res    = await gmail.users.labels.list({ userId: 'me' });
    const raw    = res.data.labels || [];

    // Split pinned system labels from user labels
    const pinned = PINNED
      .map(id => raw.find(l => l.id === id))
      .filter(Boolean);

    const userLabels = raw
      .filter(l => l.type === 'user')
      .sort((a, b) => a.name.localeCompare(b.name));

    const labels = [...pinned, ...userLabels].map(l => ({
      id:              l.id,
      name:            l.name,
      type:            l.type,
      messagesUnread:  l.messagesUnread  || 0,
      messagesTotal:   l.messagesTotal   || 0,
    }));

    return ok(labels);
  } catch (e) {
    console.error('email-labels error:', e);
    return err(500, e.message);
  }
};
