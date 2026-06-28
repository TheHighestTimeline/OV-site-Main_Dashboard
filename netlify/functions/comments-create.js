import { getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';
import { CORS } from './_notion.js';

const ok = (body) => ({ statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const err = (msg, code = 500) => ({ statusCode: code, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) });

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const user = await getUser(event);
  if (!user) return err('Unauthorized', 401);

  const { entity, entity_id, body: commentBody, author_name } = JSON.parse(event.body || '{}');
  if (!entity || !entity_id || !commentBody) return err('entity, entity_id, and body required', 400);

  try {
    const sb = getSupabase();
    const { data, error } = await sb.from('comments').insert({
      entity,
      entity_id,
      author_id: user.id,
      author_name: author_name || user.fullName,
      body: commentBody,
    }).select().single();
    if (error) throw error;
    return ok(data);
  } catch (e) {
    return err(e.message);
  }
}
