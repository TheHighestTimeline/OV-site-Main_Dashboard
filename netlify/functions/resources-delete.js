// resources-delete — admin-only. Removes a resource by id.

import { ok, err, CORS } from './_notion.js';
import { requireAdmin } from './_auth.js';
import { getSupabase } from './_supabase.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const authErr = await requireAdmin(event);
  if (authErr) return authErr;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return err(400, 'Invalid JSON'); }

  const id = body.id;
  if (!id) return err(400, 'id is required');

  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('resources')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return ok({ id, deleted: true });
  } catch (e) {
    console.error('[resources-delete]', e.message);
    return err(500, e.message);
  }
};
