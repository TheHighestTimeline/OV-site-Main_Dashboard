// bookmarks-create — create a new bookmark folder for the calling user.
// Body: { name: string }

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

  const name = (body.name || '').trim();
  if (!name) return err(400, 'name is required');

  const user = await getUser(event);
  if (!user) return err(401, 'Unauthorized');

  try {
    const supabase = getSupabase();

    // Get max sort_order for this user's folders
    const { data: existing } = await supabase
      .from('bookmark_folders')
      .select('sort_order')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: false })
      .limit(1);
    const maxOrder = existing?.[0]?.sort_order ?? 0;

    const { data: folder, error } = await supabase
      .from('bookmark_folders')
      .insert({ user_id: user.id, name, sort_order: maxOrder + 1 })
      .select()
      .single();
    if (error) throw error;

    return ok({ folder: { ...folder, resourceIds: [] } });
  } catch (e) {
    console.error('[bookmarks-create]', e.message);
    return err(500, e.message);
  }
};
