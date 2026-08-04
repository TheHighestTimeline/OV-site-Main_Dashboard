// Duplicate-contact detection.
//
// The old rule was "same email, or byte-identical name". That misses the two
// shapes duplicates actually take in this base:
//
//   • the same person entered twice with different addresses — a work address
//     on one row and a personal one on the other, so the email key never fires
//   • the same person with a punctuation or casing difference in the name
//     ("O'Brien" / "OBrien", "Bob  Shore" with a double space)
//
// and it also fires on a shape that is NOT a duplicate: two different people
// who genuinely share an email (an assistant's address on two colleagues, a
// shared info@ inbox). Merging those destroys a real contact.
//
// So: three keys, unioned, with a guard.
//
//   email        exact, lowercased
//   name         normalised — case, punctuation and repeated spaces folded out
//   phone        digits only, last 10, so +1 (555) 010-9999 matches 5550109999
//
// THE GUARD: an email match alone is not enough when the names are clearly
// different people. Sharing an inbox is common; being the same person under two
// unrelated names is not. A shared address with different names groups only if
// something else also matches.
//
// Everything here is a PROPOSAL. Nothing merges without a human picking a
// survivor on the merge screen, so the cost of a false positive is one glance,
// and the cost of a false negative is a permanently split relationship.

// Apostrophes and periods are DELETED, not turned into spaces, so "O'Brien"
// folds to "obrien" and matches "OBrien", and "J.R." folds to "jr". Everything
// else non-alphanumeric becomes a space, so a hyphenated "Mary-Jane" still
// matches the spaced "Mary Jane". Getting this backwards silently stops the
// whole detector from firing on the most common spelling difference there is.
const normName = (s) =>
  String(s || '').toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normPhone = (s) => {
  const digits = String(s || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
};

const normEmail = (s) => String(s || '').trim().toLowerCase();

/** First and last token of a name — the part that has to agree for a person. */
function nameEnds(s) {
  const parts = normName(s).split(' ').filter(Boolean);
  if (!parts.length) return '';
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1]}`;
}

/**
 * Groups of contacts that look like the same person.
 * Returns an array of arrays, each with two or more contacts.
 */
export function findContactDuplicates(contacts) {
  const parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const c of contacts) parent.set(c.id, c.id);

  const byEmail = new Map();
  const byName  = new Map();
  const byPhone = new Map();

  const push = (map, key, c) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(c);
  };

  for (const c of contacts) {
    push(byEmail, normEmail(c.email), c);
    push(byName,  nameEnds(c.name),   c);
    push(byPhone, normPhone(c.phone), c);
  }

  // Name and phone are unambiguous signals — link every pair sharing one.
  for (const group of [...byName.values(), ...byPhone.values()]) {
    for (let i = 1; i < group.length; i++) union(group[0].id, group[i].id);
  }

  // Email links only when the names are compatible, because a shared inbox is
  // a normal thing and merging two colleagues who both use info@ is not
  // recoverable. Compatible = the same normalised name, or one name is empty.
  for (const group of byEmail.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = nameEnds(group[i].name);
        const b = nameEnds(group[j].name);
        if (!a || !b || a === b) union(group[i].id, group[j].id);
      }
    }
  }

  const groups = new Map();
  for (const c of contacts) {
    const root = find(c.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(c);
  }

  return [...groups.values()]
    .filter(g => g.length > 1)
    // Biggest tangles first — they are the ones costing the most.
    .sort((a, b) => b.length - a.length);
}

/** Why a group was flagged, for the banner. */
export function duplicateReason(group) {
  const emails = new Set(group.map(c => normEmail(c.email)).filter(Boolean));
  const names  = new Set(group.map(c => nameEnds(c.name)).filter(Boolean));
  const phones = new Set(group.map(c => normPhone(c.phone)).filter(Boolean));
  const reasons = [];
  if (emails.size === 1 && group.every(c => c.email)) reasons.push('same email');
  if (names.size === 1) reasons.push('same name');
  if (phones.size === 1 && group.every(c => c.phone)) reasons.push('same phone');
  return reasons.join(' · ') || 'linked by a shared detail';
}

export const __internal = { normName, normPhone, normEmail, nameEnds };
