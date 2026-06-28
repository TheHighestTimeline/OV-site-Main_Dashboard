// resources-upsert — admin-only. Create or update a resource.
//
// If `id` is provided in the body, performs an UPDATE.
// Otherwise INSERTs a new row.
//
// Body shape:
//   {
//     id?:                 string (uuid; present for update)
//     title:               string (required)
//     url:                 string (required)
//     category_id?:        string
//     type?:               string
//     description?:        string
//     owner?:              string
//     pinned_in_references?: boolean
//     ovmg_only?:          boolean
//     tags?:               string[]
//   }

import { ok, err, CORS } from './_notion.js';
import { requireAdmin, getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';

const VALID_TYPES = new Set([
  'url', 'drive-doc', 'drive-folder', 'drive-sheet', 'drive-slides',
  'dashboard-tool', 'automation', 'tally-form', 'pdf', 'video',
]);

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const authErr = await requireAdmin(event);
  if (authErr) return authErr;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return err(400, 'Invalid JSON'); }

  const title = (body.title || '').trim();
  const url   = (body.url   || '').trim();
  if (!title) return err(400, 'title is required');
  if (!url)   return err(400, 'url is required');

  const type = body.type && VALID_TYPES.has(body.type) ? body.type : 'url';

  const user = await getUser(event);
  const editorId = user?.id || '';

  const payload = {
    title,
    url: url.startsWith('http') ? url : `https://${url}`,
    category_id:           body.category_id || null,
    type,
    description:           (body.description || '').trim(),
    owner:                 (body.owner       || '').trim(),
    pinned_in_references:  body.pinned_in_references !== undefined ? !!body.pinned_in_references : true,
    ovmg_only:             !!body.ovmg_only,
    tags:                  Array.isArray(body.tags) ? body.tags.filter(Boolean) : [],
    updated_by_user_id:    editorId,
  };

  try {
    const supabase = getSupabase();
    let result;

    if (body.id) {
      // UPDATE
      const { data, error } = await supabase
        .from('resources')
        .update(payload)
        .eq('id', body.id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      // INSERT — set created_by_user_id too
      const insertPayload = { ...payload, created_by_user_id: editorId };
      const { data, error } = await supabase
        .from('resources')
        .insert(insertPayload)
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    return ok({ resource: result });
  } catch (e) {
    console.error('[resources-upsert]', e.message);
    return err(500, e.message);
  }
};
