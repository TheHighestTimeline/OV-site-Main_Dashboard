// Gmail ingest (WP5). Scheduled, plus callable for a manual run.
//
// SCOPE, deliberately narrow: Tanner's mailbox only. Not accounts@, not
// socials@. accounts@ is a locked root credential and pulling it into a
// self-hosted store is a different risk conversation than this feature.
//
// WHAT LANDS WHERE
//   coo_threads / coo_messages  full message bodies, in Postgres, searchable
//   coo_events                  one timeline row per message
//   Airtable Activities         ONE summary row per thread per day
//
// That last line is the important one. An Activity per message would grow
// Airtable records with message volume, and Airtable is the system of record for
// people and deals, not a mail store. One row per thread per day keeps record
// growth linear in relationships and preserves the locked CRM rule that an
// Activity links to exactly one company.

import { ok, err, CORS } from './_http.js';
import { requireCoo } from './_cooAccess.js';
import { getSupabase } from './_supabase.js';
import { getGmail, extractBody, getHeader } from './_gmail.js';
import { TB, listRecords, createRecords } from './_airtable.js';
import { routeParticipation, participationsConfigured } from './_participations.js';

const SYNC_KEY   = 'gmail';
const SCAN_OWNER = process.env.COO_SCAN_USER_ID || null;
const MAX_THREADS_PER_RUN = parseInt(process.env.COO_GMAIL_MAX_THREADS || '40', 10);

const CONTACTS_TBL   = () => process.env.AIRTABLE_TABLE_CONTACTS || TB.CONTACTS;
const ACTIVITIES_TBL = () => process.env.AIRTABLE_TABLE_ACTIVITIES || TB.ACTIVITIES;

