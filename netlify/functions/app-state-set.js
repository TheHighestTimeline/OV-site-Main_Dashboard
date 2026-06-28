// Generic key/value SET — upserts JSON for a key.
// Drive files, templates, and company kanban boards are shared org-wide, so
// writes require admin or OVMG email. Anyone authenticated can read (GET).
import { getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';
import { CORS } from './_notion.js';

const ok  = (body) => ({ statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const err = (msg, code = 500) => ({ statusCode: code, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) });

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const user = await getUser(event);
  if (!user) return err('Unauthorized', 401);
  const isAdmin = user.email.endsWith('@onevibemediagroup.com') || user.roles.includes('admin');
  if (!isAdmin) return err('Admin access required to modify shared data', 403);

  const { key, data } = JSON.parse(event.body || '{}');
  if (!key) return err('key required', 400);

  try {
    const sb = getSupabase();
    const { error } = await sb
      .from('app_state')
      .upsert({ state_key: key, data, updated_at: new Date().toISOString() }, { onConflict: 'state_key' });
    if (error) throw error;
    return ok({ ok: true });
  } catch (e) {
    return err(e.message);
  }
}
