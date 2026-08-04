// Work out whether a contact's NCNDA is actually signed, and say how sure it is.
//
// THREE SOURCES, RANKED BY HOW MUCH THEY PROVE:
//
//   certain   A Documents record with a Signed Date. Somebody recorded it.
//   high      A signature-service completion email naming this counterparty
//             ("completed", "all parties have signed"). The service only sends
//             those once everyone has actually signed.
//   medium    A signature-service email about this counterparty that is NOT a
//             completion notice — sent, viewed, reminder. Proves the document
//             exists and is in flight, not that it is signed.
//   low       A Drive file whose NAME says signed/executed. Filenames lie.
//   none      Nothing found.
//
// THE CONFIDENCE IS THE POINT. A detector that silently reports "signed" is
// worse than no detector: the whole reason NCNDA status is gated is that acting
// on an unsigned NCNDA is a real problem. So this endpoint READS ONLY. It never
// writes a Signed Date, never moves a stage, and never touches the evidence gate
// — it reports what it found, with what it inferred it from, and a human decides.
//
// GET ?contactId=rec…&entity=OVMG

import { ok, err, CORS } from './_http.js';
import { requireAuth, getUser } from './_auth.js';
import { TB, listRecordsLenient, getRecord } from './_airtable.js';

const CONTACTS_TBL = () => process.env.AIRTABLE_TABLE_CONTACTS  || TB.CONTACTS;
const DOCS_TBL     = () => process.env.AIRTABLE_TABLE_DOCUMENTS || TB.DOCUMENTS;

