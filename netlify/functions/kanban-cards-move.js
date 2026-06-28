import { getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';
import { CORS } from './_notion.js';

const ok = (body) => ({ statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const err = (msg, code = 500) => ({ statusCode: code, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) });

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const user = await getUser(event);
  if (!user) return err('Unauthorized', 401);

  const { cardId, laneId, position } = JSON.parse(event.body || '{}');
  if (!cardId || !laneId) return err('cardId and laneId required', 400);

  try {
    const sb = getSupabase();
    const { data, error } = await sb.from('kanban_cards').update({
      lane_id: laneId,
      position: position || 0,
      updated_at: new Date().toISOString(),
    }).eq('id', cardId).select().single();
    if (error) throw error;
    return ok(data);
  } catch (e) {
    return err(e.message);
  }
}
