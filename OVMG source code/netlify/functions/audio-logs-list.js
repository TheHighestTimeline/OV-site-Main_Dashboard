// audio-logs-list — GET: list audio_log rows from Supabase.
// Query params: kind ('senior_partner' | 'employee'), limit
// Auth required. Admin required to see senior_partner logs.
import { ok, err, CORS } from './_notion.js';
import { getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const user = await getUser(event);
  if (!user) return { statusCode: 401, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unauthorized' }) };

  const q    = event.queryStringParameters || {};
  const kind = q.kind || null;
  const lim  = Math.min(200, Math.max(1, Number(q.limit) || 50));

  // Non-admins can only see their own logs
  const isOvmg  = user.email.endsWith('@onevibemediagroup.com');
  const isAdmin = isOvmg || user.roles.includes('admin') || user.role === 'admin';

  try {
    const supabase = getSupabase();
    let query = supabase
      .from('audio_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(lim);

    if (kind) query = query.eq('kind', kind);

    // Non-admins: only see their own records
    if (!isAdmin) query = query.eq('user_id', user.id);

    const { data, error } = await query;
    if (error) throw error;
    return ok({ logs: data || [] });
  } catch (e) {
    console.error('[audio-logs-list]', e.message);
    return err(500, e.message);
  }
};
