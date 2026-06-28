import { getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';
import { CORS } from './_notion.js';

const ok = (body) => ({ statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const err = (msg, code = 500) => ({ statusCode: code, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) });

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const user = await getUser(event);
  if (!user) return err('Unauthorized', 401);

  const { id } = JSON.parse(event.body || '{}');
  if (!id) return err('id required', 400);

  try {
    const sb = getSupabase();
    const { error } = await sb.from('kanban_lanes').delete().eq('id', id);
    if (error) throw error;
    return ok({ ok: true });
  } catch (e) {
    return err(e.message);
  }
}
