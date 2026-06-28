// categories-upsert — admin-only. Create or update a resource category.
//
// Body shape:
//   { id: string (required), label: string, icon?: string, sort_order?: number }
//
// Categories use a stable text id (slug) so resources can reference them
// without breaking when label changes.

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

  const id    = (body.id    || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const label = (body.label || '').trim();
  if (!id)    return err(400, 'id is required');
  if (!label) return err(400, 'label is required');

  const payload = {
    id,
    label,
    icon:       body.icon || '◎',
    sort_order: Number.isFinite(body.sort_order) ? body.sort_order : 100,
  };

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('resource_categories')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();
    if (error) throw error;
    return ok({ category: data });
  } catch (e) {
    console.error('[categories-upsert]', e.message);
    return err(500, e.message);
  }
};
