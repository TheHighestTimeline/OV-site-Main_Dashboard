// List call reviews (Review page + nav badge). ?status=pending&countOnly=1
import { getSupabase } from './_supabase.js';
import { requireRole } from './_auth.js';
import { ok, err, CORS } from './_http.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const gate = await requireRole(event, ['admin', 'executive', 'operations', 'senior_partner']);
  if (gate) return gate;

  try {
    const params = event.queryStringParameters || {};
    const status = params.status || 'pending';
    const sb = getSupabase();

    if (params.countOnly) {
      const { count, error } = await sb
        .from('call_reviews')
        .select('id', { count: 'exact', head: true })
        .eq('status', status);
      if (error) throw error;
      return ok({ count: count || 0 });
    }

    let q = sb.from('call_reviews')
      .select('id, source, external_id, title, call_date, attendees, summary, transcript, proposed_actions, status, applied_actions, error, reviewed_by, reviewed_at, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (status !== 'all') q = q.eq('status', status);

    const { data, error } = await q;
    if (error) throw error;
    return ok(data || []);
  } catch (e) {
    console.error('reviews-list error:', e);
    return err(500, e.message);
  }
};
