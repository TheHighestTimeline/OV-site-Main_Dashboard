// audio-logs-update — PATCH: update status / review notes on an audio_log.
// Body: { id, status, review_notes, parsed_actions }
// Auth required. Admin required to update senior_partner logs.
import { ok, err, CORS } from './_notion.js';
import { getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  if (event.httpMethod !== 'PATCH') return err(405, 'Method not allowed');

  const user = await getUser(event);
  if (!user) return { statusCode: 401, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unauthorized' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return err(400, 'Invalid JSON'); }

  const { id, status, review_notes, parsed_actions } = body;
  if (!id) return err(400, 'id is required');

  const isOvmg  = user.email.endsWith('@onevibemediagroup.com');
  const isAdmin = isOvmg || user.roles.includes('admin') || user.role === 'admin';

  try {
    const supabase = getSupabase();

    // Fetch the existing log to check ownership / kind
    const { data: existing, error: fetchErr } = await supabase
      .from('audio_logs')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !existing) return err(404, 'Audio log not found');

    // Senior partner logs can only be updated by admins
    if (existing.kind === 'senior_partner' && !isAdmin) {
      return { statusCode: 403, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Access denied' }) };
    }

    // Non-admins can only update their own employee logs
    if (!isAdmin && existing.user_id !== user.id) {
      return { statusCode: 403, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Access denied' }) };
    }

    const updates = { updated_at: new Date().toISOString() };
    if (status         !== undefined) updates.status         = status;
    if (review_notes   !== undefined) updates.review_notes   = review_notes;
    if (parsed_actions !== undefined) updates.parsed_actions = parsed_actions;

    const { data, error } = await supabase
      .from('audio_logs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return ok({ log: data });
  } catch (e) {
    console.error('[audio-logs-update]', e.message);
    return err(500, e.message);
  }
};
