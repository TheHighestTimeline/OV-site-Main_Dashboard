// posts-update — forwards to Supabase (same as posts-upsert with an id).
// Social.jsx calls this endpoint directly to update post status etc.
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';
import { getSupabase } from './_supabase.js';

const VALID_STATUSES = new Set(['draft','pending_review','approved','rejected','scheduled','posted']);

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const unauth = await requireAuth(event); if (unauth) return unauth;

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return err(400, 'Invalid JSON'); }
  if (!body.id) return err(400, 'id required');
  if (body.status && !VALID_STATUSES.has(body.status)) return err(400, `Invalid status: ${body.status}`);

  try {
    const supabase = getSupabase();
    const payload  = {};
    if (body.status       !== undefined) payload.status       = body.status;
    if (body.caption      !== undefined) payload.caption      = body.caption;
    if (body.hashtags     !== undefined) payload.hashtags     = body.hashtags;
    if (body.scheduled_at !== undefined) payload.scheduled_at = body.scheduled_at;
    if (body.media_urls   !== undefined) payload.media_urls   = body.media_urls;
    if (body.tags         !== undefined) payload.tags         = body.tags;

    const { data, error } = await supabase.from('posts').update(payload).eq('id', body.id).select().single();
    if (error) throw error;
    return ok({ id: data.id, ...data });
  } catch (e) {
    console.error('[posts-update]', e.message);
    return err(500, e.message);
  }
};
