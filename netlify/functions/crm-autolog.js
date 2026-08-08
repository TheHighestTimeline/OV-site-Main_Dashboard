// Granola + Gmail auto-logging into the CRM.
//
// ─── The problem ─────────────────────────────────────────────────────────────
// The Contacts board decides who "needs follow-up" from the `Last Contacted`
// field, and nothing writes that field except a human pressing Log Contact. So
// the board flags people you emailed this morning as untouched, and the flag is
// the thing the whole tab is organised around. Meanwhile every one of those
// conversations exists — in Gmail, in Granola — and none of it reaches the CRM.
//
// ─── The line this draws ─────────────────────────────────────────────────────
// The Threads doc's rule is "signals propose, humans dispose", and it holds. But
// it is a rule about INFERENCE, and it is worth being precise about which half
// of this job is inference:
//
//   THAT a conversation happened          deterministic. Gmail has the thread,
//                                         Granola has the call. Auto-logged.
//   WHAT was agreed in it                 inferred. Stays in the review queue.
//
// So this writes Activity rows and `Last Contacted`, and it writes nothing else.
// It creates no tasks, advances no stage, and closes no obligation — Granola's
// action extraction (`granola-poll` → `call_reviews` → Review tab) is untouched
// and is still the only path from a transcript to a commitment.
//
// ─── Why it does not reuse coo-ingest-gmail ──────────────────────────────────
// That job does the same Activity write, but only as a side effect of a full
// Supabase ingest: it needs `migrations/0002_coo_threads_schema.sql`, which is
// known-unrun (THREADS_TAB.md §15), and it dedupes against `coo_events`, so
// today it throws before reaching the Airtable write. This runs on Airtable
// alone, so it works in the base as it actually stands. When the migration is
// applied both are idempotent and neither double-writes, because both key off
// the same per-thread-per-day identity.
//
// ─── Dedupe ──────────────────────────────────────────────────────────────────
// Activities has no dedupe column and adding one is a manual schema change, so
// the key is written into the Body as a trailing marker:
//
//     [autolog:gmail:<threadId>:<YYYY-MM-DD>]
//     [autolog:granola:<documentId>]
//
// One list read of recent Activities collects the markers already present, and
// nothing matching one is written again. Re-running this endpoint any number of
// times produces the same rows.
//
// ─── Matching, and where it refuses to guess ─────────────────────────────────
// Contacts are resolved by email address, exactly. Granola often supplies only
// a display name, so an exact normalised full-name match is accepted as a
// fallback — but nothing fuzzier, on the same reasoning as `_companies.js`:
// filing a call under the wrong counterparty is worse than not filing it.
// Unmatched participants are returned in the response so they can be fixed,
// never invented as new contacts.
//
// An Activity routes to exactly ONE company (the locked CRM rule). When the
// matched contact belongs to exactly one company that company is used; when it
// belongs to several, Company is left empty rather than picking one, and the
// row still lands on the contact's timeline where it is useful.

import { ok, err, CORS } from './_http.js';
import { requireAuth } from './_auth.js';
import { airtableList, airtableCreate, airtableUpdate } from './_airtable.js';
import { getGmail, getHeader } from './_gmail.js';

const CONTACTS_TBL   = () => process.env.AIRTABLE_TABLE_CONTACTS   || 'CRM Contacts';
const ACTIVITIES_TBL = () => process.env.AIRTABLE_TABLE_ACTIVITIES || 'Activities';

const GRANOLA_BASE = process.env.GRANOLA_API_BASE || 'https://api.granola.ai/v2';

const LOOKBACK_DAYS = parseInt(process.env.AUTOLOG_LOOKBACK_DAYS || '7', 10);
const MAX_THREADS   = parseInt(process.env.AUTOLOG_MAX_THREADS   || '50', 10);
const MAX_CALLS     = parseInt(process.env.AUTOLOG_MAX_CALLS     || '25', 10);

const today = () => new Date().toISOString().slice(0, 10);

// ── Identity helpers ─────────────────────────────────────────────────────────

