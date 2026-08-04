// Resolve a typed company name to a Companies record, creating it if needed.
//
// THE RULE: a company name you typed is never silently dropped. Before this, the
// contact form had a free-text Company box that mapped to nothing — you typed
// "BrightSunSolr", saved, and it vanished. The implicit gate was "create the
// company in Airtable first, then the contact", which nobody does mid-call, so
// employers ended up recorded nowhere.
//
// Entry always wins; cleanup happens afterwards. Creating a near-duplicate is
// recoverable (merge them) — losing what you typed is not, because you will not
// remember later that it was missed.
//
// MATCHING is deliberately conservative. Case and punctuation are ignored, and a
// trailing legal suffix (LLC, Inc, Ltd…) is ignored, because "BrightSunSolr" and
// "BrightSunSolr LLC" are the same company. Nothing fuzzier than that: guessing
// that "Genesis Group" is "Genesis Capital" would silently file a contact under
// the wrong counterparty, which is worse than a duplicate row.

import { TB, listRecordsLenient, airtableCreate } from './_airtable.js';

const COMPANIES_TBL = () => process.env.AIRTABLE_TABLE_COMPANIES || TB.COMPANIES;

const SUFFIX = /\b(llc|l\.l\.c|inc|incorporated|ltd|limited|corp|corporation|co|lp|llp|plc|gmbh|pty|sa|nv|bv)\.?$/i;

/** Normalised comparison key: case, punctuation and a trailing legal suffix. */
export function companyKey(name) {
  let s = String(name || '').trim().toLowerCase();
  s = s.replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 2 && SUFFIX.test(s); i++) s = s.replace(SUFFIX, '').trim();
  return s.replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Find or create companies for a list of typed names.
 *
 * Returns { ids, created, matched, possibleDuplicates }. `possibleDuplicates`
 * reports rows that ALREADY looked alike before this call — surfaced so the
 * review queue can offer a merge, never acted on automatically.
 */
export async function resolveCompanyNames(names, { create = true } = {}) {
  const wanted = (Array.isArray(names) ? names : [names])
    .map(n => String(n || '').trim())
    .filter(Boolean);

  const out = { ids: [], created: [], matched: [], possibleDuplicates: [] };
  if (!wanted.length) return out;

  let existing = [];
  try {
    existing = await listRecordsLenient(COMPANIES_TBL(), { fields: ['Name'] });
  } catch (e) {
    console.warn('[companies] list failed:', e.message);
    return out;
  }

  // key -> [records]. More than one entry per key means the base already holds
  // duplicates; that is a review item, not something to resolve by guessing.
  const byKey = new Map();
  for (const r of existing) {
    const k = companyKey(r.fields?.['Name']);
    if (!k) continue;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push({ id: r.id, name: r.fields?.['Name'] || '' });
  }

  for (const raw of wanted) {
    const key = companyKey(raw);
    if (!key) continue;

    const hits = byKey.get(key) || [];
    if (hits.length) {
      out.ids.push(hits[0].id);
      out.matched.push({ typed: raw, id: hits[0].id, name: hits[0].name });
      if (hits.length > 1) {
        out.possibleDuplicates.push({ key, records: hits });
      }
      continue;
    }

    if (!create) continue;

    try {
      const rec = await airtableCreate(COMPANIES_TBL(), { Name: raw });
      out.ids.push(rec.id);
      out.created.push({ id: rec.id, name: raw });
      byKey.set(key, [{ id: rec.id, name: raw }]);
    } catch (e) {
      // A failed company create must not fail the contact save. The person is
      // the record you were actually trying to keep.
      console.warn(`[companies] create "${raw}" failed:`, e.message);
    }
  }

  return out;
}
