// bookmarks-list — return all bookmark folders (with their reference IDs) for the calling user.
// Schema: bookmark_folders (id, user_id, name, sort_order, created_at)
//         bookmark_items   (id, folder_id, resource_id, sort_order, created_at)

import { ok, err, CORS } from './_notion.js';
import { requireAuth, getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  const user = await getUser(event);
  if (!user) return err(401, 'Unauthorized');

  try {
    const supabase = getSupabase();

    // Fetch folders for this user
    const { data: folders, error: fErr } = await supabase
      .from('bookmark_folders')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true });
    if (fErr) throw fErr;

    // Fetch all items for those folders
    const folderIds = (folders || []).map(f => f.id);
    let items = [];
    if (folderIds.length > 0) {
      const { data: itemData, error: iErr } = await supabase
        .from('bookmark_items')
        .select('*')
        .in('folder_id', folderIds)
        .order('sort_order', { ascending: true });
      if (iErr) throw iErr;
      items = itemData || [];
    }

    // Group items by folder
    const itemsByFolder = {};
    for (const item of items) {
      if (!itemsByFolder[item.folder_id]) itemsByFolder[item.folder_id] = [];
      itemsByFolder[item.folder_id].push(item.resource_id);
    }

    const result = (folders || []).map(f => ({
      ...f,
      resourceIds: itemsByFolder[f.id] || [],
    }));

    return ok({ folders: result });
  } catch (e) {
    console.error('[bookmarks-list]', e.message);
    return err(500, e.message);
  }
};
