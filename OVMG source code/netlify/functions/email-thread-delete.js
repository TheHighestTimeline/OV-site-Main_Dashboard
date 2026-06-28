// Delete a Gmail thread.
// hard=false (default) → move to TRASH (recoverable for 30 days)
// hard=true → permanently delete (unrecoverable — use with caution)
// Body: { id, hard? }
import { gmail } from './_gmail.js';
import { requireAuth } from './_auth.js';
import { CORS, ok, err } from './_notion.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const { id, hard = false } = JSON.parse(event.body || '{}');
    if (!id) return err(400, 'id required');

    if (hard) {
      // Permanently delete — requires gmail.modify scope
      await gmail.users.threads.delete({ userId: 'me', id });
    } else {
      // Soft delete — moves to TRASH, recoverable from Gmail
      await gmail.users.threads.trash({ userId: 'me', id });
    }

    return ok({ ok: true });
  } catch (e) {
    console.error('email-thread-delete error:', e);
    return err(500, e.message);
  }
};