// Senders whose mail means something about a signature. Anyone can write the
// word "signed" in an email; these services only say it when it happened.
const SIG_SENDERS = ['signwell', 'docusign', 'hellosign', 'dropboxsign', 'pandadoc', 'adobesign', 'echosign'];
const DONE_WORDS  = ['completed', 'all parties have signed', 'has been signed', 'fully executed', 'is complete'];

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function lc(v)  { return String(v || '').toLowerCase(); }

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  try {
    const q         = event.queryStringParameters || {};
    const contactId = q.contactId;
    const entity    = q.entity || '';
    if (!contactId) return err(400, 'contactId is required');

    const rec = await getRecord(CONTACTS_TBL(), contactId);
    if (!rec) return err(404, 'Contact not found');

    const name  = rec.fields?.['Full Name'] || '';
    const email = lc(rec.fields?.['Email']);
    const evidence = [];

    // ── 1. A recorded Signed Date beats everything ──────────────────────────
    let doc = null;
    try {
      const docs = await listRecordsLenient(DOCS_TBL(), {
        fields: ['Name', 'Type', 'Signed Date', 'Drive Link', 'Contact', 'Entity'],
      });
      doc = docs.find(d =>
        lc(d.fields?.['Type']) === 'ncnda' &&
        arr(d.fields?.['Contact']).includes(contactId) &&
        (!entity || !d.fields?.['Entity'] || d.fields['Entity'] === entity));

      if (doc?.fields?.['Signed Date']) {
        return ok({
          contactId,
          entity,
          status: 'signed',
          confidence: 'certain',
          confidenceScore: 100,
          summary: `Signed ${String(doc.fields['Signed Date']).slice(0, 10)}, recorded on the document.`,
          evidence: [{
            source: 'airtable',
            confidence: 'certain',
            detail: `Documents record "${doc.fields?.['Name'] || doc.id}" carries a Signed Date.`,
            url: doc.fields?.['Drive Link'] || null,
          }],
          checkedAt: new Date().toISOString(),
        });
      }
      if (doc) {
        evidence.push({
          source: 'airtable',
          confidence: 'none',
          detail: `Documents record "${doc.fields?.['Name'] || doc.id}" is on file but has NO Signed Date.`,
          url: doc.fields?.['Drive Link'] || null,
        });
      }
    } catch (e) {
      console.warn('[ncnda-detect] document read failed:', e.message);
    }

    // ── 2. Signature-service mail ───────────────────────────────────────────
    let best = { status: doc ? 'on_file' : 'none', confidence: 'none', score: 0 };
    if (email || name) {
      try {
        const user = await getUser(event).catch(() => null);
        const { getGmail, getHeader } = await import('./_gmail.js');
        const gmail = await getGmail(user?.id);

        const from  = SIG_SENDERS.map(s => `from:${s}`).join(' OR ');
        const who   = email ? `"${email}"` : `"${name}"`;
        const query = `(${from}) ${who} newer_than:2y`;

        const { data } = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 15 });
        for (const m of data.messages || []) {
          const { data: msg } = await gmail.users.messages.get({
            userId: 'me', id: m.id, format: 'metadata',
            metadataHeaders: ['Subject', 'From', 'Date'],
          });
          const subject = getHeader(msg.payload?.headers, 'Subject') || '';
          const sender  = getHeader(msg.payload?.headers, 'From') || '';
          const date    = getHeader(msg.payload?.headers, 'Date') || '';
          const hay     = lc(`${subject} ${msg.snippet || ''}`);

          // Only count mail that is actually about an NCNDA/NDA, or the match is
          // any signature request this person was ever part of.
          if (!/ncnda|nda|non-?disclosure|non-?circumvent/i.test(hay)) continue;

          const done = DONE_WORDS.some(w => hay.includes(w));
          const item = {
            source: 'gmail',
            confidence: done ? 'high' : 'medium',
            detail: done
              ? `Completion notice: "${subject}" from ${sender}`
              : `In flight (not a completion notice): "${subject}" from ${sender}`,
            date: date || null,
          };
          evidence.push(item);

          if (done && best.score < 80)      best = { status: 'signed',    confidence: 'high',   score: 80 };
          else if (!done && best.score < 50) best = { status: 'in_flight', confidence: 'medium', score: 50 };
        }
      } catch (e) {
        // No Gmail auth, or the scan failed. That is a gap in coverage, not an
        // answer, so it is reported rather than swallowed into "not signed".
        evidence.push({
          source: 'gmail',
          confidence: 'none',
          detail: `Could not search mail: ${e.message}`,
        });
      }
    }

    // ── 3. Drive filename, lowest trust ─────────────────────────────────────
    const link = doc?.fields?.['Drive Link'];
    if (link) {
      const idMatch = String(link).match(/[-\w]{25,}/);
      if (idMatch) {
        try {
          const user = await getUser(event).catch(() => null);
          const { getDrive, getFileMeta } = await import('./_drive.js');
          const drive = await getDrive(user?.id);
          const meta  = await getFileMeta(drive, idMatch[0]);
          const fname = lc(meta?.name);
          const looksSigned = /signed|executed|countersigned|fully.?exec/.test(fname);
          evidence.push({
            source: 'drive',
            confidence: looksSigned ? 'low' : 'none',
            detail: looksSigned
              ? `Drive file is named "${meta.name}", which reads as signed. A filename is not proof.`
              : `Drive file "${meta?.name || idMatch[0]}" exists; its name says nothing about signature.`,
            date: meta?.modifiedTime || null,
          });
          if (looksSigned && best.score < 25) best = { status: 'maybe_signed', confidence: 'low', score: 25 };
        } catch (e) {
          evidence.push({ source: 'drive', confidence: 'none', detail: `Could not read the Drive file: ${e.message}` });
        }
      }
    }

    const SUMMARY = {
      signed:       'A signature service reported this completed. Confirm and set the Signed Date to make it count.',
      maybe_signed: 'Only a filename suggests this is signed. Open it and check before relying on it.',
      in_flight:    'Sent for signature, with no completion notice found. Not signed.',
      on_file:      'A document is on file with no Signed Date and nothing found to confirm it.',
      none:         'Nothing found in documents, mail or Drive.',
    };

    return ok({
      contactId,
      entity,
      status:     best.status,
      confidence: best.confidence,
      confidenceScore: best.score,
      summary:    SUMMARY[best.status],
      // Never written automatically. The gate exists because acting on an
      // unsigned NCNDA is a real problem; a detector that quietly says "signed"
      // is worse than no detector.
      applied:    false,
      evidence,
      checkedAt:  new Date().toISOString(),
    });
  } catch (e) {
    console.error('[ncnda-detect]', e?.message || String(e));
    return err(500, e?.message || 'NCNDA detection failed');
  }
};
