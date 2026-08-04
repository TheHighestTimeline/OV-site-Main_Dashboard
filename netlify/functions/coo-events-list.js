// COO-11: timeline read. Returns the ordered event stream for one participation,
// one contact, or one workstream (the channel-level activity feed).
//
// GET /.netlify/functions/coo-events-list?participationId=...&limit=100
//     &contactId=...  |  &workstreamId=...  &before=<ISO>
import { ok, err, CORS } from './_http.js';
import { requireRole } from './_auth.js';
import { getSupabase, explainSupabaseError } from './_supabase.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const authErr = await requireRole(event, ['coo', 'ops']);
  if (authErr) return authErr;

  try {
    const q              = event.queryStringParameters || {};
    const participationId = q.participationId;
    const contactId       = q.contactId;
    const workstreamId    = q.workstreamId;
    const limit           = Math.min(parseInt(q.limit || '100', 10), 200);

    if (!participationId && !contactId && !workstreamId) {
      return err(400, 'one of participationId, contactId or workstreamId is required');
    }

    const supabase = getSupabase();
    let query = supabase
      .from('coo_events')
      .select('*')
      .order('occurred_at', { ascending: false })
      .limit(limit);

    if (participationId) query = query.eq('participation_airtable_id', participationId);
    else if (contactId)  query = query.eq('contact_airtable_id', contactId);
    else                 query = query.eq('workstream_airtable_id', workstreamId);

    if (q.before) query = query.lt('occurred_at', q.before);

    const { data, error } = await query;
    if (error) return err(500, explainSupabaseError(error));

    // Oldest first for rendering. The timeline reads top to bottom.
    const events = (data || []).reverse().map(e => ({
      id:          e.id,
      type:        e.event_type,
      occurredAt:  e.occurred_at,
      title:       e.title,
      detail:      e.detail,
      actor:       e.actor,
      source:      e.source,
      url:         e.ref_url,
      messageId:   e.ref_message_id,
      driveFileId: e.ref_drive_file_id,
      inferred:    e.confidence === 'inferred',
    }));

    return ok({
      events,
      count:   events.length,
      hasMore: events.length === limit,
    });
  } catch (e) {
    console.error('[coo-events-list]', e?.message || String(e));
    return err(500, explainSupabaseError(e) || 'Failed to load timeline');
  }
};
