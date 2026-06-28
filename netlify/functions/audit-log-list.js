// audit-log-list — Phase 14, admin only.
// Lists recent rows from audit_log for the Admin tab.
//
// GET /.netlify/functions/audit-log-list?limit=50&action=role.change
import { ok, err, CORS } from './_notion.js';
import { requireAdmin } from './_auth.js';
import { getSupabase } from './_supabase.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireAdmin(event);
  if (authErr) return authErr;

  const q   = event.queryStringParameters || {};
  const lim = Math.min(500, Math.max(1, Number(q.limit) || 100));

  try {
    const supabase = getSupabase();
    let query = supabase.from('audit_log').select('*').order('occurred_at', { ascending: false }).limit(lim);
    if (q.action) query = query.eq('action', q.action);
    if (q.actor)  query = query.eq('actor_user_id', q.actor);
    if (q.target) query = query.eq('target_user_id', q.target);
    const { data, error } = await query;
    if (error) throw error;
    return ok({ entries: data || [] });
  } catch (e) {
    console.error('[audit-log-list]', e.message);
    return err(500, e.message);
  }
};
