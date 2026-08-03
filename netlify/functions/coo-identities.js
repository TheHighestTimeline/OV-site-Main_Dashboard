// The unmatched-identities queue and its fix path (WP5).
//
// Identity matching WILL be wrong. An address matches nobody, or matches the
// wrong person because two people share a company domain and a first name. This
// endpoint is the manual merge action, and it ships in the same package as the
// ingest rather than "later" — an auto-matcher with no correction path quietly
// accumulates wrong data until nobody trusts the tab.
//
// GET  ?status=unmatched|all       list identities
// POST { id | handle, contactId }  link an identity to a CRM contact
// POST { id, contactId: null }     unlink (kick it back to the queue)

import { ok, err, CORS } from './_http.js';
import { requireCooOrOps } from './_cooAccess.js';
import { getUser } from './_auth.js';
import { getSupabase } from './_supabase.js';
import { TB, listRecords, getRecord } from './_airtable.js';
import { routeParticipation, participationsConfigured } from './_participations.js';

const CONTACTS_TBL = () => process.env.AIRTABLE_TABLE_CONTACTS || TB.CONTACTS;

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const authErr = await requireCooOrOps(event);
  if (authErr) return authErr;

  const supabase = getSupabase();

  try {
    if (event.httpMethod === 'GET') {
      const q      = event.queryStringParameters || {};
      const status = q.status || 'unmatched';
      const limit  = Math.min(parseInt(q.limit || '200', 10), 500);

      let query = supabase
        .from('coo_identities')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (status === 'unmatched') query = query.is('contact_airtable_id', null);

      const { data, error } = await query;
      if (error) return err(500, error.message);

      // Message counts give the queue an order that means something: an address
      // that emailed twelve times matters more than one that emailed once.
      const handles = (data || []).map(i => i.handle);
      const counts  = {};
      if (handles.length) {
        const { data: msgs } = await supabase
          .from('coo_messages')
          .select('from_handle')
          .in('from_handle', handles)
          .limit(5000);
        for (const m of msgs || []) counts[m.from_handle] = (counts[m.from_handle] || 0) + 1;
      }

      const identities = (data || []).map(i => ({
        id:           i.id,
        channel:      i.channel,
        handle:       i.handle,
        displayName:  i.display_name || '',
        contactId:    i.contact_airtable_id,
        verified:     i.verified,
        messageCount: counts[i.handle] || 0,
        createdAt:    i.created_at,
      })).sort((a, b) => b.messageCount - a.messageCount);

      // Candidate contacts for the picker, so the UI needs no second round trip.
      let candidates = [];
      try {
        const recs = await listRecords(CONTACTS_TBL(), { fields: ['Full Name', 'Email'] });
        candidates = recs.map(r => ({
          id:    r.id,
          name:  r.fields?.['Full Name'] || '',
          email: r.fields?.['Email'] || '',
        })).filter(c => c.name);
      } catch (e) {
        console.warn('[coo-identities] candidate load failed:', e.message);
      }

      return ok({ identities, candidates, unmatchedCount: identities.filter(i => !i.contactId).length });
    }

    if (event.httpMethod !== 'POST') return err(405, 'GET or POST only');

    // ── Link / unlink ────────────────────────────────────────────────────────
    const user = await getUser(event).catch(() => null);
    const { id, handle, channel = 'email', contactId } = JSON.parse(event.body || '{}');

    if (!id && !handle) return err(400, 'id or handle is required');

    if (contactId) {
      const contact = await getRecord(CONTACTS_TBL(), contactId);
      if (!contact) return err(404, 'Contact not found');
    }

    const patch = {
      contact_airtable_id: contactId || null,
      // A human made this call, so it is verified. Unlinking drops that back to
      // false: an unlinked identity is an open question again, not a decision.
      verified: Boolean(contactId),
    };

    let query = supabase.from('coo_identities').update(patch);
    query = id ? query.eq('id', id) : query.eq('channel', channel).eq('handle', handle);

    const { data, error } = await query.select().single();
    if (error) return err(500, error.message);

    // Backfill: every thread and event already ingested for this handle was
    // filed against a null contact. Attach them now, or the history the user
    // just identified stays invisible on that person's timeline.
    let backfilled = { threads: 0, events: 0 };
    if (contactId) backfilled = await backfillHandle(supabase, data.handle, contactId);

    console.log(`[coo-identities] ${data.handle} → ${contactId || 'unlinked'} by ${user?.email || 'unknown'}`);

    return ok({
      identity: {
        id: data.id, handle: data.handle, contactId: data.contact_airtable_id, verified: data.verified,
      },
      backfilled,
    });
  } catch (e) {
    console.error('[coo-identities]', e?.message || String(e));
    return err(500, e?.message || 'Identity operation failed');
  }
};

/**
 * Attach historical threads and events to a newly identified contact.
 *
 * Participation routing happens here too, so a linked identity immediately
 * lands on the right relationship rather than waiting for the next poll.
 */
async function backfillHandle(supabase, handle, contactId) {
  const out = { threads: 0, events: 0 };

  let participationId = null;
  let workstreamId    = null;
  if (participationsConfigured()) {
    try {
      const p = await routeParticipation(contactId);
      participationId = p?.id || null;
      workstreamId    = p?.workstreamId || null;
    } catch (e) {
      console.warn('[coo-identities] routing failed:', e.message);
    }
  }

  const { data: msgs } = await supabase
    .from('coo_messages').select('thread_id').eq('from_handle', handle).limit(2000);
  const threadIds = [...new Set((msgs || []).map(m => m.thread_id))];
  if (!threadIds.length) return out;

  const { data: updatedThreads } = await supabase
    .from('coo_threads')
    .update({
      contact_airtable_id: contactId,
      participation_airtable_id: participationId,
      opportunity_airtable_id:   workstreamId,
    })
    .in('id', threadIds)
    .is('contact_airtable_id', null)
    .select('id');
  out.threads = updatedThreads?.length || 0;

  const { data: msgIds } = await supabase
    .from('coo_messages').select('id').in('thread_id', threadIds).limit(5000);
  const ids = (msgIds || []).map(m => m.id);
  if (ids.length) {
    const { data: updatedEvents } = await supabase
      .from('coo_events')
      .update({
        contact_airtable_id: contactId,
        participation_airtable_id: participationId,
        workstream_airtable_id:    workstreamId,
      })
      .in('ref_message_id', ids)
      .is('contact_airtable_id', null)
      .select('id');
    out.events = updatedEvents?.length || 0;
  }

  return out;
}
