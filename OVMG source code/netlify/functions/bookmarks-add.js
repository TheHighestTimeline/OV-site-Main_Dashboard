// bookmarks-add — add a reference to a bookmark folder.
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

    // Get max sort_order in this folder
    const { data: existing } = await supabase
      .from('bookmark_items')
      .select('sort_order')
      .eq('folder_id', folderId)
      .order('sort_order', { ascending: false })
      .limit(1);
    const maxOrder = existing?.[0]?.sort_order ?? 0;

    // Upsert so adding the same reference twice is a no-op
    const { error } = await supabase
      .from('bookmark_items')
      .upsert(
        { folder_id: folderId, resource_id: referenceId, sort_order: maxOrder + 1 },
        { onConflict: 'folder_id,resource_id' },
      );
    if (error) throw error;

    return ok({ added: true });
  } catch (e) {
    console.error('[bookmarks-add]', e.message);
    return err(500, e.message);
  }
};
