// booking-pages-delete — delete a booking page (owner only).
import { ok, err, CORS } from './_notion.js';
import { requireAuth, getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const unauth = await requireAuth(event); if (unauth) return unauth;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return err(400, 'Invalid JSON'); }

  if (!body.id) return err(400, 'id required');

  try {
    const user = await getUser(event);
    if (!user) return err(401, 'No user');
    const supabase = getSupabase();
    const { data: page, error: fErr } = await supabase
      .from('booking_pages').select('owner_user_id').eq('id', body.id).single();
    if (fErr || !page) return err(404, 'Not found');
    if (page.owner_user_id !== user.id) return err(403, 'Not your booking page');

    const { error } = await supabase.from('booking_pages').delete().eq('id', body.id);
    if (error) throw error;
    return ok({ id: body.id, deleted: true });
  } catch (e) {
    console.error('[booking-pages-delete]', e.message);
    return err(500, e.message);
  }
};
