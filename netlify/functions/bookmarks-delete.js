// bookmarks-delete — delete a bookmark folder and all its items.
// Body: { id: string }

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

    // Ensure the folder belongs to this user
    const { data: folder, error: fetchErr } = await supabase
      .from('bookmark_folders')
      .select('id, user_id')
      .eq('id', id)
      .single();
    if (fetchErr || !folder) return err(404, 'Folder not found');
    if (folder.user_id !== user.id) return err(403, 'Forbidden');

    // Delete items first (cascade should handle it, but be explicit)
    await supabase.from('bookmark_items').delete().eq('folder_id', id);

    // Delete folder
    const { error } = await supabase
      .from('bookmark_folders')
      .delete()
      .eq('id', id);
    if (error) throw error;

    return ok({ deleted: true });
  } catch (e) {
    console.error('[bookmarks-delete]', e.message);
    return err(500, e.message);
  }
};
