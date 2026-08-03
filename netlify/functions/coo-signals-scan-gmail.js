// Mail-based evidence detectors (WP11). Everything here is INFERRED.
//
// Three detectors, all of which only ever PROPOSE:
//   1. eSignature completion mail  (Google eSignature, DocuSign, Dropbox Sign)
//   2. Outbound mail carrying a document attachment  → doc_sent
//   3. Inbound "requested access" mail               → access_requested
//
// Why inferred and not deterministic: a subject line saying "Completed: NCNDA"
// is a guess about the world, not an observation of it. The sender could be
// notifying about someone else's document, the name match could be wrong, the
// attachment could be a draft. So these land in the Resolved? queue with their
// evidence linked, and a human spends one tap.
//
// This mirrors what Tanner was doing by hand on 2026-07-30 with
// `from:esignature-noreply@google.com newer_than:2d`. The point is to automate
// the search, not the judgment.
//
// Scheduled, plus callable for a manual run.

import { ok, err, CORS } from './_http.js';
import { requireCoo } from './_cooAccess.js';
import { getSupabase } from './_supabase.js';
import { getGmail, getHeader } from './_gmail.js';
import { TB, listRecords } from './_airtable.js';
import { routeParticipation, participationsConfigured } from './_participations.js';

const SYNC_KEY   = 'gmail_signals';
const SCAN_OWNER = process.env.COO_SCAN_USER_ID || null;

const CONTACTS_TBL = () => process.env.AIRTABLE_TABLE_CONTACTS || TB.CONTACTS;

// Senders that mean "a signature workflow finished". Extendable by env because
// Tanner may add a provider without a deploy.
const ESIGN_SENDERS = [
  'esignature-noreply@google.com',
  'dse@docusign.net',
  'dse_na3@docusign.net',
  'noreply@docusign.net',
  'noreply@hellosign.com',
  'noreply@dropboxsign.com',
  ...(process.env.COO_ESIGN_SENDERS || '').split(',').map(s => s.trim()).filter(Boolean),
];

// Subject words that indicate completion rather than a request to sign. Without
// this, every "Please sign" invitation would read as an executed agreement.
const COMPLETION_WORDS = ['completed', 'signed', 'executed', 'fully signed', 'all parties'];
const REQUEST_WORDS    = ['please sign', 'signature requested', 'action required', 'reminder', 'awaiting'];

const DOC_EXTENSIONS = ['.pdf', '.docx', '.doc'];

function parseAddress(raw) {
  const s = String(raw || '');
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim().toLowerCase();
}

