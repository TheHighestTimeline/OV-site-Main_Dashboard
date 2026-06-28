// booking-pages-list — list the authenticated user's booking pages.
import { ok, err, CORS } from './_notion.js';
import { requireAuth, getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const unauth = await requireAuth(event); if (unauth) return unauth;
  try {
    const user = await getUser(event);
    if (!user) return err(401, 'No user');
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('booking_pages')
      .select('*')
      .eq('owner_user_id', user.id)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return ok({ pages: data || [] });
  } catch (e) {
    console.error('[booking-pages-list]', e.message);
    return err(500, e.message);
  }
};
