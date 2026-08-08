// Drive documents that probably belong to a record but are not filed against it.
//
// The gap this closes: a contract gets signed and dropped in the Drive, and the
// CRM never hears about it. Documents already has a Drive Link column and links
// to Contact / Company / Deal — nothing was scanning the Drive for files that
// ought to have a row.
//
// Same contract as every other suggester here: read-only, every item carries a
// reason and a confidence, and NOTHING is written until someone accepts it.
// The client keeps a "do not suggest this again" list, so a file rejected once
// stops being offered.
//
// GET ?kind=opportunity|contact|company|task&id=rec…
//   → { items: [{ id, name, url, modifiedTime, reason, confidence }] }
//
// Drive access is per-user OAuth. When the caller has not connected Google this
// returns an empty list with a note rather than an error — a missing optional
// integration should not make a card look broken.

import { ok, err, CORS } from './_http.js';
import { requireAuth, getUser } from './_auth.js';
import { TB, listRecordsLenient, getRecord } from './_airtable.js';
import { listRecentFiles } from './_drive.js';

const DOCS_TBL      = () => process.env.AIRTABLE_TABLE_DOCUMENTS     || 'Documents';
const CONTACTS_TBL  = () => process.env.AIRTABLE_TABLE_CONTACTS      || TB.CONTACTS;
const OPPS_TBL      = () => process.env.AIRTABLE_TABLE_OPPORTUNITIES || TB.OPPORTUNITIES;
const COMPANIES_TBL = () => process.env.AIRTABLE_TABLE_COMPANIES     || TB.COMPANIES;
const TASKS_TBL     = () => process.env.AIRTABLE_TABLE_TASKS         || TB.TASKS;

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }

// The expensive half of this job — a paged Drive listing plus a full read of
// Documents — is IDENTICAL for every record. Opening five cards in a row would
// otherwise mean five Drive scans and five table reads for the same answer.
//
// Netlify reuses a warm container across invocations, so a short-lived cache
// here turns those five into one. Deliberately short: a document filed a minute
// ago should stop being suggested, and this is a convenience, not a source of
// truth.
const SCAN_TTL_MS = 3 * 60 * 1000;
const scanCache = new Map();   // key -> { at, value }

async function cached(key, fn) {
  const hit = scanCache.get(key);
  if (hit && Date.now() - hit.at < SCAN_TTL_MS) return hit.value;
  const value = await fn();
  scanCache.set(key, { at: Date.now(), value });
  return value;
}

// Words that appear in half the Drive and mean nothing on their own. Matching
// on one of these is how a "Meeting Notes" doc gets filed under whichever deal
// happens to have "notes" in its name.
const NOISE = new Set([
  'the', 'and', 'for', 'with', 'from', 'copy', 'final', 'draft', 'v1', 'v2',
  'signed', 'executed', 'agreement', 'contract', 'document', 'notes', 'meeting',
  'deck', 'memo', 'letter', 'form', 'template', 'untitled', 'shared', 'export',
  'llc', 'inc', 'ltd', 'corp', 'company', 'group', 'holdings', 'partners',
  'capital', 'fund', 'ventures', 'project', 'deal', 'raise', 'round', 'tier',
  'family', 'friends', 'office', 'offices', 'management', 'advisors', 'trust',
]);

function tokens(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/, '')                 // drop a file extension
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(t => t.length >= 4 && !NOISE.has(t));
}

