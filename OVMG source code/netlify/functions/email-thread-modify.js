// Modify a Gmail thread's labels (move to folder, mark read/unread, star, etc.).
// Body: { id, addLabelIds?, removeLabelIds? }
import { gmail } from './_gmail.js';
import { requireAuth } from './_auth.js';
import { CORS, ok, err } from './_notion.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const { id, addLabelIds = [], removeLabelIds = [] } = JSON.parse(event.body || '{}');
    if (!id) return err(400, 'id required');

    await gmail.users.threads.modify({
      userId: 'me',
      id,
      requestBody: { addLabelIds, removeLabelIds },
    });

    return ok({ ok: true });
  } catch (e) {
    console.error('email-thread-modify error:', e);
    return err(500, e.message);
  }
};
