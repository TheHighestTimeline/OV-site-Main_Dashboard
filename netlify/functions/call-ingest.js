// Webhook fallback for the review queue (2026-07 audit §4). If the Granola
// API polling path isn't available, point a Zapier/Make automation (triggered
// on "new Granola meeting") at this endpoint instead — same AI extraction,
// same review queue.
//
// POST with header  x-ingest-secret: $INGEST_SECRET
// Body: { externalId, title, callDate, attendees: [..], transcript }
import { getSupabase } from './_supabase.js';
import { ok, err, CORS } from './_http.js';
import { parseTranscript } from './_voiceParse.js';
import { airtableList, fromAirtableRecord, TASKS_MAP, CONTACTS_MAP } from './_airtable.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  if (event.httpMethod !== 'POST') return err(405, 'Method not allowed');

  const secret = process.env.INGEST_SECRET;
  if (!secret || event.headers?.['x-ingest-secret'] !== secret) return err(401, 'Unauthorized');

  try {
    const { externalId, title, callDate, attendees, transcript } = JSON.parse(event.body || '{}');
    if (!transcript?.trim()) return err(400, 'transcript is required');

    let tasks = [], contacts = [];
    try {
      const [taskRecs, contactRecs] = await Promise.all([
        airtableList(process.env.AIRTABLE_TABLE_TASKS || 'Master Action Board', { maxRecords: 300 }),
        airtableList(process.env.AIRTABLE_TABLE_CONTACTS || 'CRM Contacts', { maxRecords: 300 }),
      ]);
      tasks    = taskRecs.map(r => fromAirtableRecord(r, TASKS_MAP));
      contacts = contactRecs.map(r => fromAirtableRecord(r, CONTACTS_MAP));
    } catch (e) { console.warn('call-ingest: context fetch failed:', e.message); }

    const parsed = await parseTranscript({
      transcript: transcript.slice(0, 150000),
      section: 'call-review',
      ctx: { tasks, contacts, attendees: attendees || [] },
    });

    const sb = getSupabase();
    const { data, error } = await sb.from('call_reviews').upsert({
      source:           'webhook',
      external_id:      externalId || `webhook-${Date.now()}`,
      title:            title || 'Untitled call',
      call_date:        callDate || new Date().toISOString(),
      attendees:        attendees || [],
      transcript,
      summary:          parsed?.summary || '',
      proposed_actions: parsed || {},
      status:           'pending',
    }, { onConflict: 'external_id', ignoreDuplicates: true }).select().maybeSingle();
    if (error) throw error;

    return ok({ id: data?.id || null, summary: parsed?.summary || '' });
  } catch (e) {
    console.error('call-ingest error:', e);
    return err(500, e.message);
  }
};
