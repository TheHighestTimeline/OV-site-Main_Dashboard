import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

// V2: upload to Google Drive (or Supabase Storage) and return a public URL.
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const unauth = await requireAuth(event); if (unauth) return unauth;
  return ok({ url: '', notice: 'Media upload not yet wired — connect Drive integration in v2.' });
};
