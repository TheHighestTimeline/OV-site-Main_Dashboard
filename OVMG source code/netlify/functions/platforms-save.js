import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

// V2: encrypt credentials and persist to Supabase. For now: 200 OK no-op.
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const unauth = await requireAuth(event); if (unauth) return unauth;
  return ok({ saved: false, notice: 'Credential storage not yet wired (needs Supabase + encryption key).' });
};