// Addresses that are us. Direction is decided by whether the sender is one of
// these, so getting the list wrong flips every arrow in the timeline.
function ourAddresses() {
  const extra = (process.env.COO_OUR_ADDRESSES || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const sender = (process.env.GMAIL_SENDER || '').toLowerCase();
  return new Set([sender, ...extra].filter(Boolean));
}

function parseAddress(raw) {
  const s = String(raw || '');
  const angle = s.match(/<([^>]+)>/);
  const email = (angle ? angle[1] : s).trim().toLowerCase();
  const name  = angle ? s.slice(0, s.indexOf('<')).replace(/["']/g, '').trim() : '';
  return { email, name };
}

function parseAddressList(raw) {
  return String(raw || '')
    .split(',')
    .map(parseAddress)
    .filter(a => a.email.includes('@'));
}

export const handler = async (event) => {
  if (event?.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  if (event?.httpMethod) {
    const authErr = await requireCoo(event);
    if (authErr) return authErr;
  }

  const supabase = getSupabase();
  const summary  = {
    threads: 0, messages: 0, newIdentities: 0, unmatched: 0,
    activitiesWritten: 0, errors: [],
  };

  try {
    const gmail = await getGmail(SCAN_OWNER);
    const us    = ourAddresses();

    // Cursor. Gmail's history API needs a starting historyId; on a cold start we
    // fall back to a bounded recent window rather than the whole mailbox, so the
    // first run cannot spend an hour and a rate limit backfilling five years.
    const { data: syncRow } = await supabase
      .from('coo_sync_state').select('cursor, last_success_at').eq('source', SYNC_KEY).maybeSingle();

    const lookbackDays = syncRow?.last_success_at ? 2 : parseInt(process.env.COO_GMAIL_BACKFILL_DAYS || '30', 10);
    const query = `-in:chats -in:drafts newer_than:${lookbackDays}d`;

    const { data: list } = await gmail.users.threads.list({
      userId: 'me',
      q: query,
      maxResults: MAX_THREADS_PER_RUN,
    });

    const threadRefs = list.threads || [];

    // Contact lookup by email, built once. Rebuilding it per message would be
    // an N+1 straight into the Airtable rate limiter.
    const contactByEmail = await buildContactIndex();

    for (const ref of threadRefs) {
      try {
        const written = await ingestThread({
          gmail, supabase, threadId: ref.id, us, contactByEmail, summary,
        });
        if (written) summary.threads++;
      } catch (e) {
        console.error('[coo-gmail] thread failed', ref.id, e.message);
        summary.errors.push(`${ref.id}: ${e.message}`);
      }
    }

    await supabase.from('coo_sync_state').upsert({
      source:          SYNC_KEY,
      cursor:          list.nextPageToken || syncRow?.cursor || null,
      last_run_at:     new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      last_error:      summary.errors.length ? summary.errors.slice(0, 3).join(' | ') : null,
    }, { onConflict: 'source' });

    console.log('[coo-gmail] ingest complete', summary);
    return ok(summary);
  } catch (e) {
    const msg = e?.message || String(e);
    console.error('[coo-gmail] ingest failed:', msg);
    await supabase.from('coo_sync_state').upsert({
      source: SYNC_KEY, last_run_at: new Date().toISOString(), last_error: msg,
    }, { onConflict: 'source' });
    return err(500, msg);
  }
};

// ── Airtable contact index ──────────────────────────────────────────────────

async function buildContactIndex() {
  const index = {};
  try {
    const recs = await listRecords(CONTACTS_TBL(), { fields: ['Full Name', 'Email'] });
    for (const r of recs) {
      const email = String(r.fields?.['Email'] || '').trim().toLowerCase();
      if (email) index[email] = { id: r.id, name: r.fields?.['Full Name'] || '' };
    }
  } catch (e) {
    console.error('[coo-gmail] contact index failed:', e.message);
  }
  return index;
}

// ── Thread ingest ───────────────────────────────────────────────────────────

async function ingestThread({ gmail, supabase, threadId, us, contactByEmail, summary }) {
  const { data: thread } = await gmail.users.threads.get({
    userId: 'me', id: threadId, format: 'full',
  });

  const messages = thread.messages || [];
  if (!messages.length) return false;

  const headersOf = m => m.payload?.headers || [];
  const subject   = getHeader(headersOf(messages[0]), 'Subject') || '(no subject)';

  // The counterparty is the first non-us participant seen anywhere in the
  // thread. A thread with only our own addresses is internal and gets skipped:
  // this layer tracks relationships, not our own memos.
  let counterparty = null;
  for (const m of messages) {
    const from = parseAddress(getHeader(headersOf(m), 'From'));
    if (from.email && !us.has(from.email)) { counterparty = from; break; }
    for (const to of parseAddressList(getHeader(headersOf(m), 'To'))) {
      if (!us.has(to.email)) { counterparty = to; break; }
    }
    if (counterparty) break;
  }
  if (!counterparty) return false;

  // ── Identity resolution ───────────────────────────────────────────────────
  // Matching WILL be wrong sometimes. Every unresolved address becomes a row in
  // coo_identities with a null contact, which is the queue a human clears in the
  // evening SOP. Auto-matching is never treated as solved.
  const match = contactByEmail[counterparty.email] || null;
  const { data: existingIdentity } = await supabase
    .from('coo_identities')
    .select('id, contact_airtable_id')
    .eq('channel', 'email').eq('handle', counterparty.email).maybeSingle();

  const contactId = existingIdentity?.contact_airtable_id || match?.id || null;

  if (!existingIdentity) summary.newIdentities++;
  if (!contactId) summary.unmatched++;

  await supabase.from('coo_identities').upsert({
    channel: 'email',
    handle:  counterparty.email,
    contact_airtable_id: contactId,
    display_name: counterparty.name || match?.name || null,
    // `verified` stays false until a human confirms it in the merge queue.
    // An automatic match is a guess with good odds, not a confirmation.
    verified: Boolean(existingIdentity?.contact_airtable_id),
  }, { onConflict: 'channel,handle' });

  // ── Subject routing: exactly one participation ────────────────────────────
  let participationId = null;
  let workstreamId    = null;
  if (contactId && participationsConfigured()) {
    const p = await routeParticipation(contactId);
    participationId = p?.id || null;
    workstreamId    = p?.workstreamId || null;
  }

  const times = messages.map(m => Number(m.internalDate || 0)).filter(Boolean);
  const first = times.length ? new Date(Math.min(...times)).toISOString() : new Date().toISOString();
  const last  = times.length ? new Date(Math.max(...times)).toISOString() : first;

  const lastFrom = parseAddress(getHeader(headersOf(messages[messages.length - 1]), 'From'));
  const lastDirection = us.has(lastFrom.email) ? 'outbound' : 'inbound';

  const { data: threadRow, error: threadErr } = await supabase
    .from('coo_threads')
    .upsert({
      channel: 'email',
      external_thread_id: threadId,
      subject,
      contact_airtable_id:       contactId,
      participation_airtable_id: participationId,
      opportunity_airtable_id:   workstreamId,
      first_message_at: first,
      last_message_at:  last,
      last_direction:   lastDirection,
      message_count:    messages.length,
      source: 'live',
    }, { onConflict: 'channel,external_thread_id' })
    .select('id')
    .single();

  if (threadErr) throw new Error(`thread upsert: ${threadErr.message}`);

  // ── Messages ──────────────────────────────────────────────────────────────
  for (const m of messages) {
    const hs        = headersOf(m);
    const from      = parseAddress(getHeader(hs, 'From'));
    const to        = parseAddressList(getHeader(hs, 'To')).map(a => a.email);
    const direction = us.has(from.email) ? 'outbound' : 'inbound';
    const sentAt    = new Date(Number(m.internalDate || Date.now())).toISOString();
    const bodyHtml  = extractBody(m.payload);
    const bodyText  = String(bodyHtml).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const attachments = collectAttachments(m.payload);

    const { data: msgRow, error: msgErr } = await supabase
      .from('coo_messages')
      .upsert({
        thread_id:  threadRow.id,
        external_message_id: m.id,
        channel:    'email',
        direction,
        from_handle: from.email,
        to_handles:  to,
        sent_at:     sentAt,
        body:        bodyText.slice(0, 100000),
        snippet:     (m.snippet || bodyText).slice(0, 280),
        has_attachment: attachments.length > 0,
        attachment_meta: attachments.length ? { files: attachments } : null,
        raw_ref:     `gmail:${m.id}`,
      }, { onConflict: 'channel,external_message_id' })
      .select('id')
      .single();

    if (msgErr) {
      console.error('[coo-gmail] message upsert failed:', msgErr.message);
      continue;
    }
    summary.messages++;

    // One timeline event per message. dedupe_key makes the poller idempotent:
    // replays are guaranteed, and duplicate timeline rows destroy trust in the
    // view faster than a missing one does.
    await supabase.from('coo_events').upsert({
      participation_airtable_id: participationId,
      contact_airtable_id:       contactId,
      workstream_airtable_id:    workstreamId,
      event_type:  direction === 'inbound' ? 'message_in' : 'message_out',
      occurred_at: sentAt,
      title:       subject,
      detail:      (m.snippet || bodyText).slice(0, 500) || null,
      actor:       direction === 'inbound' ? 'them' : 'us',
      source:      'gmail',
      ref_message_id: msgRow.id,
      ref_url:     `https://mail.google.com/mail/u/0/#inbox/${threadId}`,
      confidence:  'confirmed',
      dedupe_key:  `gmail:msg:${m.id}`,
    }, { onConflict: 'dedupe_key', ignoreDuplicates: true });
  }

  // ── Airtable Activities: one summary row per thread per day ───────────────
  if (contactId) {
    const written = await writeDailyActivity({
      supabase, contactId, subject, threadId, last, messageCount: messages.length,
    });
    if (written) summary.activitiesWritten++;
  }

  // A new inbound message is exactly when the brief stops being current.
  if (participationId && lastDirection === 'inbound') {
    await supabase.from('coo_briefs')
      .update({ stale: true })
      .eq('participation_airtable_id', participationId);
  }

  return true;
}

function collectAttachments(payload, out = []) {
  if (!payload) return out;
  if (payload.filename && payload.body?.attachmentId) {
    out.push({
      name:     payload.filename,
      mimeType: payload.mimeType,
      size:     payload.body.size || null,
    });
  }
  for (const part of payload.parts || []) collectAttachments(part, out);
  return out;
}

/**
 * Write at most one Activity per thread per day.
 *
 * The dedupe check runs against coo_events rather than Airtable, because
 * querying Airtable per thread would be the N+1 this design exists to avoid.
 */
async function writeDailyActivity({ supabase, contactId, subject, threadId, last, messageCount }) {
  const day       = String(last).slice(0, 10);
  const dedupeKey = `activity:${threadId}:${day}`;

  const { data: already } = await supabase
    .from('coo_events').select('id').eq('dedupe_key', dedupeKey).maybeSingle();
  if (already) return false;

  try {
    await createRecords(ACTIVITIES_TBL(), [{
      fields: {
        'Title':  `Email: ${subject}`.slice(0, 200),
        'Type':   'Email',
        'Date':   day,
        'Source': 'Gmail',
        'Body':   `${messageCount} message(s) in this thread as of ${day}.\n` +
                  `https://mail.google.com/mail/u/0/#inbox/${threadId}`,
        'Contact': [contactId],
      },
    }]);
  } catch (e) {
    console.error('[coo-gmail] activity write failed:', e.message);
    return false;
  }

  // Mark it written so tomorrow's run does not repeat today's row.
  await supabase.from('coo_events').insert({
    contact_airtable_id: contactId,
    event_type:  'note',
    occurred_at: last,
    title:       `Activity logged: ${subject}`.slice(0, 200),
    detail:      null,
    actor:       'system',
    source:      'airtable',
    confidence:  'confirmed',
    dedupe_key:  dedupeKey,
  });

  return true;
}
