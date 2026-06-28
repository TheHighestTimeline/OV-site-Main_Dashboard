// bookmarks-remove — remove a reference from a bookmark folder.
// Body: { folderId: string, referenceId: string }

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

  const { folderId, referenceId } = body;
  if (!folderId) return err(400, 'folderId is required');
  if (!referenceId) return err(400, 'referenceId is required');

  const user = await getUser(event);
  if (!user) return err(401, 'Unauthorized');

  try {
    const supabase = getSupabase();

    // Ensure folder belongs to this user
    const { data: folder, error: fetchErr } = await supabase
      .from('bookmark_folders')
      .select('id, user_id')
      .eq('id', folderId)
      .single();
    if (fetchErr || !folder) return err(404, 'Folder not found');
    if (folder.user_id !== user.id) return err(403, 'Forbidden');

    const { error } = await supabase
      .from('bookmark_items')
      .delete()
      .eq('folder_id', folderId)
      .eq('resource_id', referenceId);
    if (error) throw error;

    return ok({ removed: true });
  } catch (e) {
    console.error('[bookmarks-remove]', e.message);
    return err(500, e.message);
  }
};
