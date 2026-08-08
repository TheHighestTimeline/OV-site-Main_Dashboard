// Company-name normalisation. THE single source of truth, shared by the UI and
// the functions bundle (netlify/functions/_companies.js re-exports it, the same
// shim pattern src/lib/stages.js uses).
//
// Two sides depend on this agreeing exactly:
//   • the server decides whether a typed company name is an existing record
//   • the Companies tab decides which rows to flag as possible duplicates
// If those two normalise differently, the tab flags a pair as duplicates that
// the server already considers the same record, or worse, misses a pair the
// server just silently created a second row for.
//
// MATCHING IS DELIBERATELY CONSERVATIVE. Case, punctuation and a trailing legal
// suffix are ignored, because "BrightSunSolr" and "BrightSunSolr LLC" are the
// same company. Nothing fuzzier than that: guessing that "Genesis Group" is
// "Genesis Capital" would file records under the wrong counterparty, which is
// worse than a duplicate row.

const SUFFIX = /\b(llc|l\.l\.c|inc|incorporated|ltd|limited|corp|corporation|co|lp|llp|plc|gmbh|pty|sa|nv|bv)\.?$/i;

/** Normalised comparison key: case, punctuation and a trailing legal suffix. */
export function companyKey(name) {
  let s = String(name || '').trim().toLowerCase();
  s = s.replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  // Twice, so "Acme Co Ltd" reduces the same as "Acme Ltd".
  for (let i = 0; i < 2 && SUFFIX.test(s); i++) s = s.replace(SUFFIX, '').trim();
  return s.replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Groups of records whose names normalise to the same key. */
export function findDuplicateGroups(companies, nameOf = (c) => c.name) {
  const byKey = new Map();
  for (const c of companies) {
    const k = companyKey(nameOf(c));
    if (!k) continue;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(c);
  }
  return [...byKey.values()].filter(g => g.length > 1);
}
