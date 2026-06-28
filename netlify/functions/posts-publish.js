import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';

// V2: publish to actual platforms (IG Graph, FB Graph, TikTok, YT Shorts, LinkedIn).
// For now we flip status to 'posted' and return a stub URL so the UI flow works end-to-end.
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const unauth = await requireAuth(event); if (unauth) return unauth;
  let body; try { body = JSON.parse(event.body || '{}'); } catch { return err(400, 'Invalid JSON'); }
  return ok({ id: body.post_id, externalId: 'stub_' + Date.now(), url: '', publishedAt: new Date().toISOString(), notice: 'Publish adapters not yet wired — post marked as posted locally.' });
};
