// resources-list — fetch all resources + their categories.
//
// Returns:
//   { resources: [...], categories: [...] }
//
// Each resource that is `ovmg_only = true` is filtered server-side based on
// the calling user's email domain.

import { ok, err, CORS } from './_notion.js';
import { requireAuth, getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const unauth = await requireAuth(event);
  if (unauth) return unauth;

  try {
    const user = await getUser(event);
    const isOvmg = (user?.email || '').endsWith('@onevibemediagroup.com');

    const supabase = getSupabase();

    // Categories
    const { data: categories, error: catErr } = await supabase
      .from('resource_categories')
      .select('*')
      .order('sort_order', { ascending: true });
    if (catErr) throw catErr;

    // Resources — apply ovmg_only filter for non-OVMG users
    let query = supabase
      .from('resources')
      .select('*')
      .eq('pinned_in_references', true)
      .order('updated_at', { ascending: false });
    if (!isOvmg) query = query.eq('ovmg_only', false);

    const { data: resources, error: resErr } = await query;
    if (resErr) throw resErr;

    return ok({ resources: resources || [], categories: categories || [] });
  } catch (e) {
    console.error('[resources-list]', e.message);
    return err(500, e.message);
  }
};
