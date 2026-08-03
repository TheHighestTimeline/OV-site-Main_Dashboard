// COO-11: add a note to a timeline, typed or spoken.
//
// Voice path reuses the existing pipeline. The client records with useVoice.js,
// posts the audio to voice-transcribe.js, then sends the resulting text here
// with source 'voice'. No second transcription service, no new dependency.
//
// POST /.netlify/functions/coo-note-create
// {
//   participationId?, contactId?, workstreamId?,   // at least one required
//   text:      "Greg said the committee meets Thursday",
//   source:    "voice" | "text",
//   occurredAt?: ISO                                // defaults to now
// }
import { ok, err, CORS } from './_http.js';
import { requireRole, getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';

const MAX_LEN = 5000;

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  if (event.httpMethod !== 'POST')    return err(405, 'POST only');

  const authErr = await requireRole(event, ['coo', 'ops']);
  if (authErr) return authErr;

  try {
    const user = await getUser(event);
    const body = JSON.parse(event.body || '{}');
    const {
      participationId = null,
      contactId       = null,
      workstreamId    = null,
      text            = '',
      source          = 'text',
      occurredAt,
    } = body;

    const clean = String(text).trim();
    if (!clean) return err(400, 'text is required');
    if (clean.length > MAX_LEN) return err(400, `text exceeds ${MAX_LEN} characters`);
    if (!participationId && !contactId && !workstreamId) {
      return err(400, 'one of participationId, contactId or workstreamId is required');
    }
    if (!['voice', 'text'].includes(source)) return err(400, 'source must be voice or text');

    const supabase = getSupabase();
    const when     = occurredAt || new Date().toISOString();
    const author   = user?.fullName || user?.email || 'unknown';

    // First line becomes the timeline headline, the rest is detail. Keeps the
    // stream scannable when someone dictates three paragraphs.
    const firstLine = clean.split('\n')[0].trim();
    const title     = firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
    const detail    = clean.length > title.length ? clean : null;

    const { data, error } = await supabase.from('coo_events').insert({
      participation_airtable_id: participationId,
      contact_airtable_id:       contactId,
      workstream_airtable_id:    workstreamId,
      event_type:  'note',
      occurred_at: when,
      title,
      detail,
      actor:       'us',
      source:      'manual',
      confidence:  'confirmed',
      // Notes are authored, never replayed by a poller, so no dedupe key is
      // needed. Two identical notes a minute apart are two real notes.
      dedupe_key:  null,
    }).select().single();

    if (error) return err(500, error.message);

    // A new note changes what the brief should say.
    if (participationId) {
      await supabase.from('coo_briefs')
        .update({ stale: true })
        .eq('participation_airtable_id', participationId);
    }

    console.log(`[coo-note] ${source} note by ${author} on ${participationId || contactId || workstreamId}`);

    return ok({
      id:         data.id,
      title:      data.title,
      occurredAt: data.occurred_at,
      source,
      author,
    });
  } catch (e) {
    console.error('[coo-note-create]', e?.message || String(e));
    return err(500, e?.message || 'Failed to save note');
  }
};
