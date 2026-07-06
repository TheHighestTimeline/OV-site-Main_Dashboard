// Create a review row (used by Audio Dump after parsing, or manual ingest).
import { getSupabase } from './_supabase.js';
import { requireAuth, getUser } from './_auth.js';
import { ok, err, CORS } from './_http.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const gate = await requireAuth(event);
  if (gate) return gate;
  if (event.httpMethod !== 'POST') return err(405, 'Method not allowed');

  try {
    const user = await getUser(event).catch(() => null);
    const { source, externalId, title, callDate, attendees, transcript, summary, proposedActions } =
      JSON.parse(event.body || '{}');
    if (!transcript && !proposedActions) return err(400, 'transcript or proposedActions required');

    const sb = getSupabase();
    const row = {
      source:           source || 'audio-dump',
      external_id:      externalId || null,
      title:            title || 'Untitled',
      call_date:        callDate || new Date().toISOString(),
      attendees:        attendees || [],
      transcript:       transcript || '',
      summary:          summary || proposedActions?.summary || '',
      proposed_actions: proposedActions || {},
      status:           'pending',
      reviewed_by:      null,
    };
    // upsert on external_id for idempotency when provided
    const { data, error } = externalId
      ? await sb.from('call_reviews').upsert(row, { onConflict: 'external_id', ignoreDuplicates: true }).select().maybeSingle()
      : await sb.from('call_reviews').insert(row).select().single();
    if (error) throw error;
    return ok({ id: data?.id || null, createdBy: user?.email || null });
  } catch (e) {
    console.error('reviews-create error:', e);
    return err(500, e.message);
  }
};
