// resource-comments-create — create a comment on a resource.
// Body: { resourceId: string, body: string }

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

  const resourceId = body.resourceId;
  const text       = (body.body || '').trim();
  if (!resourceId) return err(400, 'resourceId is required');
  if (!text)       return err(400, 'body is required');

  const user = await getUser(event);
  if (!user) return err(401, 'Unauthorized');

  try {
    const supabase = getSupabase();
    const { data: comment, error } = await supabase
      .from('resource_comments')
      .insert({
        resource_id: resourceId,
        user_id:     user.id,
        author_name: user.fullName || user.email.split('@')[0],
        body:        text,
      })
      .select()
      .single();
    if (error) throw error;
    return ok({ comment });
  } catch (e) {
    console.error('[resource-comments-create]', e.message);
    return err(500, e.message);
  }
};
