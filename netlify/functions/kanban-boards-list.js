import { getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';
import { CORS } from './_notion.js';

const ok = (body) => ({ statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const err = (msg, code = 500) => ({ statusCode: code, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) });

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const user = await getUser(event);
  if (!user) return err('Unauthorized', 401);

  const scope = event.queryStringParameters?.scope;
  try {
    const sb = getSupabase();
    let query = sb.from('kanban_boards').select('*, kanban_lanes(*)');
    if (scope) query = query.eq('scope', scope);
    const { data, error } = await query.order('created_at', { ascending: true });
    if (error) throw error;
    return ok({ boards: data || [] });
  } catch (e) {
    return err(e.message);
  }
}
