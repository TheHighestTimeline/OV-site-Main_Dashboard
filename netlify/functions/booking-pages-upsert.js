// booking-pages-upsert — create or update a booking page.
import { ok, err, CORS } from './_notion.js';
import { requireAuth, getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';

function slugify(s) {
  return String(s || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const unauth = await requireAuth(event); if (unauth) return unauth;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return err(400, 'Invalid JSON'); }

  const label = (body.label || '').trim();
  if (!label) return err(400, 'label is required');

  try {
    const user = await getUser(event);
    if (!user) return err(401, 'No user');

    const supabase = getSupabase();

    // Compute slug. For updates we keep the existing slug; for create we generate one.
    let slug = body.slug || slugify(`${user.fullName || user.email.split('@')[0]}-${label}`);
    if (!body.id) {
      // ensure uniqueness on create
      let suffix = '';
      while (true) {
        const trial = slug + suffix;
        const { data: existing } = await supabase
          .from('booking_pages').select('id').eq('slug', trial).limit(1);
        if (!existing || existing.length === 0) { slug = trial; break; }
        suffix = '-' + Math.random().toString(36).slice(2, 6);
      }
    }

    const payload = {
      owner_user_id:      user.id,
      slug,
      label,
      description:        (body.description       || '').trim(),
      duration_min:       Number(body.duration_min)      || 30,
      buffer_min:         Number(body.buffer_min)        || 5,
      max_per_day:        Number(body.max_per_day)       || 8,
      min_notice_hours:   Number(body.min_notice_hours)  || 4,
      max_notice_days:    Number(body.max_notice_days)   || 30,
      availability:       Array.isArray(body.availability) ? body.availability : [],
      target_calendar_id: body.target_calendar_id || null,
      with_meet:          body.with_meet !== false,
      active:             body.active !== false,
    };

    let result;
    if (body.id) {
      // Update — verify ownership first
      const { data: existing, error: fErr } = await supabase
        .from('booking_pages').select('owner_user_id').eq('id', body.id).single();
      if (fErr || !existing) return err(404, 'Booking page not found');
      if (existing.owner_user_id !== user.id) return err(403, 'Not your booking page');

      const { data, error } = await supabase
        .from('booking_pages').update(payload).eq('id', body.id).select().single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from('booking_pages').insert(payload).select().single();
      if (error) throw error;
      result = data;
    }
    return ok({ page: result });
  } catch (e) {
    console.error('[booking-pages-upsert]', e.message);
    return err(500, e.message);
  }
};
