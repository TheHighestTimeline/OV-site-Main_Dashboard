// Dismiss a review or edit its proposed actions (before approval).
import { getSupabase, explainSupabaseError } from './_supabase.js';
import { requireRole, getUser } from './_auth.js';
import { ok, err, CORS } from './_http.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const gate = await requireRole(event, ['admin', 'executive', 'operations', 'senior_partner']);
  if (gate) return gate;

  try {
    const user = await getUser(event).catch(() => null);
    const { id, status, proposedActions } = JSON.parse(event.body || '{}');
    if (!id) return err(400, 'id is required');

    const patch = {};
    if (status) {
      if (!['pending', 'dismissed'].includes(status)) return err(400, 'status must be pending or dismissed (use reviews-apply to approve)');
      patch.status = status;
      patch.reviewed_by = user?.email || null;
      patch.reviewed_at = new Date().toISOString();
    }
    if (proposedActions) patch.proposed_actions = proposedActions;
    if (!Object.keys(patch).length) return err(400, 'nothing to update');

    const sb = getSupabase();
    const { error } = await sb.from('call_reviews').update(patch).eq('id', id);
    if (error) throw error;
    return ok({ updated: true });
  } catch (e) {
    console.error('reviews-update error:', e);
    return err(500, explainSupabaseError(e));
  }
};
