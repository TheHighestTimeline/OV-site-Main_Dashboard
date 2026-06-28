// references-unpin — remove a user-level pin on a resource.

import { ok, err, CORS } from './_notion.js';
import { requireAuth, getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return err(400, 'Invalid JSON'); }

  const { id } = body;
  if (!id) return err(400, 'id is required');

  const user = await getUser(event);
  if (!user) return err(401, 'Unauthorized');

  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('resource_pins')
      .delete()
      .eq('user_id', user.id)
      .eq('resource_id', id);
    if (error) throw error;
    return ok({ pinned: false });
  } catch (e) {
    console.error('[references-unpin]', e.message);
    return err(500, e.message);
  }
};
