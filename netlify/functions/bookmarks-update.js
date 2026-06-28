// bookmarks-update — rename a bookmark folder. Users can only update their own folders.
// Body: { id: string, name: string }

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
  const name = (body.name || '').trim();
  if (!id) return err(400, 'id is required');
  if (!name) return err(400, 'name is required');

  const user = await getUser(event);
  if (!user) return err(401, 'Unauthorized');

  try {
    const supabase = getSupabase();

    // Ensure the folder belongs to this user
    const { data: folder, error: fetchErr } = await supabase
      .from('bookmark_folders')
      .select('id, user_id')
      .eq('id', id)
      .single();
    if (fetchErr || !folder) return err(404, 'Folder not found');
    if (folder.user_id !== user.id) return err(403, 'Forbidden');

    const { data: updated, error } = await supabase
      .from('bookmark_folders')
      .update({ name })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    return ok({ folder: updated });
  } catch (e) {
    console.error('[bookmarks-update]', e.message);
    return err(500, e.message);
  }
};
