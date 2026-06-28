// Generic key/value GET — returns the stored JSON for a key (or null).
import { requireAuth } from './_auth.js';
import { getSupabase } from './_supabase.js';
import { CORS } from './_notion.js';

const ok  = (body) => ({ statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const err = (msg, code = 500) => ({ statusCode: code, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) });

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const gate = await requireAuth(event);
  if (gate) return gate;

  const key = event.queryStringParameters?.key;
  if (!key) return err('key required', 400);

  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('app_state')
      .select('data')
      .eq('state_key', key)
      .maybeSingle();
    if (error) throw error;
    return ok({ data: data?.data ?? null });
  } catch (e) {
    return err(e.message);
  }
}
