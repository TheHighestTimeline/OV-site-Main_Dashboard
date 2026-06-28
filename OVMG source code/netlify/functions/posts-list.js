// posts-list — Phase 12. Lists posts for a client, optionally filtered.
import { ok, err, CORS } from './_notion.js';
import { requireAuth } from './_auth.js';
import { getSupabase } from './_supabase.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const unauth = await requireAuth(event); if (unauth) return unauth;

  const p = event.queryStringParameters || {};
  if (!p.client_id) return err(400, 'client_id required');

  try {
    const supabase = getSupabase();
    let q = supabase.from('posts').select('*').eq('client_id', p.client_id);
    if (p.status)   q = q.eq('status', p.status);
    if (p.platform) q = q.eq('platform', p.platform);
    q = q.order('scheduled_at', { ascending: true, nullsFirst: false }).limit(500);
    const { data, error } = await q;
    if (error) throw error;
    return ok({ posts: data || [] });
  } catch (e) {
    console.error('[posts-list]', e.message);
    return err(500, e.message);
  }
};