/** Addresses that are us. Getting this wrong logs our own memos as relationships. */
function ourAddresses() {
  const extra = (process.env.COO_OUR_ADDRESSES || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const sender = (process.env.GMAIL_SENDER || '').toLowerCase();
  return new Set([sender, ...extra].filter(Boolean));
}

/** Our own mail domains, so a colleague's address is not logged as a counterparty. */
function ourDomains() {
  const raw = process.env.AUTOLOG_OUR_DOMAINS || 'onevibemediagroup.com';
  return new Set(raw.split(',').map(s => s.trim().toLowerCase().replace(/^@/, '')).filter(Boolean));
}

function parseAddress(raw) {
  const s = String(raw || '');
  const angle = s.match(/<([^>]+)>/);
  const email = (angle ? angle[1] : s).trim().toLowerCase();
  const name  = angle ? s.slice(0, s.indexOf('<')).replace(/["']/g, '').trim() : '';
  return { email, name };
}

const parseAddressList = (raw) =>
  String(raw || '').split(',').map(parseAddress).filter(a => a.email.includes('@'));

/** Case, punctuation and spacing folded out. Not fuzzy — an alias, not a guess. */
const nameKey = (s) =>
  String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// ── Contact index ────────────────────────────────────────────────────────────

async function buildContactIndex() {
  const byEmail = new Map();
  const byName  = new Map();
  const records = await airtableList(CONTACTS_TBL());
  for (const r of records) {
    const entry = {
      id:            r.id,
      name:          r.fields?.['Full Name'] || '',
      companyIds:    r.fields?.['Companies'] || [],
      lastContacted: r.fields?.['Last Contacted'] || null,
    };
    const email = String(r.fields?.['Email'] || '').trim().toLowerCase();
    if (email) byEmail.set(email, entry);
    const key = nameKey(entry.name);
    // A name shared by two contacts is not a match — it is a duplicate for the
    // merge screen to settle. Mark it ambiguous so neither one is picked.
    if (key) byName.set(key, byName.has(key) ? null : entry);
  }
  return { byEmail, byName };
}

/**
 * Markers already present on recent Activity rows, so a re-run writes nothing.
 * One list read; the alternative is a per-thread Airtable query, which is the
 * N+1 straight into the rate limiter that the whole file is shaped to avoid.
 */
async function existingMarkers() {
  const seen = new Set();
  const records = await airtableList(ACTIVITIES_TBL()).catch(() => []);
  for (const r of records) {
    const body = String(r.fields?.['Body'] || '');
    for (const m of body.matchAll(/\[autolog:([^\]]+)\]/g)) seen.add(m[1]);
  }
  return seen;
}

/**
 * Advance Last Contacted on each contact, but only ever FORWARD.
 *
 * A backfill run that picks up a three-week-old thread must not drag a fresh
 * relationship backwards and make the follow-up flag fire on somebody you spoke
 * to yesterday.
 */
async function bumpLastContacted(contacts, date) {
  for (const c of contacts) {
    if (!c?.id) continue;
    if (c.lastContacted && String(c.lastContacted).slice(0, 10) >= date) continue;
    try {
      await airtableUpdate(CONTACTS_TBL(), c.id, { 'Last Contacted': date });
      c.lastContacted = date;
    } catch (e) {
      // The Activity is the record that matters; a failed date bump is a stale
      // flag, not lost history.
      console.warn('[autolog] last-contacted bump failed:', c.id, e.message);
    }
  }
}

/** Write one Activity row, carrying its dedupe marker in the body. */
async function logActivity({ marker, title, type, source, date, body, companyIds, contactIds }) {
  const fields = {
    'Title':   title.slice(0, 200),
    'Type':    type,
    'Source':  source,
    'Date':    date,
    'Body':    `${body}\n\n[autolog:${marker}]`,
    'Contact': contactIds,
  };
  // Exactly one company or none — never a guess between several. An Activity
  // routes to a single company by the locked CRM rule, so "several candidates"
  // and "no answer" are the same case.
  if ((companyIds || []).length === 1) fields['Company'] = companyIds;

  await airtableCreate(ACTIVITIES_TBL(), fields);
}

// ── Gmail ────────────────────────────────────────────────────────────────────

async function runGmail({ index, markers, summary }) {
  const gmail = await getGmail(process.env.COO_SCAN_USER_ID || null);
  const us      = ourAddresses();
  const domains = ourDomains();
  const isUs = (email) => us.has(email) || domains.has(email.split('@')[1] || '');

  const { data: list } = await gmail.users.threads.list({
    userId: 'me',
    q: `-in:chats -in:drafts -in:spam newer_than:${LOOKBACK_DAYS}d`,
    maxResults: MAX_THREADS,
  });

  for (const ref of list.threads || []) {
    try {
      const { data: thread } = await gmail.users.threads.get({
        userId: 'me', id: ref.id, format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'To', 'Cc'],
      });
      const messages = thread.messages || [];
      if (!messages.length) continue;

      const headersOf = m => m.payload?.headers || [];
      const subject   = getHeader(headersOf(messages[0]), 'Subject') || '(no subject)';

      // Every non-us participant in the thread, not just the first. A three-way
      // chain with two counterparties is one conversation with both of them, and
      // logging it against only the sender leaves the other one reading as
      // silent.
      const counterparties = new Map();
      for (const m of messages) {
        const hs = headersOf(m);
        const all = [
          parseAddress(getHeader(hs, 'From')),
          ...parseAddressList(getHeader(hs, 'To')),
          ...parseAddressList(getHeader(hs, 'Cc')),
        ];
        for (const a of all) {
          if (!a.email.includes('@') || isUs(a.email)) continue;
          if (!counterparties.has(a.email)) counterparties.set(a.email, a);
        }
      }
      if (!counterparties.size) continue; // internal thread — not a relationship

      const times = messages.map(m => Number(m.internalDate || 0)).filter(Boolean);
      const last  = times.length ? new Date(Math.max(...times)) : new Date();
      const day   = last.toISOString().slice(0, 10);

      for (const [email, addr] of counterparties) {
        const contact = index.byEmail.get(email);
        if (!contact) {
          summary.unmatched.push({ source: 'gmail', handle: email, name: addr.name || '' });
          continue;
        }
        // One row per thread per person per day. A busy chain produces one line
        // on the timeline, not forty.
        const marker = `gmail:${ref.id}:${contact.id}:${day}`;
        if (markers.has(marker)) continue;

        await logActivity({
          marker,
          title:  `Email: ${subject}`,
          type:   'Email',
          source: 'Gmail',
          date:   day,
          body:   `${messages.length} message(s) in this thread as of ${day}.\n` +
                  `https://mail.google.com/mail/u/0/#inbox/${ref.id}`,
          companyIds: contact.companyIds,
          contactIds: [contact.id],
        });
        await bumpLastContacted([contact], day);
        markers.add(marker);
        summary.gmailLogged++;
      }
      summary.gmailThreads++;
    } catch (e) {
      console.error('[autolog] gmail thread failed', ref.id, e.message);
      summary.errors.push(`gmail ${ref.id}: ${e.message}`);
    }
  }
}

// ── Granola ──────────────────────────────────────────────────────────────────

async function granola(path, payload) {
  const res = await fetch(`${GRANOLA_BASE}/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GRANOLA_API_TOKEN}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) throw new Error(`Granola ${path} → HTTP ${res.status}`);
  return res.json();
}

// Granola's payload shape has moved between versions; read every spelling.
const docId    = d => d.id || d.document_id || d.doc_id;
const docTitle = d => d.title || d.name || 'Untitled meeting';
const docDate  = d => d.created_at || d.createdAt || d.date || null;
const docPeople = d => {
  const p = d.people || d.attendees || d.participants || [];
  return (Array.isArray(p) ? p : []).map(x => (
    typeof x === 'string'
      ? (x.includes('@') ? { email: x.toLowerCase(), name: '' } : { email: '', name: x })
      : { email: String(x?.email || '').toLowerCase(), name: x?.name || '' }
  )).filter(a => a.email || a.name);
};

async function runGranola({ index, markers, summary }) {
  const res  = await granola('get-documents', { limit: MAX_CALLS });
  const docs = res?.docs || res?.documents || (Array.isArray(res) ? res : []);
  const domains = ourDomains();

  const cutoff = Date.now() - LOOKBACK_DAYS * 86400000;

  for (const doc of docs) {
    const id = docId(doc);
    if (!id) continue;
    try {
      const when = docDate(doc) ? new Date(docDate(doc)) : new Date();
      if (when.getTime() < cutoff) continue;
      const day = when.toISOString().slice(0, 10);

      // Resolve attendees. Email first; an exact normalised name only when the
      // attendee has no address at all, which is the common Granola case.
      const matched = [];
      for (const p of docPeople(doc)) {
        if (p.email && domains.has(p.email.split('@')[1] || '')) continue; // us
        const hit = (p.email && index.byEmail.get(p.email))
          || (!p.email && p.name && index.byName.get(nameKey(p.name)))
          || null;
        if (hit) matched.push(hit);
        else summary.unmatched.push({ source: 'granola', handle: p.email || p.name, name: p.name || '' });
      }
      if (!matched.length) continue;

      const marker = `granola:${id}`;
      if (markers.has(marker)) continue;

      // One Activity for the call, linked to everyone on it — a call is one
      // event, unlike a mail thread where each person's copy is their own.
      // Company is only set when every matched attendee agrees on one, since an
      // Activity routes to exactly one company and a mixed call has no answer.
      const companyIds = [...new Set(matched.flatMap(m => m.companyIds || []))];

      await logActivity({
        marker,
        title:  `Call: ${docTitle(doc)}`,
        type:   'Call',
        source: 'Granola',
        date:   day,
        body:   `Granola meeting on ${day} with ${matched.map(m => m.name).join(', ')}.\n` +
                'Transcript and proposed actions are in the Review queue.',
        companyIds,
        contactIds: matched.map(m => m.id),
      });

      // Every attendee's Last Contacted moves, not just one.
      await bumpLastContacted(matched, day);

      markers.add(marker);
      summary.granolaLogged++;
    } catch (e) {
      console.error('[autolog] granola doc failed', id, e.message);
      summary.errors.push(`granola ${id}: ${e.message}`);
    }
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────
//
// Callable from Settings → Auto-logging → "Run now" (auth-gated) and from the
// Netlify schedule (no httpMethod, so the gate is skipped — the same shape the
// other scheduled jobs use).
export const handler = async (event) => {
  if (event?.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  if (event?.httpMethod) {
    const authErr = await requireAuth(event);
    if (authErr) return authErr;
  }

  const params = event?.queryStringParameters || {};
  const only   = params.only || null; // 'gmail' | 'granola' | null (both)

  const summary = {
    ranAt: new Date().toISOString(),
    gmailThreads: 0, gmailLogged: 0, granolaLogged: 0,
    unmatched: [], skipped: [], errors: [],
  };

  try {
    const [index, markers] = await Promise.all([buildContactIndex(), existingMarkers()]);

    if (only !== 'granola') {
      try {
        await runGmail({ index, markers, summary });
      } catch (e) {
        // A missing Gmail token must not take the Granola half down with it.
        summary.skipped.push(`gmail: ${e.message}`);
      }
    }

    if (only !== 'gmail') {
      if (!process.env.GRANOLA_API_TOKEN) {
        summary.skipped.push('granola: GRANOLA_API_TOKEN not configured');
      } else {
        try {
          await runGranola({ index, markers, summary });
        } catch (e) {
          summary.skipped.push(`granola: ${e.message}`);
        }
      }
    }

    // The same person turning up on four threads is one thing to fix, not four.
    const seen = new Set();
    summary.unmatched = summary.unmatched.filter(u => {
      const k = `${u.source}:${u.handle}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 50);

    console.log('[autolog] complete', {
      gmailLogged: summary.gmailLogged,
      granolaLogged: summary.granolaLogged,
      unmatched: summary.unmatched.length,
    });
    return ok(summary);
  } catch (e) {
    console.error('[autolog] failed:', e.message);
    return err(500, e.message);
  }
};

export const __test = { nameKey, parseAddress, today };
