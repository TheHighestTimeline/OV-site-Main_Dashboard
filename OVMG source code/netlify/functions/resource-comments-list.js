// resource-comments-list — list comments for a given resource.
// GET ?resourceId=<uuid>
// Returns: { comments: [...] }
// Schema: resource_comments (id, resource_id, user_id, author_name, body, created_at, updated_at)

import { ok, err, CORS } from './_notion.js';
import { requireAuth, getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  const resourceId = event.queryStringParameters?.resourceId;
  if (!resourceId) return err(400, 'resourceId is required');

  try {
    const supabase = getSupabase();
    const { data: comments, error } = await supabase
      .from('resource_comments')
      .select('*')
      .eq('resource_id', resourceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ok({ comments: comments || [] });
  } catch (e) {
    console.error('[resource-comments-list]', e.message);
    return err(500, e.message);
  }
};
