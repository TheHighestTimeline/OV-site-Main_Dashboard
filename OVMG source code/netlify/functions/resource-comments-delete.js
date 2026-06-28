// resource-comments-delete — delete a comment. Users can only delete their own (admins can delete any).
// Body: { id: string }

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
  if (!id) return err(400, 'id is required');

  const user = await getUser(event);
  if (!user) return err(401, 'Unauthorized');

  const isAdmin = user.email.endsWith('@onevibemediagroup.com') || user.roles?.includes('admin');

  try {
    const supabase = getSupabase();

    // Verify ownership
    const { data: existing, error: fetchErr } = await supabase
      .from('resource_comments')
      .select('id, user_id')
      .eq('id', id)
      .single();
    if (fetchErr || !existing) return err(404, 'Comment not found');
    if (!isAdmin && existing.user_id !== user.id) return err(403, 'Forbidden');

    const { error } = await supabase
      .from('resource_comments')
      .delete()
      .eq('id', id);
    if (error) throw error;

    return ok({ deleted: true });
  } catch (e) {
    console.error('[resource-comments-delete]', e.message);
    return err(500, e.message);
  }
};
