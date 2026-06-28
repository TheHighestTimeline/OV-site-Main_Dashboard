// resource-comments-update — edit a comment. Users can only edit their own (admins can edit any).
// Body: { id: string, body: string }

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

  const { id } = body;
  const text    = (body.body || '').trim();
  if (!id)   return err(400, 'id is required');
  if (!text) return err(400, 'body is required');

  const user = await getUser(event);
  if (!user) return err(401, 'Unauthorized');

  const isAdmin = user.email.endsWith('@onevibemediagroup.com') || user.roles?.includes('admin');

  try {
    const supabase = getSupabase();

    // Fetch to verify ownership
    const { data: existing, error: fetchErr } = await supabase
      .from('resource_comments')
      .select('id, user_id')
      .eq('id', id)
      .single();
    if (fetchErr || !existing) return err(404, 'Comment not found');
    if (!isAdmin && existing.user_id !== user.id) return err(403, 'Forbidden');

    const { data: comment, error } = await supabase
      .from('resource_comments')
      .update({ body: text, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    return ok({ comment });
  } catch (e) {
    console.error('[resource-comments-update]', e.message);
    return err(500, e.message);
  }
};
