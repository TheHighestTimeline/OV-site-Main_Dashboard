// Granola → review queue poller (2026-07 audit §4).
// Runs every 15 minutes (schedule set in netlify.toml). Pulls new meetings
// from the OVMG Granola workspace, runs each transcript through the shared
// AI extraction (_voiceParse.js 'call-review' section), and stages the
// proposed actions as PENDING rows in call_reviews. Nothing touches the CRM
// until a human approves on the Review page.
//
// Env vars:
//   GRANOLA_API_TOKEN  — required to enable polling (poller no-ops without it)
//   GRANOLA_API_BASE   — default https://api.granola.ai/v2
//   POLL_SECRET        — optional; allows manual triggering with x-poll-secret
//
// Idempotent: external_id is unique in call_reviews, and we track a lastPoll
// cursor in app_state, so re-polls never duplicate.
import { getSupabase } from './_supabase.js';
import { ok, err, CORS } from './_http.js';
import { parseTranscript } from './_voiceParse.js';
import { airtableList, fromAirtableRecord, TASKS_MAP, CONTACTS_MAP } from './_airtable.js';

const API_BASE = process.env.GRANOLA_API_BASE || 'https://api.granola.ai/v2';

function isAuthorized(event) {
  // Netlify scheduled invocations carry a JSON body with next_run and are not
  // signed; manual triggers must present the POLL_SECRET header.
  if (process.env.POLL_SECRET &&
      (event.headers?.['x-poll-secret'] === process.env.POLL_SECRET)) return true;
  try {
    const body = JSON.parse(event.body || '{}');
    if (body.next_run) return true; // scheduled invocation
  } catch { /* fall through */ }
  return false;
}

async function granola(path, payload) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GRANOLA_API_TOKEN}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) throw new Error(`Granola ${path} → HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// Tolerant readers — Granola's payload shapes have shifted between versions.
const docId    = d => d.id || d.document_id || d.doc_id;
const docTitle = d => d.title || d.name || 'Untitled meeting';
const docDate  = d => d.created_at || d.createdAt || d.date || null;
const docPeople = d => {
  const p = d.people || d.attendees || d.participants || [];
  return (Array.isArray(p) ? p : []).map(x => (typeof x === 'string' ? x : x?.name || x?.email)).filter(Boolean);
};

async function fetchTranscript(id) {
  try {
    const t = await granola('get-document-transcript', { document_id: id });
    if (typeof t === 'string') return t;
    if (Array.isArray(t)) return t.map(seg => `${seg.speaker || seg.source || ''}: ${seg.text || ''}`).join('\n');
    if (Array.isArray(t?.transcript)) return t.transcript.map(seg => `${seg.speaker || ''}: ${seg.text || ''}`).join('\n');
    return t?.text || '';
  } catch (e) {
    console.warn('transcript fetch failed for', id, e.message);
    return '';
  }
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  if (!isAuthorized(event)) return err(401, 'Unauthorized');

  if (!process.env.GRANOLA_API_TOKEN) {
    console.log('granola-poll: GRANOLA_API_TOKEN not set — skipping.');
    return ok({ skipped: true, reason: 'GRANOLA_API_TOKEN not configured' });
  }

  const sb = getSupabase();
  try {
    // Last-poll cursor
    const { data: cursorRow } = await sb.from('app_state').select('data').eq('state_key', 'granola:lastPoll').maybeSingle();
    const lastPoll = cursorRow?.data?.ts || null;

    // Fetch recent documents (Granola returns newest-first)
    const res  = await granola('get-documents', { limit: 25, ...(lastPoll ? { created_after: lastPoll } : {}) });
    const docs = res?.docs || res?.documents || (Array.isArray(res) ? res : []);
    if (!docs.length) {
      await sb.from('app_state').upsert({ state_key: 'granola:lastPoll', data: { ts: new Date().toISOString() } }, { onConflict: 'state_key' });
      return ok({ processed: 0 });
    }

    // Which are already staged?
    const ids = docs.map(docId).filter(Boolean);
    const { data: existing } = await sb.from('call_reviews').select('external_id').in('external_id', ids);
    const seen = new Set((existing || []).map(r => r.external_id));
    const fresh = docs.filter(d => docId(d) && !seen.has(docId(d)));

    // Context for AI matching (compact — see _voiceParse)
    let tasks = [], contacts = [];
    try {
      const [taskRecs, contactRecs] = await Promise.all([
        airtableList(process.env.AIRTABLE_TABLE_TASKS || 'Master Action Board', { maxRecords: 300 }),
        airtableList(process.env.AIRTABLE_TABLE_CONTACTS || 'CRM Contacts', { maxRecords: 300 }),
      ]);
      tasks    = taskRecs.map(r => fromAirtableRecord(r, TASKS_MAP));
      contacts = contactRecs.map(r => fromAirtableRecord(r, CONTACTS_MAP));
    } catch (e) { console.warn('granola-poll: context fetch failed:', e.message); }

    let processed = 0;
    const failures = [];
    for (const doc of fresh) {
      const id = docId(doc);
      try {
        const transcript = (await fetchTranscript(id)) || doc.notes_markdown || doc.notes || '';
        if (!transcript.trim()) { failures.push({ id, error: 'no transcript' }); continue; }

        const attendees = docPeople(doc);
        const parsed = await parseTranscript({
          transcript: transcript.slice(0, 150000),
          section: 'call-review',
          ctx: { tasks, contacts, attendees },
        });

        await sb.from('call_reviews').upsert({
          source:           'granola',
          external_id:      id,
          title:            docTitle(doc),
          call_date:        docDate(doc) || new Date().toISOString(),
          attendees,
          transcript,
          summary:          parsed?.summary || '',
          proposed_actions: parsed || {},
          status:           'pending',
        }, { onConflict: 'external_id', ignoreDuplicates: true });
        processed++;
      } catch (e) {
        console.error('granola-poll doc failed:', id, e.message);
        failures.push({ id, error: e.message });
      }
    }

    await sb.from('app_state').upsert({ state_key: 'granola:lastPoll', data: { ts: new Date().toISOString() } }, { onConflict: 'state_key' });
    return ok({ processed, failures });
  } catch (e) {
    console.error('granola-poll error:', e);
    return err(500, e.message);
  }
};