export const handler = async (event) => {
  if (event?.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  if (event?.httpMethod) {
    const authErr = await requireCoo(event);
    if (authErr) return authErr;
  }

  const supabase = getSupabase();
  const summary  = { scanned: 0, docSigned: 0, docSent: 0, accessRequested: 0, errors: [] };

  try {
    const gmail = await getGmail(SCAN_OWNER);
    const days  = parseInt(process.env.COO_SIGNAL_LOOKBACK_DAYS || '7', 10);

    const contactIndex = await buildContactIndex();

    // ── 1 + 3: inbound notifications ─────────────────────────────────────────
    const esignQuery = `(${ESIGN_SENDERS.map(s => `from:${s}`).join(' OR ')}) newer_than:${days}d`;
    await scanQuery({
      gmail, supabase, summary, contactIndex,
      query: esignQuery,
      handle: handleEsignMessage,
    });

    await scanQuery({
      gmail, supabase, summary, contactIndex,
      query: `"requested access" newer_than:${days}d`,
      handle: handleAccessRequest,
    });

    // ── 2: outbound mail with a document attached ────────────────────────────
    await scanQuery({
      gmail, supabase, summary, contactIndex,
      query: `in:sent has:attachment newer_than:${days}d`,
      handle: handleOutboundAttachment,
    });

    await supabase.from('coo_sync_state').upsert({
      source: SYNC_KEY,
      last_run_at: new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      last_error: summary.errors.length ? summary.errors.slice(0, 3).join(' | ') : null,
    }, { onConflict: 'source' });

    console.log('[coo-gmail-signals] complete', summary);
    return ok(summary);
  } catch (e) {
    const msg = e?.message || String(e);
    console.error('[coo-gmail-signals] failed:', msg);
    await supabase.from('coo_sync_state').upsert({
      source: SYNC_KEY, last_run_at: new Date().toISOString(), last_error: msg,
    }, { onConflict: 'source' });
    return err(500, msg);
  }
};

async function buildContactIndex() {
  const byEmail = {};
  const byName  = [];
  try {
    const recs = await listRecords(CONTACTS_TBL(), { fields: ['Full Name', 'Email'] });
    for (const r of recs) {
      const email = String(r.fields?.['Email'] || '').trim().toLowerCase();
      const name  = String(r.fields?.['Full Name'] || '').trim();
      if (email) byEmail[email] = { id: r.id, name };
      if (name)  byName.push({ id: r.id, name, lower: name.toLowerCase() });
    }
  } catch (e) {
    console.error('[coo-gmail-signals] contact index failed:', e.message);
  }
  return { byEmail, byName };
}

async function scanQuery({ gmail, supabase, summary, contactIndex, query, handle }) {
  try {
    const { data } = await gmail.users.messages.list({
      userId: 'me', q: query, maxResults: 50,
    });
    for (const ref of data.messages || []) {
      try {
        const { data: msg } = await gmail.users.messages.get({
          userId: 'me', id: ref.id, format: 'full',
        });
        summary.scanned++;
        await handle({ msg, supabase, summary, contactIndex });
      } catch (e) {
        summary.errors.push(`${ref.id}: ${e.message}`);
      }
    }
  } catch (e) {
    summary.errors.push(`query "${query}": ${e.message}`);
  }
}

/**
 * Resolve a counterparty from a name mentioned in a subject line.
 *
 * Deliberately conservative: a full-name substring match only. Matching on a
 * first name alone would attach "Completed: NCNDA - Greg" to whichever Greg
 * sorted first, and a confidently wrong link is worse than no link.
 */
function matchContactByName(text, contactIndex) {
  const hay = String(text || '').toLowerCase();
  const hits = contactIndex.byName.filter(c => c.lower.length > 4 && hay.includes(c.lower));
  return hits.length === 1 ? hits[0] : null;
}

async function resolveTarget(contact) {
  if (!contact) return { contactId: null, participationId: null, workstreamId: null };
  if (!participationsConfigured()) return { contactId: contact.id, participationId: null, workstreamId: null };
  try {
    const p = await routeParticipation(contact.id);
    return { contactId: contact.id, participationId: p?.id || null, workstreamId: p?.workstreamId || null };
  } catch {
    return { contactId: contact.id, participationId: null, workstreamId: null };
  }
}

async function propose({ supabase, summary, signalType, dedupe, title, detail, url, target, confidence, msgDate, evidenceRef, source = 'gmail' }) {
  const when = msgDate || new Date().toISOString();

  await supabase.from('coo_signals').upsert({
    participation_airtable_id: target.participationId,
    contact_airtable_id:       target.contactId,
    signal_type:      signalType,
    kind:             'inferred',
    confidence_score: confidence,
    source,
    evidence_ref:     evidenceRef,
    evidence_url:     url,
    detected_at:      when,
    // Inferred signals are ALWAYS pending. There is no path here that
    // auto-applies, by design.
    status:           'pending',
    dedupe_key:       dedupe,
  }, { onConflict: 'dedupe_key', ignoreDuplicates: true });

  await supabase.from('coo_events').upsert({
    participation_airtable_id: target.participationId,
    contact_airtable_id:       target.contactId,
    workstream_airtable_id:    target.workstreamId,
    event_type:  signalType === 'doc_signed' ? 'doc_signed'
               : signalType === 'doc_sent'   ? 'doc_sent'
               : 'access_requested',
    occurred_at: when,
    title,
    detail,
    actor:       signalType === 'doc_sent' ? 'us' : 'them',
    source,
    ref_url:     url,
    // Hollow on the timeline, tagged UNCONFIRMED, until someone confirms it.
    confidence:  'inferred',
    dedupe_key:  dedupe,
  }, { onConflict: 'dedupe_key', ignoreDuplicates: true });

  summary[signalType === 'doc_signed' ? 'docSigned'
        : signalType === 'doc_sent'   ? 'docSent'
        : 'accessRequested']++;
}

// ── Detector 1: eSignature completion ───────────────────────────────────────

async function handleEsignMessage({ msg, supabase, summary, contactIndex }) {
  const hs      = msg.payload?.headers || [];
  const subject = getHeader(hs, 'Subject') || '';
  const lower   = subject.toLowerCase();

  // A signature REQUEST is not a completion. Drop those before anything else,
  // or every "Please sign" reminder becomes a false executed agreement.
  if (REQUEST_WORDS.some(w => lower.includes(w))) return;
  if (!COMPLETION_WORDS.some(w => lower.includes(w))) return;

  const contact = matchContactByName(subject, contactIndex)
               || matchContactByName(msg.snippet, contactIndex);
  const target  = await resolveTarget(contact);
  const when    = new Date(Number(msg.internalDate || Date.now())).toISOString();

  await propose({
    supabase, summary,
    signalType: 'doc_signed',
    dedupe: `gmail:esign:${msg.id}`,
    title:  subject || 'Signature completed',
    detail: `${msg.snippet || ''}\n\nMatched contact: ${contact?.name || 'none — needs assignment'}`.trim(),
    url:    `https://mail.google.com/mail/u/0/#inbox/${msg.threadId}`,
    target,
    // Name-matched notifications are decent evidence. Unmatched ones are a
    // notification that something happened to somebody, which is much weaker.
    confidence: contact ? 0.8 : 0.4,
    msgDate: when,
    evidenceRef: `gmail:${msg.id}`,
  });
}

// ── Detector 2: outbound mail carrying a document ───────────────────────────

async function handleOutboundAttachment({ msg, supabase, summary, contactIndex }) {
  const hs   = msg.payload?.headers || [];
  const to   = parseAddress(getHeader(hs, 'To'));
  const subject = getHeader(hs, 'Subject') || '';

  const names = [];
  (function walk(p) {
    if (!p) return;
    if (p.filename && DOC_EXTENSIONS.some(ext => p.filename.toLowerCase().endsWith(ext))) {
      names.push(p.filename);
    }
    for (const part of p.parts || []) walk(part);
  })(msg.payload);

  if (!names.length) return;

  const contact = contactIndex.byEmail[to] || matchContactByName(subject, contactIndex);
  if (!contact) return;   // an attachment to an unknown address proves nothing useful

  const target = await resolveTarget(contact);
  const when   = new Date(Number(msg.internalDate || Date.now())).toISOString();

  await propose({
    supabase, summary,
    signalType: 'doc_sent',
    dedupe: `gmail:docsent:${msg.id}`,
    title:  `Sent ${names.join(', ')} to ${contact.name}`,
    detail: subject,
    url:    `https://mail.google.com/mail/u/0/#sent/${msg.threadId}`,
    target,
    confidence: 0.7,
    msgDate: when,
    evidenceRef: `gmail:${msg.id}`,
  });
}

// ── Detector 3: access request mail ─────────────────────────────────────────

async function handleAccessRequest({ msg, supabase, summary, contactIndex }) {
  const hs      = msg.payload?.headers || [];
  const subject = getHeader(hs, 'Subject') || '';
  const from    = parseAddress(getHeader(hs, 'From'));

  const text = `${subject} ${msg.snippet || ''}`.toLowerCase();
  if (!text.includes('requested access')) return;

  // Drive sends these from a no-reply address, so the requester's identity is
  // in the body rather than the From header. Try both.
  const contact = contactIndex.byEmail[from]
               || matchContactByName(`${subject} ${msg.snippet}`, contactIndex);
  const target  = await resolveTarget(contact);
  const when    = new Date(Number(msg.internalDate || Date.now())).toISOString();

  await propose({
    supabase, summary,
    signalType: 'access_requested',
    dedupe: `gmail:accessreq:${msg.id}`,
    title:  subject || 'Access requested',
    detail: msg.snippet || null,
    url:    `https://mail.google.com/mail/u/0/#inbox/${msg.threadId}`,
    target,
    confidence: contact ? 0.75 : 0.4,
    msgDate: when,
    evidenceRef: `gmail:${msg.id}`,
  });
}
