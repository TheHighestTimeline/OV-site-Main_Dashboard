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
    const isAdmin = user.email.endsWith('@onevibemediagroup.com') || user.roles?.includes('admin');

    if (!isAdmin) {
      const { data: existing } = await sb.from('comments').select('author_id').eq('id', id).single();
      if (existing?.author_id !== user.id) return err('Not authorized to delete this comment', 403);
    }

    const { error } = await sb.from('comments').update({
      deleted_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw error;
    return ok({ ok: true });
  } catch (e) {
    return err(e.message);
  }
}
