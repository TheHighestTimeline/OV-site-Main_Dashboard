// posts-create — forwards to Supabase (same as posts-upsert).
// Social.jsx calls this endpoint directly for new posts.
import { ok, err, CORS } from './_notion.js';
import { requireAuth, getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';

const VALID_PLATFORMS = new Set(['instagram','tiktok','facebook','youtube','threads']);
const VALID_TYPES     = new Set(['photo','video','carousel','reel','short']);
const VALID_STATUSES  = new Set(['draft','pending_review','approved','rejected','scheduled','posted']);

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const unauth = await requireAuth(event); if (unauth) return unauth;

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return err(400, 'Invalid JSON'); }
  if (!body.client_id) return err(400, 'client_id required');
  if (body.platform && !VALID_PLATFORMS.has(body.platform)) return err(400, `Invalid platform: ${body.platform}`);
  if (body.type     && !VALID_TYPES.has(body.type))         return err(400, `Invalid type: ${body.type}`);
  if (body.status   && !VALID_STATUSES.has(body.status))    return err(400, `Invalid status: ${body.status}`);

  try {
    const user     = await getUser(event);
    const supabase = getSupabase();
    const payload  = {
      client_id:    body.client_id,
      platform:     body.platform     || 'instagram',
      caption:      body.caption      || '',
      hashtags:     body.hashtags     || '',
      type:         body.type         || 'photo',
      media_urls:   Array.isArray(body.media_urls) ? body.media_urls : [],
      scheduled_at: body.scheduled_at || null,
      status:       body.status       || 'draft',
      quality_score: body.quality_score ?? null,
      tags:         Array.isArray(body.tags) ? body.tags : [],
      ai_generated: !!body.ai_generated,
      created_by_user_id: user?.id || '',
    };
    const { data, error } = await supabase.from('posts').insert(payload).select().single();
    if (error) throw error;
    return ok({ id: data.id, ...data });
  } catch (e) {
    console.error('[posts-create]', e.message);
    return err(500, e.message);
  }
};