/** The Drive file id inside a link, so an existing Document row can be matched. */
function fileIdFromLink(url) {
  const s = String(url || '');
  const m = s.match(/\/d\/([A-Za-z0-9_-]{20,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{20,})/);
  return m ? m[1] : null;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const authErr = await requireAuth(event);
  if (authErr) return authErr;

  const q = event.queryStringParameters || {};
  const kind = String(q.kind || '').toLowerCase();
  const id   = q.id;
  if (!id)   return err(400, 'id is required');
  if (!['opportunity', 'contact', 'company', 'task'].includes(kind)) {
    return err(400, 'kind must be opportunity, contact, company or task');
  }

  try {
    const user = await getUser(event).catch(() => null);

    // What we are looking for: the record's own name plus the names of the
    // people and companies around it. A signed NCNDA is far more likely to be
    // named after the counterparty than after the deal.
    const { label, needles } = await needlesFor(kind, id);
    if (!needles.length) {
      return ok({ items: [], note: 'Nothing distinctive to match on for this record.' });
    }

    let files;
    try {
      files = await cached(`drive:${user?.id || 'anon'}`,
        () => listRecentFiles({ userId: user?.id, limit: 250 }));
    } catch (e) {
      // No Google connection, revoked token, missing scope — all the same to
      // the caller: there is nothing to suggest right now, and it is not an error.
      console.error('[drive-suggest] drive unavailable:', e?.message || String(e));
      return ok({ items: [], note: 'Google Drive is not connected for this account, so there is nothing to scan.' });
    }

    // Already filed. Matching on the Drive file id rather than the raw URL
    // because the same document is reachable through several link shapes.
    const docs = await cached('docs',
      () => listRecordsLenient(DOCS_TBL(), { fields: ['Drive Link'] }).catch(() => []));
    const known = new Set();
    for (const d of docs) {
      const fid = fileIdFromLink(d.fields?.['Drive Link']);
      if (fid) known.add(fid);
    }

    const items = [];
    for (const f of files) {
      if (known.has(f.id)) continue;
      const ft = new Set(tokens(f.name));
      if (!ft.size) continue;

      let best = null;
      for (const n of needles) {
        const hits = n.tokens.filter(t => ft.has(t));
        if (!hits.length) continue;
        // Two distinctive words, or one long enough to be a proper noun. One
        // short shared word is not evidence, it is a coincidence.
        const strong = hits.length >= 2 || hits.some(t => t.length >= 7);
        const cand = {
          confidence: n.weight === 'name' && strong ? 'high' : strong ? 'medium' : 'low',
          confidenceScore: (n.weight === 'name' ? 40 : 20) + (strong ? 40 : 10),
          reason: `“${f.name}” shares "${hits.join('", "')}" with ${n.label}.`,
        };
        if (!best || cand.confidenceScore > best.confidenceScore) best = cand;
      }
      if (!best || best.confidenceScore < 30) continue;

      items.push({
        id: f.id,
        name: f.name,
        url: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
        mimeType: f.mimeType || '',
        modifiedTime: f.modifiedTime || '',
        ...best,
      });
    }

    items.sort((a, b) => b.confidenceScore - a.confidenceScore ||
      String(b.modifiedTime).localeCompare(String(a.modifiedTime)));

    return ok({ kind, id, label, items: items.slice(0, 40), applied: false, generatedAt: new Date().toISOString() });
  } catch (e) {
    console.error('[drive-suggest]', e?.message || String(e));
    return err(500, e?.message || 'Could not scan the Drive');
  }
};

/**
 * The names worth matching a filename against, for one record.
 *
 * `weight: 'name'` is the record's own name — the strongest thing to match on.
 * People and companies around it are weaker but catch the common case where a
 * document is named after who signed it rather than what it is for.
 */
async function needlesFor(kind, id) {
  const out = [];
  const push = (label, text, weight) => {
    const t = tokens(text);
    if (t.length) out.push({ label, tokens: t, weight });
  };

  if (kind === 'opportunity') {
    const rec = await getRecord(OPPS_TBL(), id);
    if (!rec) throw new Error('Opportunity not found');
    const name = rec.fields?.['Opportunity Name'] || '';
    push(`this deal’s name`, name, 'name');

    const [contacts, companies] = await Promise.all([
      hydrate(CONTACTS_TBL(), arr(rec.fields?.['Associated Contact']), 'Full Name'),
      hydrate(COMPANIES_TBL(), arr(rec.fields?.['Companies']), 'Name'),
    ]);
    for (const n of contacts) push(n, n, 'related');
    for (const n of companies) push(n, n, 'related');
    return { label: name, needles: out };
  }

  if (kind === 'contact') {
    const rec = await getRecord(CONTACTS_TBL(), id);
    if (!rec) throw new Error('Contact not found');
    const name = rec.fields?.['Full Name'] || '';
    push('their name', name, 'name');
    for (const n of await hydrate(COMPANIES_TBL(), arr(rec.fields?.['Companies']), 'Name')) {
      push(n, n, 'related');
    }
    return { label: name, needles: out };
  }

  if (kind === 'company') {
    const rec = await getRecord(COMPANIES_TBL(), id);
    if (!rec) throw new Error('Company not found');
    const name = rec.fields?.['Name'] || '';
    push('the company name', name, 'name');
    return { label: name, needles: out };
  }

  // task
  const rec = await getRecord(TASKS_TBL(), id);
  if (!rec) throw new Error('Task not found');
  const name = rec.fields?.['Action Name'] || '';
  push('the task name', name, 'name');
  for (const n of await hydrate(OPPS_TBL(), arr(rec.fields?.['Opportunity']), 'Opportunity Name')) {
    push(n, n, 'name');   // the deal a task belongs to is as strong as the task itself
  }
  return { label: name, needles: out };
}

/** Names for a set of linked record ids. Missing rows are simply skipped. */
async function hydrate(table, ids, nameField) {
  if (!ids.length) return [];
  // Cached for the same reason as the Drive listing: this is one full table
  // read that every record in the base would otherwise repeat.
  const rows = await cached(`names:${table}:${nameField}`,
    () => listRecordsLenient(table, { fields: [nameField] }).catch(() => []));
  const byId = Object.fromEntries(rows.map(r => [r.id, r.fields?.[nameField] || '']));
  return ids.map(i => byId[i]).filter(Boolean);
}
